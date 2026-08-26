/**
 * Stream-level capture: intercepts `process.stdout.write` /
 * `process.stderr.write` so EVERY line the dev server (or any code in this
 * process) prints flows through the logger — regardless of whether it went
 * through `console.*`, a direct `process.stdout.write`, or an internal
 * Next.js logger.
 *
 * The line classifier's job here is ONLY field parsing (level, source tag),
 * never gating: an unrecognised line still flows through, tagged by the
 * stream it arrived on. Coverage is 100% by construction — a new Next.js
 * output shape cannot fall through.
 *
 * Design constraints:
 * - **Replace, never mirror.** Every complete incoming line is consumed and
 *   re-emitted exactly once — as the logger's formatted output. Nothing raw
 *   reaches the terminal. Incomplete lines and pure ANSI control sequences
 *   (cursor moves, spinner redraws) still pass through untouched: they are
 *   redraw artifacts, not log lines.
 * - **Reentrancy guard.** The logger's own output (reporters writing to
 *   stdout) re-enters the hooked stream; the guard routes those bytes
 *   straight to the real write instead of re-capturing them.
 * - **Complete lines only.** Bytes are buffered until `\n`; spinner-style
 *   partial updates pass through unprocessed (they are redraw artifacts,
 *   not log lines).
 * - **Idempotent.** HMR re-runs `instrumentation.ts`; a `globalThis` guard
 *   keeps the hook single-instance.
 */

import type { Logger } from "../core/backend.js";
import type { LogFunction } from "../core/types.js";
import { runWithoutConsoleDispatch } from "./console.js";
import {
  ANSI_REGEX,
  ERROR_MARKERS,
  HTTP_REQUEST_LOG_CAPTURE,
  INFO_MARKERS,
  NEXT_TAG,
  WARN_MARKERS,
  stripInfoPrefix,
} from "./next.js";

/** Marks the hook state on globalThis across HMR reloads. */
const CAPTURE_SYMBOL = "__nextLoggerStdoutCapture" as const;

interface CapturedLine {
  /** Minimal parsed shape: level for the logger call, tag for the message. */
  level: "info" | "warn" | "error" | "debug";
  tag: string;
  message: string;
}

/**
 * Matches the logger's OWN console output (consola default format:
 * `7:12:32 PM [next.js] message`) so the mirror of an already-logged line is
 * never re-captured. JSON lines are the structured reporters' output (pino,
 * the JSON reporter) — same rule. Anything the pipeline itself printed is
 * invisible to the capture.
 */
export const OWN_OUTPUT =
  /^\d{1,2}:\d{2}:\d{2}\s+(AM|PM)\s*\[|^\s*(ERROR|WARN|INFO|LOG|DEBUG|[ℹ⨯✖✔✓✗])\s*\[|^\[[^\]]*\]\s*(ERROR|WARN|INFO|LOG|DEBUG|[ℹ⨯✖✔✓✗])|^\s*\{["}].*\}\s*$|^\s*\{\s*"(level|time|pid|msg|name)"/;

/**
 * Parses one complete line into a loggable shape. Unrecognised shapes
 * return `{ level: "info", tag: "stdout"|"stderr" }` — the line still flows.
 */
export function parseLine(line: string, stream: "stdout" | "stderr"): CapturedLine {
  const stripped = line.replace(ANSI_REGEX, "").trim();
  if (stripped === "") return { level: "info", tag: stream, message: line };

  // stderr carries errors/warnings by convention; markers refine it.
  const base: CapturedLine = {
    level: stream === "stderr" ? "error" : "info",
    tag: stream === "stderr" ? "stderr" : "stdout",
    message: line,
  };

  // ▲✓● → info; ⚠ → warn; ✗ → error (ℹ prefix allowed).
  const head = stripInfoPrefix(stripped);
  if (INFO_MARKERS.some((m) => head.startsWith(m))) {
    return { ...base, tag: NEXT_TAG, message: line };
  }
  if (WARN_MARKERS.some((m) => head.startsWith(m))) {
    return { level: "warn", tag: NEXT_TAG, message: line };
  }
  if (ERROR_MARKERS.some((m) => head.startsWith(m))) {
    return { level: "error", tag: NEXT_TAG, message: line };
  }

  // Request log: GET /path 500 in 12ms — status carries the level.
  const req = head.match(HTTP_REQUEST_LOG_CAPTURE);
  if (req) {
    const status = Number(req[3]);
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    return { level, tag: NEXT_TAG, message: line };
  }

  // ERROR/WARN anywhere in the first run of the line bumps the level.
  if (/^(\[[^\]]*\]\s*)*ERROR\b/.test(head) || head.startsWith("Error:")) {
    return { ...base, level: "error" };
  }
  if (/^(\[[^\]]*\]\s*)*WARN\b/.test(head)) {
    return { ...base, level: "warn" };
  }
  return base;
}

/**
 * Replaces `stream.write` with a line-capturing hook. Returns a disposer that
 * restores the original write.
 *
 * Complete lines are dispatched through `logger` (tagged by the
 * {@link parseLine} classification); the original bytes are consumed instead
 * of mirrored. Incomplete lines and pure ANSI control sequences (cursor
 * moves, spinner redraws) pass through untouched: they are redraw artifacts,
 * not log lines. The logger's own output (reporters writing to the stream)
 * re-enters the hook and is routed straight to the real write — the
 * reentrancy guard.
 */
function hookStreamWrite(
  stream: NodeJS.WriteStream,
  name: "stdout" | "stderr",
  logger: Logger,
): () => void {
  const real = stream.write.bind(stream);
  let dispatching = false;
  let buffer = "";

  stream.write = ((chunk: Uint8Array | string, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (dispatching) {
      return real(chunk as never, ...(rest as [never?, never?]));
    }

    // Split into complete lines; keep the tail buffered. Control-only
    // chunks (cursor moves, redraw) pass through untouched.
    const hadPending = buffer.length > 0;
    buffer += text;
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    const complete = parts.length;

    if (complete > 0) {
      dispatching = true;
      let produced = false;
      try {
        runWithoutConsoleDispatch(() => {
          for (const part of parts) {
            const clean = part.replace(ANSI_REGEX, "").trim();
            // The pipeline's own formatted output is the RESULT of a
            // replacement — it goes straight out, not back through.
            if (OWN_OUTPUT.test(clean)) {
              real(part + "\n");
              produced = true;
              continue;
            }
            if (clean === "") continue; // noise: blank lines are dropped
            const parsed = parseLine(part, name);
            // The tag rides the logger's tag mechanism (same as the
            // console patch): reporters see a STRUCTURED tag field and
            // a clean message — never "[tag] " glued into the text.
            const tagged = logger.withTag(parsed.tag);
            const fn: LogFunction | undefined = tagged[parsed.level];
            fn?.call(tagged, parsed.message);
            produced = true;
          }
        });
      } finally {
        dispatching = false;
      }
      // The incoming chunk carried complete lines and each of them was
      // re-emitted (or dropped as noise) — the raw bytes are consumed.
      if (produced || !hadPending) {
        // Honor the stream write contract: the caller's callback must run
        // once the data is handed off. The replacement output already went
        // out synchronously, so the callback fires immediately — exactly
        // like a non-hooked write on a synchronous (TTY/pipe) stream.
        const cb = rest.find(
          (arg): arg is (err?: Error | null) => void =>
            typeof arg === "function",
        );
        cb?.();
        return true;
      }
    }

    return real(chunk as never, ...(rest as [never?, never?]));
  }) as typeof stream.write;

  return () => {
    stream.write = real;
  };
}

/**
 * Installs the stdout/stderr capture. Idempotent; returns a disposer that
 * restores the original writes (used by tests).
 */
export function captureStreams(logger: Logger): () => void {
  const g = globalThis as Record<string, unknown>;
  const prev = g[CAPTURE_SYMBOL] as (() => void) | undefined;
  if (prev) return prev;

  const disposers = (["stdout", "stderr"] as const).map((name) =>
    hookStreamWrite(process[name], name, logger),
  );

  const dispose = (): void => {
    for (const d of disposers) d();
    delete g[CAPTURE_SYMBOL];
  };
  g[CAPTURE_SYMBOL] = dispose;
  return dispose;
}

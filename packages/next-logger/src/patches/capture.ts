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

import type { Logger } from "../backend.js";
import type { LogFunction } from "../types.js";
import { runWithoutConsoleDispatch } from "./console.js";

/** Marks the hook state on globalThis across HMR reloads. */
const CAPTURE_SYMBOL = "__nextLoggerStdoutCapture" as const;

interface CapturedLine {
  /** Minimal parsed shape: level for the logger call, tag for the message. */
  level: "info" | "warn" | "error" | "debug";
  tag: string;
  message: string;
}

const ANSI = /\u001b\[[0-9;]*m/g;

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
  const stripped = line.replace(ANSI, "").trim();
  if (stripped === "") return { level: "info", tag: stream, message: line };

  // stderr carries errors/warnings by convention; markers refine it.
  const base: CapturedLine = {
    level: stream === "stderr" ? "error" : "info",
    tag: stream === "stderr" ? "stderr" : "stdout",
    message: line,
  };

  // ▲✓● → info; ⚠ and WARN → warn; ✗ and ERROR → error (ℹ prefix allowed).
  let head = stripped;
  if (head.startsWith("ℹ")) head = head.slice(1).trimStart();
  if (head.startsWith("▲") || head.startsWith("✓") || head.startsWith("●")) {
    return { ...base, tag: "next.js", message: line };
  }
  if (head.startsWith("⚠")) {
    return { level: "warn", tag: "next.js", message: line };
  }
  if (head.startsWith("✗")) {
    return { level: "error", tag: "next.js", message: line };
  }

  // Request log: GET /path 500 in 12ms — status carries the level.
  const req = head.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(\d{3})\s+in\s+/);
  if (req) {
    const status = Number(req[3]);
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    return { level, tag: "next.js", message: line };
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
 * Installs the stdout/stderr capture. Idempotent; returns a disposer that
 * restores the original writes (used by tests).
 */
export function captureStreams(logger: Logger): () => void {
  const g = globalThis as Record<string, unknown>;
  const prev = g[CAPTURE_SYMBOL] as (() => void) | undefined;
  if (prev) return prev;

  const disposers: Array<() => void> = [];

  for (const name of ["stdout", "stderr"] as const) {
    const stream = process[name];
    const real = stream.write.bind(stream);
    // Route the logger's own writes past the capture (reentrancy guard):
    // anything logged while a capture dispatch is running goes straight out.
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
              const clean = part.replace(ANSI, "").trim();
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
        if (produced || (complete > 0 && !hadPending)) {
          return true;
        }
      }

      return real(chunk as never, ...(rest as [never?, never?]));
    }) as typeof stream.write;

    disposers.push(() => {
      stream.write = real;
    });
  }

  const dispose = (): void => {
    for (const d of disposers) d();
    delete g[CAPTURE_SYMBOL];
  };
  g[CAPTURE_SYMBOL] = dispose;
  return dispose;
}

/**
 * Pino reporter for consola — bridges every consola log entry into a
 * [pino](https://getpino.io) logger instance.
 *
 * For teams already invested in pino (transports, pipelines, tooling), this
 * reporter lets `next-logger` feed pino without giving up consola's level
 * control, console patching, or other reporters. Consola remains the single
 * sink; pino becomes one of its outputs.
 *
 * ## Optional dependency
 *
 * `pino` is an **optional** peer dependency. The reporter resolves it lazily
 * via dynamic `import()` inside `log()`. If the consumer hasn't installed
 * `pino`, the import rejects, the reporter catches it, and subsequent calls
 * become a silent no-op — the logger keeps working.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts
 * import { init, getLogger } from "@vsfedorenko/next-logger";
 * import { createPinoReporter } from "@vsfedorenko/next-logger/reporters/pino";
 *
 * init();
 * const logger = getLogger();
 * logger.addReporter(createPinoReporter({ options: { name: "api" } }));
 * ```
 *
 * Safe to attach unconditionally — a missing `pino` install makes the
 * reporter a silent no-op.
 */

import type { ConsolaReporter, LogObject } from "consola/core";

/// <reference path="./pino-types.d.ts" />

/**
 * Pino level names, in consola's ascending severity order.
 *
 * Mirrored here (not imported from `pino`) so this module has **zero static
 * dependency** on pino — the type alias is compile-time only and erased in
 * the output.
 */
type PinoLevel = "error" | "warn" | "info" | "debug" | "trace";

/**
 * Map consola's numeric level to a pino level name.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
 *
 * `log` (2) collapses to pino `info` — pino has no `log` level by default.
 */
const LEVEL_MAP: readonly PinoLevel[] = [
  "error", // 0 — error / fatal
  "warn", // 1 — warn
  "info", // 2 — log
  "info", // 3 — info / success / ready
  "debug", // 4 — debug
  "trace", // 5 — trace / verbose
];

/**
 * A pino logger instance — the subset of level methods this reporter calls.
 *
 * Defined locally to avoid importing from `pino` at build time.
 */
interface PinoLogger {
  error(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  warn(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  info(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  debug(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  trace(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
}

/**
 * `pino()` factory options — the subset relevant to this reporter. Any
 * consumer-supplied options are forwarded verbatim to the real `pino()`
 * call at runtime.
 */
interface PinoOptions {
  name?: string;
  level?: string;
  [key: string]: unknown;
}

/**
 * The structured payload this reporter forwards to a pino level method.
 *
 * - `tag` — the consola tag, passed as pino context (a top-level field on
 *   the merge object).
 * - `msg` — the primary message string (string args + `logObj.message`).
 * - `args` — structured (object/Error) arguments, merged into the context.
 *
 * Pure data — no pino dependency, fully testable in isolation.
 */
export interface PinoContext {
  level: PinoLevel;
  msg: string;
  tag: string;
  args: Record<string, unknown>;
}

/**
 * Build a pino-bound context from a consola log object.
 *
 * Pure function — no pino dependency, fully testable in isolation.
 *
 * - `logObj.message` and string arguments are joined into `msg`.
 * - `Error` instances are captured as `{ name, message, stack }`.
 * - Plain objects are merged under their argument position.
 * - `tag` is passed through (empty → `""`).
 */
export function logObjectToPinoContext(logObj: LogObject): PinoContext {
  const level = LEVEL_MAP[Math.max(0, Math.min(5, logObj.level))] ?? "info";

  const args = logObj.args ?? [];
  const messageParts: string[] = [];
  const structured: Record<string, unknown> = {};

  if (logObj.message) messageParts.push(logObj.message);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      structured[`arg_${i}`] = {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      };
    } else if (typeof arg === "object" && arg !== null) {
      structured[`arg_${i}`] = arg;
    } else {
      messageParts.push(String(arg));
    }
  }

  return {
    level,
    msg: messageParts.join(" "),
    tag: logObj.tag ?? "",
    args: structured,
  };
}

/**
 * Options for {@link createPinoReporter}.
 */
export interface PinoReporterOptions {
  /**
   * Options forwarded verbatim to the lazily-resolved `pino()` factory
   * (e.g. `name`, `level`, serializers, transports).
   *
   * Ignored when {@link logger} is supplied.
   */
  options?: PinoOptions;
  /**
   * A pre-built pino logger instance. When supplied, the reporter skips the
   * lazy `pino()` factory call and writes directly to this instance — useful
   * when the consumer already configures a logger elsewhere (transports,
   * destinations, custom levels).
   */
  logger?: PinoLogger;
}

/**
 * Cached dynamic-import result — resolved once, reused on every `log()` call.
 *
 * `null` marks a cached failure (`pino` not installed) so we don't retry the
 * failing import on every log call.
 */
let pinoPromise: Promise<PinoLogger | null> | null = null;

/**
 * Lazily build a pino logger instance from `options`.
 *
 * The import + factory are attempted once and cached:
 * - If the consumer has `pino` installed → resolves to a logger instance.
 * - If not installed → the rejection is caught and `null` is cached, making
 *   subsequent `log()` calls a silent no-op without retrying.
 */
function getPino(options: PinoOptions | undefined): Promise<PinoLogger | null> {
  if (pinoPromise) return pinoPromise;
  pinoPromise = import("pino")
    .then((mod) => {
      const factory = mod.default;
      return factory(options) as PinoLogger;
    })
    .catch(() => null);
  return pinoPromise;
}

/**
 * Create a consola reporter that forwards every log entry to a pino logger.
 *
 * The reporter is safe to attach unconditionally:
 * - `pino` not installed → silent no-op (cached failed import).
 * - Installed → a logger is built once from `options` (or a supplied
 *   `logger` instance is used directly) and reused.
 */
export function createPinoReporter(
  opts: PinoReporterOptions = {},
): ConsolaReporter {
  return {
    log(logObj: LogObject) {
      const ctx = logObjectToPinoContext(logObj);

      // Pre-built instance — synchronous, no dynamic import needed.
      if (opts.logger) {
        writePino(opts.logger, ctx);
        return;
      }

      void getPino(opts.options).then((pino) => {
        if (pino) writePino(pino, ctx);
      });
    },
  };
}

/**
 * Forward a resolved context to a pino logger instance.
 *
 * Pino's level methods accept `(mergeObject, msg, ...interpolationValues)`.
 * We pass the structured args + tag as the merge object and `msg` as the
 * primary message.
 */
function writePino(logger: PinoLogger, ctx: PinoContext): void {
  const merge: Record<string, unknown> = { ...ctx.args };
  if (ctx.tag) merge.tag = ctx.tag;

  const fn = logger[ctx.level];
  if (typeof fn === "function") {
    fn.call(logger, merge, ctx.msg);
  }
}

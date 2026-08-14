/**
 * Built-in pino backend adapter.
 *
 * Registers the `"pino"` backend via {@link defineBackend}. The adapter lazily
 * requires `pino`, creates a pino instance, and wraps it in a Logger-compatible
 * adapter that maps consola's numeric levels (0–5) onto pino's level methods.
 *
 * `pino` is an **optional** peer dependency — the lazy require happens only
 * when this backend is actually used. If pino is not installed, the adapter
 * throws a clear error.
 *
 * ## Level mapping
 *
 * | Consola level           | Pino method |
 * |-------------------------|-------------|
 * | `error` / `fatal` (0)   | `error`     |
 * | `warn` (1)              | `warn`      |
 * | `log` (2)               | `info`      |
 * | `info` / `success` (3)  | `info`      |
 * | `debug` (4)             | `debug`     |
 * | `trace` / `verbose` (5) | `trace`     |
 */

import { defineBackend, type Logger } from "../backend";

/**
 * Pino level method names, in consola's ascending severity order.
 */
type PinoLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * A pino logger instance — the subset of level methods this adapter calls.
 */
interface PinoLogger {
  level: string;
  error(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  warn(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  info(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  debug(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  trace(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  fatal(obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): PinoLogger;
}

/**
 * The `pino()` factory.
 */
interface PinoFactory {
  (options?: Record<string, unknown>): PinoLogger;
}

/**
 * Map consola's numeric level → pino level method name.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
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
 * Clamps a consola numeric level to `[0, 5]` and maps to a pino level name.
 */
export function consolaLevelToPino(level: number): PinoLevel {
  const clamped = Math.max(0, Math.min(5, Math.floor(level)));
  return LEVEL_MAP[clamped] ?? "info";
}

/**
 * Wraps a pino logger instance in a {@link Logger}-compatible adapter.
 *
 * - `level` is exposed as the numeric consola level (0–5), reverse-mapped from
 *   pino's current level label.
 * - Each `Logger` method maps to the corresponding pino level method.
 * - `withTag(tag)` returns a child logger via `pino.child({ tag })`.
 */
export function wrapPino(pino: PinoLogger): Logger {
  return {
    get level(): number {
      return pinoLabelToConsola(pino.level);
    },
    trace: (...args: unknown[]): void => pino.trace({}, joinArgs(args)),
    debug: (...args: unknown[]): void => pino.debug({}, joinArgs(args)),
    info: (...args: unknown[]): void => pino.info({}, joinArgs(args)),
    warn: (...args: unknown[]): void => pino.warn({}, joinArgs(args)),
    error: (...args: unknown[]): void => pino.error({}, joinArgs(args)),
    fatal: (...args: unknown[]): void => pino.fatal({}, joinArgs(args)),
    log: (...args: unknown[]): void => pino.info({}, joinArgs(args)),
    withTag(tag: string): Logger {
      return wrapPino(pino.child({ tag }));
    },
  };
}

/** Reverse-map a pino level label to a consola numeric level (0–5). */
export function pinoLabelToConsola(label: string): number {
  switch (label) {
    case "fatal":
      return 0;
    case "error":
      return 0;
    case "warn":
      return 1;
    case "info":
      return 3;
    case "debug":
      return 4;
    case "trace":
      return 5;
    default:
      return 3;
  }
}

/**
 * Join variadic args into a message string for pino's `msg` parameter.
 *
 * Pino's level methods accept `(mergeObject, msg)`. We join string/number
 * primitives into a space-separated message; objects are stringified inline
 * for simplicity (the JSON reporter is the recommended structured path).
 */
function joinArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/**
 * Build the pino backend adapter factory.
 *
 * Lazily requires `pino` on first call. Throws a clear error when pino is not
 * installed.
 */
export function createPinoBackend(): (
  options: Record<string, unknown>,
) => Logger {
  return (options: Record<string, unknown>): Logger => {
    const pino = loadPinoSync();
    const instance = pino(options);
    return wrapPino(instance);
  };
}

/**
 * Synchronously require `pino`. Throws a helpful error when missing.
 *
 * Uses `require()` rather than dynamic `import()` because the backend adapter
 * must return a `Logger` synchronously from `buildLogger()`.
 */
function loadPinoSync(): PinoFactory {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("pino") as PinoFactory;
  } catch {
    throw new Error(
      '@vsfedorenko/next-logger: backend "pino" requires the "pino" package. ' +
        "Install it: npm install pino",
    );
  }
}

/** Register the pino backend under the name `"pino"`. Idempotent. */
export function registerPinoBackend(): void {
  defineBackend("pino", createPinoBackend());
}

// Auto-register on module load.
registerPinoBackend();

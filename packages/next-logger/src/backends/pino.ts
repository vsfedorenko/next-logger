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

import { defineBackend, type Logger } from "../core/backend.js";
import { LOG_METHODS, type LogMethodName } from "../core/wrap-logger.js";
import { requirePeerSync } from "./peer-require.js";

/**
 * Pino level method names, in consola's ascending severity order.
 */
type PinoLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

/**
 * A pino logger instance — the subset of level methods this adapter calls.
 * Declared locally (self-contained) so the emitted d.ts never depends on
 * pino's types being installed.
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
type PinoFactory = (options?: Record<string, unknown>) => PinoLogger;

/**
 * {@link Logger} method → pino level method.
 *
 * `fatal` keeps its own pino level; `log` collapses to `info` (pino has no
 * `log` level).
 */
const METHOD_MAP: Readonly<Record<LogMethodName, PinoLevel>> = {
  trace: "trace",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal",
  log: "info", // pino has no `log` level — `log` (2) collapses to `info`
};

/**
 * Wraps a pino logger instance in a {@link Logger}-compatible adapter.
 *
 * - `level` is exposed as the numeric consola level (0–5), reverse-mapped from
 *   pino's current level label.
 * - Each `Logger` method maps to the corresponding pino level method.
 * - `withTag(tag)` returns a child logger via `pino.child({ tag })`.
 */
export function wrapPino(pino: PinoLogger): Logger {
  const methods = {} as Record<LogMethodName, (...args: unknown[]) => void>;
  for (const method of LOG_METHODS) {
    // Index at call time and invoke as a method — pino's level methods read
    // state off `this` (msgPrefix et al.); a detached reference loses it.
    const pinoLevel = METHOD_MAP[method];
    methods[method] = (...args: unknown[]): void => {
      pino[pinoLevel]({}, joinArgs(args));
    };
  }

  return {
    get level(): number {
      return pinoLabelToConsola(pino.level);
    },
    ...methods,
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
    const pino = requirePeerSync("pino", "pino", () => require("pino") as PinoFactory);
    const instance = pino(options);
    return wrapPino(instance);
  };
}

/** Register the pino backend under the name `"pino"`. Idempotent. */
export function registerPinoBackend(): void {
  // The factory itself is lazy — pino is only loaded when the backend is
  // actually selected. This prevents Turbopack from failing at build time when
  // pino is not installed (it tries to bundle all reachable require() calls).
  defineBackend("pino", createPinoBackend());
}

// Auto-register on module load — the factory closure captures nothing eagerly.
registerPinoBackend();

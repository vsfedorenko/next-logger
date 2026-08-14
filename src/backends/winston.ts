/**
 * Built-in winston backend adapter.
 *
 * Registers the `"winston"` backend via {@link defineBackend}. The adapter
 * lazily requires `winston`, creates a logger via `winston.createLogger`, and
 * wraps it in a Logger-compatible adapter that maps consola's numeric levels
 * (0–5) onto winston's level methods.
 *
 * `winston` is an **optional** peer dependency — the lazy require happens only
 * when this backend is actually used. If winston is not installed, the adapter
 * throws a clear error.
 *
 * ## Level mapping
 *
 * | Consola level           | Winston method |
 * |-------------------------|----------------|
 * | `error` / `fatal` (0)   | `error`        |
 * | `warn` (1)              | `warn`         |
 * | `log` (2)               | `info`         |
 * | `info` / `success` (3)  | `info`         |
 * | `debug` (4)             | `debug`        |
 * | `trace` / `verbose` (5) | `verbose`      |
 */

import { defineBackend, type Logger } from "../backend";

/**
 * Winston level method names, in consola's ascending severity order.
 */
type WinstonLevel = "error" | "warn" | "info" | "debug" | "verbose";

/**
 * A winston logger instance — the subset of level methods this adapter calls.
 */
interface WinstonLogger {
  level: string;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  verbose(...args: unknown[]): void;
  child(options: Record<string, unknown>): WinstonLogger;
}

/**
 * The `winston.createLogger` factory.
 */
interface WinstonFactory {
  createLogger(options?: Record<string, unknown>): WinstonLogger;
}

/**
 * Map consola's numeric level → winston level method name.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
 */
const LEVEL_MAP: readonly WinstonLevel[] = [
  "error", // 0 — error / fatal
  "warn", // 1 — warn
  "info", // 2 — log
  "info", // 3 — info / success / ready
  "debug", // 4 — debug
  "verbose", // 5 — trace / verbose
];

/**
 * Clamps a consola numeric level to `[0, 5]` and maps to a winston level name.
 */
export function consolaLevelToWinston(level: number): WinstonLevel {
  const clamped = Math.max(0, Math.min(5, Math.floor(level)));
  return LEVEL_MAP[clamped] ?? "info";
}

/**
 * Wraps a winston logger instance in a {@link Logger}-compatible adapter.
 *
 * - `level` is exposed as the numeric consola level (0–5), reverse-mapped from
 *   winston's current level label.
 * - Each `Logger` method maps to the corresponding winston level method.
 * - `withTag(tag)` returns a child logger via `winston.child({ tag })`.
 */
export function wrapWinston(winston: WinstonLogger): Logger {
  return {
    get level(): number {
      return winstonLabelToConsola(winston.level);
    },
    trace: (...args: unknown[]): void => {
      winston.verbose(...args);
    },
    debug: (...args: unknown[]): void => {
      winston.debug(...args);
    },
    info: (...args: unknown[]): void => {
      winston.info(...args);
    },
    warn: (...args: unknown[]): void => {
      winston.warn(...args);
    },
    error: (...args: unknown[]): void => {
      winston.error(...args);
    },
    fatal: (...args: unknown[]): void => {
      winston.error(...args);
    },
    log: (...args: unknown[]): void => {
      winston.info(...args);
    },
    withTag(tag: string): Logger {
      return wrapWinston(winston.child({ tag }));
    },
  };
}

/** Reverse-map a winston level label to a consola numeric level (0–5). */
export function winstonLabelToConsola(label: string): number {
  switch (label) {
    case "error":
      return 0;
    case "warn":
      return 1;
    case "info":
      return 3;
    case "debug":
      return 4;
    case "verbose":
      return 5;
    default:
      return 3;
  }
}

/**
 * Build the winston backend adapter factory.
 *
 * Lazily requires `winston` on first call. Throws a clear error when winston
 * is not installed.
 */
export function createWinstonBackend(): (
  options: Record<string, unknown>,
) => Logger {
  return (options: Record<string, unknown>): Logger => {
    const winston = loadWinstonSync();
    const instance = winston.createLogger(options);
    return wrapWinston(instance);
  };
}

/**
 * Synchronously require `winston`. Throws a helpful error when missing.
 *
 * Uses `require()` rather than dynamic `import()` because the backend adapter
 * must return a `Logger` synchronously from `buildLogger()`.
 */
function loadWinstonSync(): WinstonFactory {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("winston") as WinstonFactory;
  } catch {
    throw new Error(
      '@vsfedorenko/next-logger: backend "winston" requires the "winston" package. ' +
        "Install it: npm install winston",
    );
  }
}

/** Register the winston backend under the name `"winston"`. Idempotent. */
export function registerWinstonBackend(): void {
  // The factory itself is lazy — winston is only loaded when the backend is
  // actually selected. This prevents Turbopack from failing at build time when
  // winston is not installed (it tries to bundle all reachable require()
  // calls).
  defineBackend("winston", (options: Record<string, unknown>): Logger => {
    const winston = loadWinstonSync();
    const instance = winston.createLogger(options);
    return wrapWinston(instance);
  });
}

// Auto-register on module load — the factory closure captures nothing eagerly.
registerWinstonBackend();

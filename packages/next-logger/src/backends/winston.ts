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

import { defineBackend, type Logger } from "../core/backend.js";
import { LOG_METHODS, type LogMethodName } from "../core/wrap-logger.js";
import { requirePeerSync } from "./peer-require.js";

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
 * The `winston.createLogger` factory plus the loggers container.
 */
interface WinstonFactory {
  createLogger(options?: Record<string, unknown>): WinstonLogger;
  /** `winston.loggers` — the container of named loggers. */
  loggers?: {
    get?(id: string): WinstonLogger | undefined;
  };
}

/**
 * Extract a usable default logger instance from the winston module namespace.
 *
 * `require("winston")` exposes the default logger as `log` — a callable proxy
 * WITHOUT level-method properties (winston ≥3.17 laziness). The real instance
 * lives in the container under the id `"default"`. Falls back to the `log`
 * callable (older winston shapes expose methods directly) before giving up.
 */
function resolveDefaultLogger(
  winston: WinstonFactory & { log?: unknown },
): WinstonLogger | null {
  const containerLogger = winston.loggers?.get?.("default");
  if (
    containerLogger &&
    typeof (containerLogger as unknown as Record<string, unknown>).info ===
      "function"
  ) {
    return containerLogger;
  }

  const callable = winston.log;
  if (
    callable &&
    typeof (callable as Record<string, unknown>).info === "function"
  ) {
    return callable as unknown as WinstonLogger;
  }

  return null;
}

/**
 * {@link Logger} method → winston level method.
 *
 * Equivalent to indexing {@link LEVEL_MAP} with each method's consola level
 * (trace=5, debug=4, info=3, warn=1, error/fatal=0, log=2), spelled out
 * directly for readability.
 */
const METHOD_MAP: Readonly<Record<LogMethodName, WinstonLevel>> = {
  trace: "verbose",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "error",
  log: "info",
};

/**
 * Wraps a winston logger instance in a {@link Logger}-compatible adapter.
 *
 * - `level` is exposed as the numeric consola level (0–5), reverse-mapped from
 *   winston's current level label.
 * - Each `Logger` method maps to the corresponding winston level method.
 * - `withTag(tag)` returns a child logger via `winston.child({ tag })`.
 */
export function wrapWinston(winston: WinstonLogger): Logger {
  const methods = {} as Record<LogMethodName, (...args: unknown[]) => void>;
  for (const method of LOG_METHODS) {
    // Invoke as a method on the instance — the level methods may read state
    // off `this`; a detached reference loses it.
    const winstonLevel = METHOD_MAP[method];
    methods[method] = (...args: unknown[]): void => {
      winston[winstonLevel](...args);
    };
  }

  return {
    get level(): number {
      return winstonLabelToConsola(winston.level);
    },
    ...methods,
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
 *
 * Options are JSON-serialisable (they cross the build→runtime boundary via an
 * env var), so transport objects cannot be passed through. Resolution order:
 *
 * 1. `options.logger` (string) — id of a logger from the winston **container**
 *    (`winston.loggers`). The application creates it once at startup with
 *    real transports: `winston.loggers.add("app", { transports: [...] })`,
 *    then selects it via `backendOptions: { logger: "app" }`. `options.level`
 *    still overrides the level.
 * 2. Transport config present (`transports`/`format`/`silent` keys) —
 *    `winston.createLogger(options)` directly (for programmatic use).
 * 3. Otherwise — the container's `"default"` logger, or the module-level
 *    `winston.log` proxy, so `winston.configure()` before `init()` works.
 */
export function createWinstonBackend(): (
  options: Record<string, unknown>,
) => Logger {
  return (options: Record<string, unknown>): Logger => {
    const winston = requirePeerSync("winston", "winston", () => require("winston") as WinstonFactory);

    let instance: WinstonLogger;
    if (typeof options.logger === "string") {
      const containerLogger = winston.loggers?.get?.(options.logger);
      if (!containerLogger) {
        throw new Error(
          `@vsfedorenko/next-logger: backend "winston" option logger="${options.logger}" ` +
            "does not exist in winston.loggers. Create it before init(): " +
            `winston.loggers.add("${options.logger}", { transports: [...] }).`,
        );
      }
      instance = containerLogger;
    } else if (
      "transports" in options ||
      "format" in options ||
      "silent" in options
    ) {
      instance = winston.createLogger(options);
    } else {
      const defaultLogger = resolveDefaultLogger(winston);
      if (!defaultLogger) {
        throw new Error(
          '@vsfedorenko/next-logger: backend "winston" could not resolve a ' +
            "winston logger. Pass backendOptions.logger (a winston.loggers id), " +
            "or create the container logger / winston.configure() before init().",
        );
      }
      instance = defaultLogger;
    }
    if (typeof options.level === "string") {
      instance.level = options.level;
    }
    return wrapWinston(instance);
  };
}

/** Register the winston backend under the name `"winston"`. Idempotent. */
export function registerWinstonBackend(): void {
  // The factory itself is lazy — winston is only loaded when the backend is
  // actually selected. This prevents Turbopack from failing at build time when
  // winston is not installed (it tries to bundle all reachable require()
  // calls).
  defineBackend("winston", createWinstonBackend());
}

// Auto-register on module load — the factory closure captures nothing eagerly.
registerWinstonBackend();

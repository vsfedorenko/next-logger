/**
 * Patches the global `console.*` methods so every call routes through the
 * logger — the single interception point that captures BOTH application
 * console output AND Next.js' internal logs (which `log.ts` funnels through
 * `console.*`).
 *
 * Each call is classified via {@link isNextLog}: lines carrying one of Next's
 * marker symbols (`▲`/`✓`/`⚠`) are tagged `next.js`, everything else `console`.
 * This restores the source distinction without monkeypatching Next's module
 * (which Turbopack isolates into a separate bundle instance).
 *
 * Call explicitly via {@link init} — not a side-effect module.
 */

import type { Logger } from "../backend.js";
import type { LogFunction } from "../types.js";
import { isNextLog } from "./next.js";
import { skipEmpty } from "./util.js";

/**
 * The console methods this patch overwrites.
 */
export const CONSOLE_METHODS = [
  "log",
  "debug",
  "info",
  "warn",
  "error",
] as const;

/** A console method name we patch. */
export type ConsoleMethodName = (typeof CONSOLE_METHODS)[number];

/**
 * Maps a console method name to the corresponding logger method bound to a
 * child logger tagged `tag`. `console.log` and `console.info` both map to
 * logger `info`. The result is wrapped in {@link skipEmpty}.
 *
 * Works with any {@link Logger} implementation via duck typing — the logger
 * only needs `info`, `warn`, `error`, `debug`, and `withTag`.
 *
 * Pure — exported so the routing can be unit-tested without touching the global
 * `console`.
 */
export function routeConsoleMethod(
  method: ConsoleMethodName | string,
  logger: Logger,
  tag: string,
): LogFunction {
  const child = logger.withTag(tag);
  return skipEmpty(selectLoggerMethod(method, child));
}

function selectLoggerMethod(
  method: string,
  logger: Logger,
): LogFunction {
  switch (method) {
    case "error":
      return logger.error.bind(logger) as LogFunction;
    case "warn":
      return logger.warn.bind(logger) as LogFunction;
    case "debug":
      return logger.debug.bind(logger) as LogFunction;
    case "log":
    case "info":
      return logger.info.bind(logger) as LogFunction;
    default:
      return logger.info.bind(logger) as LogFunction;
  }
}

// Re-entrancy latch: while a patched console method dispatches into the
// logger, nested console.* calls coming BACK from the logger (a custom
// backend writing to console.log, a reporter that echoes to stdout) bypass
// the patch and go straight to the original console methods. Without this,
// console.log → logger.info → console.log recurses until the stack overflows
// (RangeError: Maximum call stack size exceeded) with no hint at the cause.
let dispatching = false;

/**
 * Overwrites `console.{log,debug,info,warn,error}` so calls route through the
 * given logger — tagged `next.js` for Next's own log lines and `console` for
 * everything else.
 *
 * Re-entrant calls from inside the logger are forwarded to the ORIGINAL
 * console methods: output is preserved, the dispatch loop is broken.
 */
export function patchConsole(logger: Logger): void {
  const originals = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  for (const method of CONSOLE_METHODS) {
    console[method] = ((...args: unknown[]) => {
      if (dispatching) {
        originals[method](...args);
        return;
      }
      dispatching = true;
      try {
        const tag = isNextLog(args) ? "next.js" : "console";
        routeConsoleMethod(method, logger, tag)(...args);
      } finally {
        dispatching = false;
      }
    }) as Console[ConsoleMethodName];
  }
}

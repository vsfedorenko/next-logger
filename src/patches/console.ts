/**
 * Patches the global `console.*` methods so every call routes through the
 * shared consola instance tagged `console`.
 *
 * This captures diagnostic output from third-party libraries and application
 * code that calls `console.log`/`console.error` directly — funnelling it
 * through the same level-controllable sink as Next's own logs.
 *
 * This is a side-effect module — importing it applies the patch exactly once.
 */

import type { ConsolaInstance } from "consola";
import { logger } from "../logger";
import type { LogFunction } from "../types";
import { skipEmpty } from "./util";

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
 * Maps a console method name to the corresponding consola log function.
 *
 * `console.log` and `console.info` both map to consola `info` (matching the
 * original's behaviour). The returned function is bound to a child logger
 * tagged with `tag`, so every call is namespaced.
 *
 * Pure function — given a consola instance and a tag, returns the routing
 * function. Exported so the level mapping can be unit-tested without touching
 * the global `console`.
 */
export function routeConsoleMethod(
  method: ConsoleMethodName | string,
  consola: ConsolaInstance,
  tag: string,
): LogFunction {
  const child = consola.withTag(tag);

  const bound: LogFunction = selectConsolaMethod(method, child);
  return skipEmpty(bound);
}

/**
 * Selects the consola method matching a console method name.
 *
 * The bound function is returned directly; consola's methods accept the same
 * `(...args: unknown[])` shape as {@link LogFunction}.
 */
function selectConsolaMethod(method: string, consola: ConsolaInstance): LogFunction {
  switch (method) {
    case "error":
      return consola.error.bind(consola) as LogFunction;
    case "warn":
      return consola.warn.bind(consola) as LogFunction;
    case "debug":
      return consola.debug.bind(consola) as LogFunction;
    case "log":
    case "info":
      return consola.info.bind(consola) as LogFunction;
    default:
      // Unknown method name — default to info (same as the original).
      return consola.info.bind(consola) as LogFunction;
  }
}

/**
 * Applies the console patch. Overwrites `console.log`, `console.debug`,
 * `console.info`, `console.warn`, `console.error` with bound consola methods.
 *
 * @param tagOverride override the `console` tag (useful for tests).
 */
export function patchConsole(tagOverride?: string): void {
  const tag = tagOverride ?? "console";

  for (const method of CONSOLE_METHODS) {
    const routed = routeConsoleMethod(method, logger, tag);
    console[method] = routed as Console[ConsoleMethodName];
  }
}

// Apply on import (side effect), matching the original's
// `require('./patches/console')` semantics.
patchConsole();

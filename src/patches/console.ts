/**
 * Patches the global `console.*` methods so every call routes through the
 * consola instance — the single interception point that captures BOTH
 * application console output AND Next.js' internal logs (which `log.ts`
 * funnels through `console.*`).
 *
 * Each call is classified via {@link isNextLog}: lines carrying one of Next's
 * marker symbols (`▲`/`✓`/`⚠`) are tagged `next.js`, everything else `console`.
 * This restores the source distinction without monkeypatching Next's module
 * (which Turbopack isolates into a separate bundle instance).
 *
 * Call explicitly via {@link init} — not a side-effect module.
 */

import type { ConsolaInstance } from "consola";
import type { LogFunction } from "../types";
import { isNextLog } from "./next";
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
 * Maps a console method name to the corresponding consola log function bound
 * to a child logger tagged `tag`. `console.log` and `console.info` both map to
 * consola `info`. The result is wrapped in {@link skipEmpty}.
 *
 * Pure — exported so the routing can be unit-tested without touching the global
 * `console`.
 */
export function routeConsoleMethod(
  method: ConsoleMethodName | string,
  consola: ConsolaInstance,
  tag: string,
): LogFunction {
  const child = consola.withTag(tag);
  return skipEmpty(selectConsolaMethod(method, child));
}

function selectConsolaMethod(
  method: string,
  consola: ConsolaInstance,
): LogFunction {
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
      return consola.info.bind(consola) as LogFunction;
  }
}

/**
 * Overwrites `console.{log,debug,info,warn,error}` so calls route through the
 * given consola instance, tagged `next.js` for Next's own log lines and
 * `console` for everything else.
 */
export function patchConsole(consola: ConsolaInstance): void {
  for (const method of CONSOLE_METHODS) {
    console[method] = ((...args: unknown[]) => {
      const tag = isNextLog(args) ? "next.js" : "console";
      routeConsoleMethod(method, consola, tag)(...args);
    }) as Console[ConsoleMethodName];
  }
}

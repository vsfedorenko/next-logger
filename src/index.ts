/**
 * # @vsfedorenko/next-logger
 *
 * A universal logging kit for Next.js. Wraps the global `console.*` (which
 * Next.js' own internal logger also funnels through) so all diagnostic output
 * flows through a single level-controllable consola sink — without monkey
 * patching Next's module (which is unreachable under Turbopack).
 *
 * ## Usage
 *
 * Wrap your Next config and call `init()` from instrumentation:
 *
 * ```ts
 * // next.config.ts
 * import { withLogger } from "@vsfedorenko/next-logger";
 *
 * export default withLogger({ consola: { level: 4 } })({
 *   // ...your next config
 * });
 * ```
 *
 * ```ts
 * // instrumentation.ts (project root)
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === "nodejs") {
 *     const { init } = await import("@vsfedorenko/next-logger");
 *     init();
 *   }
 * }
 * ```
 *
 * `init()` patches `console.*`. To skip patching console, pass
 * `{ console: false }`.
 *
 * ## Configuration
 *
 * `withLogger(options)` serialises `options` into the `NEXT_LOGGER_CONFIG` env
 * var via Next.js' validated `env` config key (no "Unrecognized key" warning),
 * inlined at build time and read back at runtime. Only serialisable consola
 * options are supported (level, formatOptions, …):
 *
 * ```ts
 * withLogger({ consola: { level: 4, formatOptions: { date: false } } })
 * ```
 *
 * ## Log level
 *
 * Without `withLogger`, the level resolves from (in order) `LOG_LEVEL` or
 * `NEXT_PUBLIC_LOG_LEVEL` (numeric or named: silent/fatal/error/warn/info/log/
 * debug/trace/verbose), falling back to `3` (info).
 */

// Build-time Next.js config wrapper.
export { withLogger } from "./withLogger";
export type { LoggerPluginOptions } from "./withLogger";

// Runtime initialisation + instance access.
export { init, getLogger } from "./init";
export type { InitOptions } from "./init";

// Logger + config internals.
export { buildLogger } from "./logger";
export { loadConfig, resolveLoggerConfig, CONFIG_ENV_VAR } from "./config";
export type { NextLoggerConfig, ResolvedConfig } from "./config";
export { defaultConsolaOptions, resolveFormat } from "./defaults";
export type { LogFormat } from "./defaults";

// JSON reporter (server-side structured logging).
export { createJsonReporter } from "./reporters/json";

// Console-sink patch + Next-log classifier.
export { patchConsole, routeConsoleMethod, CONSOLE_METHODS } from "./patches/console";
export type { ConsoleMethodName } from "./patches/console";
export { isNextLog } from "./patches/next";
export { isEmptyMessage, skipEmpty } from "./patches/util";

// Shared types.
export type { LogFunction, NextLogFn, NextLogModule } from "./types";

// Pass-through consola types for consumer convenience (type-only re-export —
// consumers don't need to depend on consola directly for type imports).
export type {
  ConsolaInstance,
  ConsolaOptions,
  ConsolaReporter,
  FormatOptions,
  InputLogObject,
  LogLevel,
  LogObject,
  LogType,
} from "consola";

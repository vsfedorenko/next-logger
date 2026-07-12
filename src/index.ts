/**
 * # next-log
 *
 * A universal logging kit for Next.js. Monkeypatches Next.js' internal
 * logger (`next/dist/build/output/log`) and the global `console.*` so all
 * diagnostic output flows through a single level-controllable sink —
 * consola by default, with reporters for Sentry, JSON, and more — without a
 * custom Next.js server.
 *
 * ## Usage
 *
 * ### Instrumentation hook (Next.js ≥ 9.3 / instrumentationHook)
 *
 * ```ts
 * // instrumentation.ts (project root)
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === "nodejs") {
 *     await import("next-log");
 *   }
 * }
 * ```
 *
 * The default import applies both patches (Next logger + console). To patch
 * only Next's logger:
 *
 * ```ts
 * await import("next-log/presets/next-only");
 * ```
 *
 * ### `-r` preload
 *
 * ```sh
 * node -r next-log server.js
 * ```
 *
 * ## Configuration
 *
 * Optional `next-log.config.ts` (discovered from cwd upward):
 *
 * ```ts
 * import { createConsola } from "consola";
 *
 * export default {
 *   consola: createConsola({ level: 4 }), // full custom instance
 * };
 * ```
 *
 * Or partial options (merged with defaults):
 *
 * ```ts
 * export default {
 *   consola: { level: 4, formatOptions: { date: false } },
 * };
 * ```
 *
 * Or a factory (receives the library's default options):
 *
 * ```ts
 * import type { ConsolaOptions } from "consola";
 *
 * export default {
 *   consola: (defaults: Partial<ConsolaOptions>) =>
 *     createConsola({ ...defaults, level: 5 }),
 * };
 * ```
 *
 * ## Log level
 *
 * Without a config file, the level resolves from (in order) `LOG_LEVEL` or
 * `NEXT_PUBLIC_LOG_LEVEL` (numeric or named: silent/fatal/error/warn/info/log/
 * debug/trace/verbose), falling back to `3` (info).
 */

import "./presets/all";

// Core instance + config.
export { logger } from "./logger";
export { loadConfig } from "./config";
export type { NextLoggerConfig, ResolvedConfig } from "./config";
export { defaultConsolaOptions, resolveFormat } from "./defaults";
export type { LogFormat } from "./defaults";

// JSON reporter (server-side structured logging).
export { createJsonReporter } from "./reporters/json";

// Patching API.
export { patchNext, routeNextMethod, NEXT_PREFIXES } from "./patches/next";
export type { NextMethodName } from "./patches/next";
export { patchConsole, routeConsoleMethod, CONSOLE_METHODS } from "./patches/console";
export type { ConsoleMethodName } from "./patches/console";
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

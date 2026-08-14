/**
 * # @vsfedorenko/next-logger
 *
 * A universal logging kit for Next.js. Wraps the global `console.*` (which
 * Next.js' own internal logger also funnels through) so all diagnostic output
 * flows through a single level-controllable sink — without monkey patching
 * Next's module (which is unreachable under Turbopack).
 *
 * Backend-agnostic: the core abstraction is a minimal {@link Logger} interface.
 * Any logging backend (consola, pino, winston, …) can be registered as a named
 * adapter via {@link defineBackend} and selected through config.
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
 * ## Backends
 *
 * The default backend is `"consola"`. To use a different one:
 *
 * ```ts
 * withLogger({ backend: "pino", backendOptions: { name: "api" } })
 * ```
 *
 * Register a custom backend via {@link defineBackend}.
 *
 * ## Configuration
 *
 * `withLogger(options)` serialises `options` into the `NEXT_LOGGER_CONFIG` env
 * var via Next.js' validated `env` config key (no "Unrecognized key" warning),
 * inlined at build time and read back at runtime. Only serialisable options
 * are supported (level, formatOptions, …):
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

// Backend-agnostic core abstraction.
export {
  defineBackend,
  getBackend,
  hasBackend,
  removeBackend,
} from "./backend";
export type { Logger, BackendAdapter } from "./backend";

// Built-in backend registration helpers.
// NOTE: registerPinoBackend is NOT exported from the main entry to avoid
// pulling pino (an optional peer dep) into the main bundle. Import it
// explicitly from "@vsfedorenko/next-logger/backends/pino" when needed.
export { registerConsolaBackend } from "./backends/consola";

// Build-time Next.js config wrapper.
export { withLogger } from "./withLogger";
export type { LoggerPluginOptions } from "./withLogger";

// Runtime initialisation + instance access.
export { init, getLogger } from "./init";
export type { InitOptions } from "./init";

// Logger + config internals.
export { buildLogger, buildConsolaLogger } from "./logger";
export { loadConfig, resolveLoggerConfig, CONFIG_ENV_VAR } from "./config";
export type { NextLoggerConfig, ResolvedConfig } from "./config";
export { defaultConsolaOptions, resolveFormat } from "./defaults";
export type { LogFormat } from "./defaults";

// JSON reporter (server-side structured logging).
export { createJsonReporter } from "./reporters/json";

// Redaction reporter — middleware that strips sensitive data before it reaches
// a wrapped reporter (JSON, pretty, Sentry breadcrumb, …).
export {
  createRedactionReporter,
  DEFAULT_PATTERNS as REDACTION_DEFAULT_PATTERNS,
  DEFAULT_KEYS as REDACTION_DEFAULT_KEYS,
  DEFAULT_REPLACEMENT as REDACTION_DEFAULT_REPLACEMENT,
} from "./reporters/redaction";
export type { RedactionOptions } from "./reporters/redaction";

// Pino reporter — bridge to pino for teams already invested in pino.
// NOT exported from the main entry — import explicitly from
// "@vsfedorenko/next-logger/reporters/pino" to avoid bundling pino when unused.

// Request-scoped logging (AsyncLocalStorage).
export {
  runWithLogContext,
  getCurrentLogContext,
  createRequestLogger,
} from "./request-scoped";
export type { LogContext } from "./request-scoped";

// Log sampling — rate-limit noisy loggers by dropping a fraction of calls.
export {
  createSamplingWrapper,
  resolveSampleRate,
  sampleLogger,
  DEFAULT_SAMPLE_RATE,
} from "./sampling";

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

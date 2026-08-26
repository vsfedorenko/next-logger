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
} from "./core/backend.js";
export type { Logger, BackendAdapter } from "./core/backend.js";

// Plugin system — named reporter factories + config presets.
export {
  defineReporter,
  getReporter,
  hasReporter,
  removeReporter,
  definePreset,
  getPreset,
  hasPreset,
  removePreset,
  resolveReporters,
} from "./config/plugins.js";
export type { ReporterFactory, ReporterSpec, ReporterRef, LoggerPreset } from "./config/plugins.js";

// Built-in backend registration helpers.
// NOTE: registerPinoBackend is NOT exported from the main entry to avoid
// pulling pino (an optional peer dep) into the main bundle. Import it
// explicitly from "@vsfedorenko/next-logger/backends/pino" when needed.
export { registerConsolaBackend } from "./backends/consola.js";

// Build-time Next.js config wrapper.
export { withLogger } from "./config/withLogger.js";
export type { LoggerPluginOptions } from "./config/withLogger.js";

// Runtime initialisation + instance access.
export { init, getLogger } from "./init.js";
export type { InitOptions } from "./init.js";

// Logger + config internals.
export { buildLogger } from "./config/logger.js";
export { loadConfig, resolveLoggerConfig, CONFIG_ENV_VAR } from "./config/config.js";
export type { NextLoggerConfig, ResolvedConfig } from "./config/config.js";
export { defaultConsolaOptions, resolveFormat } from "./core/defaults.js";
export type { LogFormat } from "./core/defaults.js";

// JSON reporter (server-side structured logging).
export { createJsonReporter } from "./reporters/json.js";

// Redaction reporter — middleware that strips sensitive data before it reaches
// a wrapped reporter (JSON, pretty, Sentry breadcrumb, …).
export {
  createRedactionReporter,
  DEFAULT_PATTERNS as REDACTION_DEFAULT_PATTERNS,
  DEFAULT_KEYS as REDACTION_DEFAULT_KEYS,
  DEFAULT_REPLACEMENT as REDACTION_DEFAULT_REPLACEMENT,
} from "./reporters/redaction.js";
export type { RedactionOptions } from "./reporters/redaction.js";

// Pino reporter — bridge to pino for teams already invested in pino.
// NOT exported from the main entry — import explicitly from
// "@vsfedorenko/next-logger/reporters/pino" to avoid bundling pino when unused.

// Request-scoped logging (AsyncLocalStorage).
export {
  runWithLogContext,
  getCurrentLogContext,
  createRequestLogger,
} from "./features/request-scoped.js";
export type { LogContext } from "./features/request-scoped.js";

// Log sampling — rate-limit noisy loggers by dropping a fraction of calls.
export {
  createSamplingWrapper,
  resolveSampleRate,
  sampleLogger,
  DEFAULT_SAMPLE_RATE,
} from "./features/sampling.js";

// Correlation IDs — automatic per-request ID propagation on top of the
// request-scoped LogContext.
export {
  correlationMiddleware,
  getCorrelationId,
  getOrCreateCorrelationId,
  setCorrelationId,
  CORRELATION_HEADER,
  CORRELATION_CONTEXT_KEY,
} from "./features/correlation.js";

// Structured metadata — attach a fixed bag of fields to every log entry
// produced by a logger (logger.with() fluent API).
export {
  withMetadata,
  resolveMetadataFromEnv,
  METADATA_ENV_VAR,
} from "./features/metadata.js";

// Console-sink patch + Next-log classifier.
export { patchConsole, routeConsoleMethod, CONSOLE_METHODS } from "./patches/console.js";
export type { ConsoleMethodName } from "./patches/console.js";
export { isNextLog } from "./patches/next.js";
export { isEmptyMessage, skipEmpty } from "./patches/util.js";

// Shared types.
export type { LogFunction, NextLogFn, NextLogModule } from "./core/types.js";

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
} from "consola/core";

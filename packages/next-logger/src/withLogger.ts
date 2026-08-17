import type { ConsolaOptions } from "consola";
import { CONFIG_ENV_VAR } from "./config";

/**
 * Options for {@link withLogger} — the build-time, serialisable form of the
 * logger config. Delivered to the runtime as JSON via the `NEXT_LOGGER_CONFIG`
 * env var (Next.js' `env` config key inlines it at build time).
 */
export interface LoggerPluginOptions {
  /**
   * Name of the registered backend adapter (default: `"consola"`).
   *
   * Use this to select a non-consola backend (e.g. `"pino"`) or a custom
   * backend registered via {@link defineBackend}.
   */
  readonly backend?: string;
  /**
   * Serialisable options forwarded to the backend adapter when `backend` is
   * set. These are passed verbatim to the adapter's factory function.
   */
  readonly backendOptions?: Record<string, unknown>;
  /**
   * Partial consola options merged over the library defaults
   * (`{ level, formatOptions: { date, compact } }`). Only serialisable options
   * are supported here — a live `ConsolaInstance` or factory cannot cross the
   * build→runtime boundary.
   *
   * Ignored when `backend` is set (use `backendOptions` instead).
   */
  readonly consola?: Partial<ConsolaOptions>;
  /**
   * Name of a preset registered at runtime via `definePreset()`. The preset
   * bundles backend selection + reporter references; explicit keys in this
   * object win over the preset's. Serialisable (a plain string).
   */
  readonly preset?: string;
  /**
   * Reporters to attach to the built consola logger, referenced by factory
   * name (registered at runtime via `defineReporter()`) plus serialisable
   * options. Ignored for non-consola backends.
   */
  readonly reporters?: readonly import("./plugins").ReporterSpec[];
}

/**
 * Next.js config wrapper (higher-order function), used like the other `withX`
 * plugins (`withPWA`, `withBundleAnalyzer`):
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
 * It injects `NEXT_LOGGER_CONFIG` (the serialised options) into the config's
 * `env` key — a validated, warning-free key that Next.js inlines into
 * `process.env` at build time. {@link init} reads it back at runtime. Works
 * under both webpack and Turbopack, and avoids the "Unrecognized key" warning
 * that a custom top-level `logger` key would trigger.
 *
 * To use a non-consola backend:
 *
 * ```ts
 * withLogger({ backend: "pino", backendOptions: { name: "api" } })({...});
 * ```
 */
export function withLogger(options: LoggerPluginOptions = {}) {
  const serialised = JSON.stringify(options);
  return function <C extends object>(nextConfig: C): C {
    const existingEnv =
      ((nextConfig as Record<string, unknown>).env as Record<string, string> | undefined) ?? {};
    return {
      ...nextConfig,
      env: { ...existingEnv, [CONFIG_ENV_VAR]: serialised },
    } as C;
  };
}

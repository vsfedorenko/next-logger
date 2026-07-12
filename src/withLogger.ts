import type { ConsolaOptions } from "consola";
import { CONFIG_ENV_VAR } from "./config";

/**
 * Options for {@link withLogger} — the build-time, serialisable form of the
 * logger config. Delivered to the runtime as JSON via the `NEXT_LOGGER_CONFIG`
 * env var (Next.js' `env` config key inlines it at build time).
 */
export interface LoggerPluginOptions {
  /**
   * Partial consola options merged over the library defaults
   * (`{ level, formatOptions: { date, compact } }`). Only serialisable options
   * are supported here — a live `ConsolaInstance` or factory cannot cross the
   * build→runtime boundary.
   */
  readonly consola?: Partial<ConsolaOptions>;
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

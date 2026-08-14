import type { ConsolaInstance, ConsolaOptions } from "consola";
import { defaultConsolaOptions } from "./defaults";
import { isConsolaInstance } from "./types";

/**
 * Shape of the config passed to {@link withLogger}, serialised to JSON and
 * delivered to the runtime via the `NEXT_LOGGER_CONFIG` env var (inlined at
 * build time by Next.js' `env` config key).
 *
 * Because the value crosses a build→runtime boundary as JSON, `consola` can
 * only be a partial options object here (not a live instance or factory). The
 * full instance/factory forms remain supported when {@link resolveLoggerConfig}
 * is called directly with such a value (e.g. in tests).
 *
 * The `backend` field selects a named logging backend adapter (registered via
 * {@link defineBackend}). Defaults to `"consola"`. `backendOptions` carries
 * serialisable options forwarded to the backend adapter.
 */
export interface NextLoggerConfig {
  consola?:
    | ConsolaInstance
    | Partial<ConsolaOptions>
    | ((defaults: Partial<ConsolaOptions>) => ConsolaInstance);
  /** Name of the registered backend adapter (default: `"consola"`). */
  backend?: string;
  /** Serialisable options forwarded to the backend adapter. */
  backendOptions?: Record<string, unknown>;
}

/**
 * Discriminated result of config resolution.
 */
export type ResolvedConfig =
  | { readonly kind: "instance"; readonly instance: ConsolaInstance }
  | { readonly kind: "options"; readonly options: Partial<ConsolaOptions> }
  | {
      readonly kind: "backend";
      readonly backend: string;
      readonly options: Record<string, unknown>;
    };

/** The env var that carries the serialised {@link NextLoggerConfig}. */
export const CONFIG_ENV_VAR = "NEXT_LOGGER_CONFIG";

/**
 * Resolves a raw config value into a {@link ResolvedConfig}. Pure — exported
 * for unit testing.
 *
 * Resolution order:
 * 1. `backend` field set → `{ kind: "backend", backend, options }`.
 * 2. `consola` is a live `ConsolaInstance` or factory → `{ kind: "instance" }`.
 * 3. `consola` is a partial options object → `{ kind: "options" }`.
 * 4. Absent → `{ kind: "options", options: defaultConsolaOptions }`.
 */
export function resolveLoggerConfig(
  raw: NextLoggerConfig | undefined,
): ResolvedConfig {
  // 1. Explicit backend selection (new engine-agnostic path).
  if (raw?.backend) {
    return {
      kind: "backend",
      backend: raw.backend,
      options: raw.backendOptions ?? {},
    };
  }

  const def = raw?.consola;

  if (def == null) {
    return { kind: "options", options: defaultConsolaOptions };
  }
  if (typeof def === "function") {
    const factory = def as (defaults: Partial<ConsolaOptions>) => ConsolaInstance;
    return { kind: "instance", instance: factory(defaultConsolaOptions) };
  }
  if (isConsolaInstance(def)) {
    return { kind: "instance", instance: def };
  }
  return {
    kind: "options",
    options: mergeOptions(def as Partial<ConsolaOptions>),
  };
}

/**
 * Reads the `logger` config delivered by {@link withLogger} via the
 * `NEXT_LOGGER_CONFIG` env var. Falls back to the bare defaults when the var is
 * absent or unparseable.
 *
 * The access is a LITERAL `process.env.NEXT_LOGGER_CONFIG` (not computed via
 * the {@link CONFIG_ENV_VAR} constant) so that Next.js' build-time `env`
 * inlining (DefinePlugin) substitutes the value into the instrumentation
 * bundle — a computed `process.env[const]` reference would NOT be inlined and
 * would read `undefined` at runtime.
 *
 * Sync and free of any `next` dependency.
 */
export function loadConfig(): ResolvedConfig {
  const json = process.env.NEXT_LOGGER_CONFIG;
  if (!json) return resolveLoggerConfig(undefined);
  try {
    return resolveLoggerConfig(JSON.parse(json) as NextLoggerConfig);
  } catch {
    return resolveLoggerConfig(undefined);
  }
}

function mergeOptions(extra: Partial<ConsolaOptions>): Partial<ConsolaOptions> {
  return {
    ...defaultConsolaOptions,
    ...extra,
    formatOptions: {
      ...defaultConsolaOptions.formatOptions,
      ...extra.formatOptions,
    },
  };
}

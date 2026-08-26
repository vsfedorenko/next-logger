import type { ConsolaInstance, ConsolaOptions } from "consola/core";
import { defaultConsolaOptions } from "../core/defaults.js";
import { getPreset, type ReporterRef } from "./plugins.js";

/**
 * Type guard: narrows `unknown` to `ConsolaInstance` by checking for the
 * two methods the config resolution depends on (`.withTag()` + `.log()`).
 *
 * The `consola` config key may be a partial options object, a factory, or a
 * fully built instance — this tells them apart.
 */
function isConsolaInstance(value: unknown): value is ConsolaInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ConsolaInstance).withTag === "function" &&
    typeof (value as ConsolaInstance).log === "function"
  );
}

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
 *
 * `preset` names a config bundle registered at runtime via `definePreset()`;
 * `reporters` references reporter factories registered via
 * `defineReporter()` by name — see ./plugins.ts.
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
  /**
   * Name of a preset registered at runtime via `definePreset()` — expands to
   * the preset's backend/reporters config. Explicit keys in this object win
   * over the preset's.
   */
  preset?: string;
  /**
   * Reporter references to attach, each either a registered factory name
   * string (shorthand for `{ name }`) or a `{ name, options }` spec. See
   * {@link ReporterRef}.
   */
  reporters?: readonly ReporterRef[];
}

/**
 * Discriminated result of config resolution.
 *
 * Every variant carries the (already expanded) reporter references verbatim
 * so {@link buildLogger} can attach them without re-reading the raw config;
 * {@link resolveReporters} normalises strings to specs at resolution time.
 */
export type ResolvedConfig =
  | {
      readonly kind: "instance";
      readonly instance: ConsolaInstance;
      readonly reporters?: readonly ReporterRef[];
    }
  | {
      readonly kind: "options";
      readonly options: Partial<ConsolaOptions>;
      readonly reporters?: readonly ReporterRef[];
    }
  | {
      readonly kind: "backend";
      readonly backend: string;
      readonly options: Record<string, unknown>;
      readonly reporters?: readonly ReporterRef[];
    };

/** The env var that carries the serialised {@link NextLoggerConfig}. */
export const CONFIG_ENV_VAR = "NEXT_LOGGER_CONFIG";

/**
 * Resolves a raw config value into a {@link ResolvedConfig}. Pure — exported
 * for unit testing.
 *
 * Preset expansion happens first: `preset: "production"` looks up the preset
 * registered via `definePreset()` and merges its fields under the raw config's
 * own keys (explicit wins). Then the usual resolution order applies:
 *
 * 1. `backend` field set → `{ kind: "backend", backend, options }`.
 * 2. `consola` is a live `ConsolaInstance` or factory → `{ kind: "instance" }`.
 * 3. `consola` is a partial options object → `{ kind: "options" }`.
 * 4. Absent → `{ kind: "options", options: defaultConsolaOptions }`.
 *
 * `reporters` (own or inherited from the preset) is carried through verbatim;
 * {@link buildLogger} resolves the specs into live reporters.
 */
export function resolveLoggerConfig(
  raw: NextLoggerConfig | undefined,
): ResolvedConfig {
  // 0. Expand a named preset, then layer the raw config's own keys on top.
  const merged = expandPreset(raw);
  const reporters = merged.reporters ? { reporters: merged.reporters } : {};

  // 1. Explicit backend selection (new engine-agnostic path).
  if (merged.backend) {
    return {
      kind: "backend",
      backend: merged.backend,
      options: merged.backendOptions ?? {},
      ...reporters,
    };
  }

  const def = merged.consola;

  if (def == null) {
    return {
      kind: "options",
      options: defaultConsolaOptions,
      ...reporters,
    };
  }
  if (typeof def === "function") {
    const factory = def as (defaults: Partial<ConsolaOptions>) => ConsolaInstance;
    return {
      kind: "instance",
      instance: factory(defaultConsolaOptions),
      ...reporters,
    };
  }
  if (isConsolaInstance(def)) {
    return {
      kind: "instance",
      instance: def,
      ...reporters,
    };
  }
  return {
    kind: "options",
    options: mergeOptions(def as Partial<ConsolaOptions>),
    ...reporters,
  };
}

/**
 * Expands `raw.preset` (if any) and layers the raw config's own keys over it.
 *
 * Explicit raw keys always win over the preset. The preset's `consola` options
 * merge shallowly *under* the raw config's own consola options (raw wins on
 * conflicting keys). Unknown preset names throw via {@link getPreset} — a typo
 * in `withLogger({ preset: "prodution" })` must fail loudly at init, not
 * silently drop the whole config.
 */
function expandPreset(raw: NextLoggerConfig | undefined): NextLoggerConfig {
  if (!raw?.preset) return raw ?? {};

  const preset = getPreset(raw.preset);

  // Consola options merge shallowly when both sides are plain option bags;
  // a live instance or factory in the raw config wins outright (spreading
  // either would destroy it).
  let consola: NextLoggerConfig["consola"];
  if (raw.consola === undefined) {
    consola = preset.consola;
  } else if (
    typeof raw.consola === "object" &&
    !isConsolaInstance(raw.consola)
  ) {
    consola = { ...preset.consola, ...raw.consola };
  } else {
    consola = raw.consola;
  }

  return {
    ...preset,
    ...raw,
    consola,
    reporters: raw.reporters ?? preset.reporters,
  };
}

/**
 * Reads the `logger` config delivered by {@link withLogger} via the
 * `NEXT_LOGGER_CONFIG` env var. Falls back to the bare defaults only when the
 * var is absent or not valid JSON; resolution errors (e.g. an unknown preset)
 * propagate to the caller — see {@link resolveLoggerConfig}.
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
  let raw: NextLoggerConfig;
  try {
    raw = JSON.parse(json) as NextLoggerConfig;
  } catch {
    return resolveLoggerConfig(undefined);
  }
  // Resolution errors (unknown preset, wrong-shape reporter refs, …) must
  // propagate: `withLogger` delivers the config via this env var, and a typo
  // like `preset: "prodution"` has to fail loudly at init — swallowing it
  // here would silently drop the WHOLE config to defaults.
  return resolveLoggerConfig(raw);
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

import { lilconfigSync, defaultLoadersSync, type LoaderSync } from "lilconfig";
import type { ConsolaInstance, ConsolaOptions } from "consola";
import { defaultConsolaOptions } from "./defaults";
import { isConsolaInstance } from "./types";

/**
 * Loader for `.ts` config files.
 *
 * Uses `jiti` when available (the standard transpile-on-require used by
 * Nuxt/consola/tailwind). `jiti` is an optional peer dependency — when absent,
 * a clear error is thrown pointing to the missing package.
 *
 * Lazily required so the default path (no `.ts` config) never pays the jiti
 * import cost.
 */
const tsLoader: LoaderSync = (filepath: string): unknown => {
  const jiti = tryRequireJiti();
  if (jiti === null) {
    throw new Error(
      `next-log: cannot load TypeScript config "${filepath}" — install "jiti" (optional peer dependency).`,
    );
  }
  return jiti(filepath);
};

/**
 * Resolves the `jiti` callable if installed, or returns `null`.
 *
 * `jiti` v2 exports `createJiti`; the returned {@link Jiti} instance extends
 * `NodeRequire`, so it is directly callable as `jiti(filepath)`.
 */
function tryRequireJiti(): ((id: string) => unknown) | null {
  try {
    const mod = require("jiti") as typeof import("jiti");
    const jiti = mod.createJiti(__filename);
    return jiti as unknown as (id: string) => unknown;
  } catch {
    return null;
  }
}

// Only register a loader for `.ts`; lilconfig's `defaultLoadersSync` handles
// `.js`/`.cjs`/`.json` natively via `require(filepath)` / `JSON.parse`.
const loaders: Record<string, LoaderSync> = {
  ...defaultLoadersSync,
  ".ts": tsLoader,
};

/**
 * Shape of a `next-log.config.{js,ts,cjs}` file.
 *
 * The `consola` key may be:
 *   - a {@link ConsolaInstance} (complete custom backend — used directly), or
 *   - a partial {@link ConsolaOptions} object merged on top of the defaults, or
 *   - a factory `(defaults) => ConsolaInstance` (full control, receives the
 *     library's default options as a starting point).
 */
export interface NextLoggerConfig {
  consola?:
    | ConsolaInstance
    | Partial<ConsolaOptions>
    | ((defaults: Partial<ConsolaOptions>) => ConsolaInstance);
}

/**
 * Discriminated result of config discovery.
 *
 *   - `kind: "instance"` — the config supplied a consola instance or a factory
 *     that produced one; use it directly.
 *   - `kind: "options"` — the config supplied a partial options object (or no
 *     config at all); build a consola from these merged options.
 */
export type ResolvedConfig =
  | { readonly kind: "instance"; readonly instance: ConsolaInstance }
  | { readonly kind: "options"; readonly options: Partial<ConsolaOptions> };

/**
 * Searches for `next-log.config.{ts,js,cjs,...}` from cwd upward.
 *
 * Always returns a value: either a built consola instance (when the config
 * supplied one or a factory) or the options object to build from (the config's
 * partial options merged with defaults, or the bare defaults when no config
 * exists).
 */
export function loadConfig(): ResolvedConfig {
  const explorer = lilconfigSync("next-log", {
    searchPlaces: [
      "next-log.config.ts",
      "next-log.config.js",
      "next-log.config.cjs",
      ".next-logrc.ts",
      ".next-logrc.js",
      ".next-logrc.cjs",
      ".next-logrc",
      ".next-logrc.json",
      "package.json",
    ],
    loaders,
  });

  const result = explorer.search();
  const raw = result?.config as NextLoggerConfig | undefined;
  const def = raw?.consola;

  // No config, or config without a `consola` key → bare defaults.
  if (def == null) {
    return { kind: "options", options: defaultConsolaOptions };
  }

  // Factory — caller receives the library defaults, returns a consola.
  if (typeof def === "function") {
    const factory = def as (defaults: Partial<ConsolaOptions>) => ConsolaInstance;
    return { kind: "instance", instance: factory(defaultConsolaOptions) };
  }

  // Consola instance — use as-is (type guard narrows safely).
  if (isConsolaInstance(def)) {
    return { kind: "instance", instance: def };
  }

  // Partial options object — merge with defaults (formatOptions nested).
  const extra = def as Partial<ConsolaOptions>;
  return {
    kind: "options",
    options: mergeOptions(extra),
  };
}

/** Merges a partial options object with the library defaults. */
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

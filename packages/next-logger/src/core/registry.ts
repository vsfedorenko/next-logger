/**
 * Named-registry factory — the define/get/has/remove pattern shared by
 * backends, reporter factories, and config presets.
 *
 * Each registry stores values under a name, validates the registration shape
 * at the registration site (a wrong-shaped value must fail loudly there, not
 * later as a raw TypeError inside `init()`), and resolves unknown names with
 * the available names listed. Error message wording is parameterised so each
 * registry keeps its exact public messages.
 */

/** Renders registry names for "Available: …" error messages — `none` when empty. */
function listNames(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : "none";
}

/** Configuration for {@link createRegistry}. */
export interface RegistryConfig<V> {
  /** Registry kind — `"backend"`, `"reporter"`, `"preset"`. Forms the `defineX` name in messages. */
  kind: string;
  /** Display name of the registered value — `"adapter"`, `"factory"`, `"preset"`. */
  paramLabel: string;
  /** Shape description for the invalid-value error — e.g. `"an adapter function"`. */
  valueKind: string;
  /** Tail sentence of the invalid-value error, explaining the expected shape. */
  valueDetail: string;
  /** Completes `Use defineX() to register …` in the unknown-name error. */
  article: string;
  /** Shape check for the registered value. */
  isValidValue(value: V): boolean;
}

/** A named registry — see {@link createRegistry}. */
export interface Registry<V> {
  /** Register `value` under `name`. Re-registering a name replaces the value. */
  define(name: string, value: V): void;
  /** Get the value registered under `name`, or throw with the names listed. */
  get(name: string): V;
  /** Check whether `name` is registered. */
  has(name: string): boolean;
  /** Remove `name` (mainly for testing). Returns `true` when a value was removed. */
  remove(name: string): boolean;
}

export function createRegistry<V>(config: RegistryConfig<V>): Registry<V> {
  const values = new Map<string, V>();
  const defineName = `define${config.kind.charAt(0).toUpperCase()}${config.kind.slice(1)}`;

  return {
    define(name: string, value: V): void {
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(
          `@vsfedorenko/next-logger: ${defineName}(name, ${config.paramLabel}) requires ` +
            "a non-empty string name.",
        );
      }
      if (!config.isValidValue(value)) {
        throw new Error(
          `@vsfedorenko/next-logger: ${defineName}("${name}", ${config.paramLabel}) requires ` +
            `${config.valueKind}, got ${typeof value}. ${config.valueDetail}`,
        );
      }
      values.set(name, value);
    },
    get(name: string): V {
      const value = values.get(name);
      if (!value) {
        throw new Error(
          `@vsfedorenko/next-logger: ${config.kind} "${name}" is not registered. ` +
            `Available: ${listNames(Array.from(values.keys()))}. ` +
            `Use ${defineName}() to register ${config.article}.`,
        );
      }
      return value;
    },
    has(name: string): boolean {
      return values.has(name);
    },
    remove(name: string): boolean {
      return values.delete(name);
    },
  };
}

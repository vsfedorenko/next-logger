import type { ConsolaInstance } from "consola";
import { buildLogger } from "./logger";
import { patchConsole } from "./patches/console";

/**
 * Options for {@link init}.
 */
export interface InitOptions {
  /**
   * Patch the global `console.*` (default `true`). Set `false` to leave native
   * `console` formatting untouched.
   */
  readonly console?: boolean;
}

let active: ConsolaInstance | null = null;

/**
 * Initialises `@vsfedorenko/next-logger`.
 *
 * Builds the shared consola instance from the `NEXT_LOGGER_CONFIG` env var
 * (injected at build time by {@link withLogger}) and patches the global
 * `console.*` so all diagnostic output — application logs AND Next.js' own
 * internal logs — flows through one level-controllable sink. Call once from
 * your `instrumentation.ts` `register()` hook:
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
 * Returns the configured consola instance. Idempotent — a second call is a
 * no-op that returns the existing instance.
 */
export function init(options: InitOptions = {}): ConsolaInstance {
  if (active) return active;

  const instance = buildLogger();
  active = instance;

  if (options.console !== false) {
    patchConsole(instance);
  }

  return instance;
}

/**
 * Returns the consola instance built by {@link init}. Throws if {@link init}
 * has not been called yet.
 */
export function getLogger(): ConsolaInstance {
  if (!active) {
    throw new Error(
      "@vsfedorenko/next-logger: call init() before getLogger().",
    );
  }
  return active;
}

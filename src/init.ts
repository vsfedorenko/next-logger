import type { ConsolaInstance } from "consola";
import type { Logger } from "./backend";
import { buildLogger } from "./logger";
import { patchConsole } from "./patches/console";

// Import built-in backends so they self-register on module load. These are
// side-effect-only imports — each calls defineBackend() at load time.
import "./backends/consola";
import "./backends/pino";

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

let active: Logger | null = null;

/**
 * Initialises `@vsfedorenko/next-logger`.
 *
 * Builds the shared logger from the `NEXT_LOGGER_CONFIG` env var (injected at
 * build time by {@link withLogger}) and patches the global `console.*` so all
 * diagnostic output — application logs AND Next.js' own internal logs — flows
 * through one level-controllable sink. Call once from your `instrumentation.ts`
 * `register()` hook:
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
 * Returns the configured logger. Idempotent — a second call is a no-op that
 * returns the existing instance.
 */
export function init(options: InitOptions = {}): Logger {
  if (active) return active;

  const instance = buildLogger();
  active = instance;

  if (options.console !== false) {
    patchConsole(instance);
  }

  return instance;
}

/**
 * Returns the logger built by {@link init}. Throws if {@link init} has not
 * been called yet.
 *
 * The return type is `Logger` (the backend-agnostic interface). When using the
 * default consola backend, the instance is also a full `ConsolaInstance` —
 * narrow with `as ConsolaInstance` when you need consola-specific methods
 * (e.g. `addReporter`).
 */
export function getLogger(): Logger {
  if (!active) {
    throw new Error(
      "@vsfedorenko/next-logger: call init() before getLogger().",
    );
  }
  return active;
}

// Re-export for type narrowing convenience.
export type { ConsolaInstance };

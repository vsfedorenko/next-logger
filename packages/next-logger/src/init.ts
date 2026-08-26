import type { ConsolaInstance } from "consola/core";
import type { Logger } from "./backend.js";
import { buildLogger } from "./logger.js";
import { patchConsole } from "./patches/console.js";

// The consola backend is always available (consola is the default).
// Other backends (pino, etc.) register on demand — import them explicitly
// in your instrumentation if you want to use them:
//
//   import "@vsfedorenko/next-logger/backends/pino"; // side-effect: registers "pino"
//
// This keeps optional peer deps (pino, sentry, ...) out of the main bundle
// for apps that only use consola.
import "./backends/consola";

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

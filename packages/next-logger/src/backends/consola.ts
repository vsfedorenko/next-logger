/**
 * Built-in consola backend adapter.
 *
 * Registers the `"consola"` backend via {@link defineBackend}. The adapter
 * takes consola options, creates a `ConsolaInstance` via `createConsola()`.
 * `ConsolaInstance` satisfies the {@link Logger} interface natively.
 *
 * This is the default backend — what `buildLogger()` used to inline before the
 * backend-agnostic refactor. It preserves full backward compatibility.
 */

import consola from "consola";
import { defineBackend, type Logger } from "../core/backend.js";

/**
 * Build a consola instance from options, returning it as a {@link Logger}.
 *
 * `ConsolaInstance` natively satisfies `Logger` (it has `level`, `trace`,
 * `debug`, `info`, `warn`, `error`, `fatal`, `log`, and `withTag`).
 */
export function createConsolaBackend(): (
  options: Record<string, unknown>,
) => Logger {
  return (options: Record<string, unknown>): Logger => {
    // Derive from the package's default instance so the built-in reporters
    // (Fancy in TTY, Basic in CI, Browser in the browser entry) carry over;
    // `consola/core`'s createConsola would start from zero reporters.
    const instance = consola.create(options);
    // ConsolaInstance structurally satisfies Logger, but its withTag returns
    // ConsolaInstance (a supertype of Logger) so the assignment is sound.
    return instance as unknown as Logger;
  };
}

/**
 * Register the consola backend under the name `"consola"`.
 *
 * Idempotent — safe to call multiple times (re-registers the adapter).
 */
export function registerConsolaBackend(): void {
  defineBackend("consola", createConsolaBackend());
}

// Auto-register on module load so consumers get the default backend without an
// explicit registration call (backward compatibility).
registerConsolaBackend();

import { createConsola, type ConsolaInstance } from "consola";
import { loadConfig } from "./config";
import { resolveFormat } from "./defaults";
import { createJsonReporter } from "./reporters/json";
import { type Logger, getBackend, hasBackend } from "./backend";

/**
 * Builds the shared logger from the resolved config.
 *
 * The config is delivered at build time by {@link withLogger} via the
 * `NEXT_LOGGER_CONFIG` env var (see {@link loadConfig}).
 *
 * Three resolution paths:
 *
 * 1. **`backend`** — a named backend adapter (registered via
 *    {@link defineBackend}). `getBackend(name)(options)` creates the logger.
 *    The JSON reporter override does NOT apply here (backend-specific).
 * 2. **`instance`** — a pre-built `ConsolaInstance`, used as-is.
 * 3. **`options`** — consola options merged over defaults. When
 *    `LOG_FORMAT=json`, the instance uses the {@link createJsonReporter}.
 *
 * Falls back to the `"consola"` backend when no backend is specified but the
 * config carries no consola instance/options either (full backward compat).
 *
 * Call from {@link init} (the instrumentation hook).
 */
export function buildLogger(): Logger {
  const resolved = loadConfig();

  switch (resolved.kind) {
    case "backend": {
      const name = resolved.backend;
      if (!hasBackend(name)) {
        // Trigger the same clear error getBackend throws.
        getBackend(name);
      }
      return getBackend(name)(resolved.options);
    }
    case "instance":
      return resolved.instance;
    case "options": {
      const instance = createConsola(resolved.options);

      // Override reporters when JSON format is requested. Only applies to the
      // options path (custom instances are used as-is).
      if (resolveFormat() === "json") {
        instance.setReporters([createJsonReporter()]);
      }

      return instance;
    }
  }
}

/**
 * Build a consola instance from options (helper for tests / direct use).
 *
 * Exported so tests and the browser entry can build a consola instance without
 * going through the full config resolution path.
 */
export function buildConsolaLogger(
  options: Parameters<typeof createConsola>[0],
): ConsolaInstance {
  return createConsola(options);
}

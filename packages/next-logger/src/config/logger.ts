import consola, { type ConsolaInstance } from "consola";
import { loadConfig } from "./config.js";
import { resolveFormat } from "../core/defaults.js";
import { createJsonReporter } from "../reporters/json.js";
import { resolveReporters, type ReporterRef } from "./plugins.js";
import { type Logger, getBackend } from "../core/backend.js";

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
 * On every path, reporters referenced by name in the config (`reporters: [...]`
 * directly or via a `preset`) are resolved from the {@link defineReporter}
 * registry and appended after the built-in ones. Only consola-based loggers
 * support reporters — for other backends the specs are ignored (reporters are
 * a consola concept; a pino/winston backend brings its own destinations).
 *
 * Falls back to the `"consola"` backend when no backend is specified but the
 * config carries no consola instance/options either (full backward compat).
 *
 * Call from {@link init} (the instrumentation hook).
 */
export function buildLogger(): Logger {
  const resolved = loadConfig();

  switch (resolved.kind) {
    case "backend":
      // An unknown name throws here with the available backends listed.
      return getBackend(resolved.backend)(resolved.options);
    case "instance":
      attachReporters(resolved.instance, resolved.reporters);
      return resolved.instance;
    case "options": {
      const instance = consola.create(resolved.options);

      // Override reporters when JSON format is requested. Only applies to the
      // options path (custom instances are used as-is).
      if (resolveFormat() === "json") {
        instance.setReporters([createJsonReporter()]);
      }

      attachReporters(instance, resolved.reporters);
      return instance;
    }
  }
}

/**
 * Appends reporters resolved from {@link ReporterRef} references (bare
 * factory-name strings or `{ name, options }` specs) to a consola instance
 * (no-op when the config lists none).
 */
function attachReporters(
  instance: ConsolaInstance,
  refs: readonly ReporterRef[] | undefined,
): void {
  if (!refs || refs.length === 0) return;
  for (const reporter of resolveReporters(refs)) {
    instance.addReporter(reporter);
  }
}

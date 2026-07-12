import { createConsola, type ConsolaInstance } from "consola";
import { loadConfig } from "./config";
import { resolveFormat } from "./defaults";
import { createJsonReporter } from "./reporters/json";

/**
 * Builds the shared consola instance from the resolved config.
 *
 * The config is delivered at build time by {@link withLogger} via the
 * `NEXT_LOGGER_CONFIG` env var (see {@link loadConfig}). When `LOG_FORMAT=json`
 * is set, the instance uses the {@link createJsonReporter} instead of consola's
 * default pretty reporter. A custom instance/factory (only reachable when
 * {@link loadConfig} is bypassed) is used as-is.
 *
 * Call from {@link init} (the instrumentation hook).
 */
export function buildLogger(): ConsolaInstance {
  const resolved = loadConfig();

  switch (resolved.kind) {
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

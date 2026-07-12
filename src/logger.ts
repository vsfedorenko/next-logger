import { createConsola, type ConsolaInstance } from "consola";
import { loadConfig } from "./config";
import { resolveFormat } from "./defaults";
import { createJsonReporter } from "./reporters/json";

/**
 * The shared consola instance backing all patches.
 *
 * Resolution order:
 *   1. `next-logger.config.{ts,js,cjs,...}` → `consola` key is a
 *      {@link ConsolaInstance} or a factory → used directly.
 *   2. Same config → `consola` key is a partial options object → merged with
 *      defaults, then built.
 *   3. No config → built from {@link defaultConsolaOptions}.
 *
 * When `LOG_FORMAT=json` (or `NEXT_PUBLIC_LOG_FORMAT=json`), the logger uses
 * the {@link createJsonReporter} instead of consola's default pretty reporter.
 * A config file's custom instance / factory bypasses format selection — the
 * user's instance controls everything.
 *
 * Both patches (`patches/next`, `patches/console`) call `.withTag()` on this
 * object so they can namespace their output.
 */
export const logger: ConsolaInstance = buildLogger();

function buildLogger(): ConsolaInstance {
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

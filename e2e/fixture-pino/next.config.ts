/**
 * Pino-fixture next.config — wraps the config with @vsfedorenko/next-logger's
 * `withLogger`, selecting the `pino` backend. Pino emits ndjson by default, so
 * no LOG_FORMAT env var is needed (unlike the consola fixture).
 *
 * `backendOptions.level: "debug"` is passed through to pino so the debug-level
 * probe message is emitted, proving backendOptions flow end-to-end.
 */
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({
  backend: "pino",
  backendOptions: { level: "debug" },
})({
  // Turbopack resolves `require("pino")` from inside dist/backends/pino.js
  // against the library's own (symlinked) node_modules, where the optional
  // peer dep is absent — the same pitfall fixed for the consola fixture in
  // 017cdd6. Marking pino external keeps the require native, so it resolves
  // from this fixture's node_modules at runtime.
  serverExternalPackages: ["pino"],
});

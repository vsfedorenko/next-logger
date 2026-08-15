/**
 * Winston-fixture next.config — wraps the config with @vsfedorenko/next-logger's
 * `withLogger`, selecting the `winston` backend.
 *
 * `backendOptions.logger: "app"` selects the named container logger created
 * in instrumentation.ts (with a Console transport emitting single-line JSON).
 * `backendOptions.level: "debug"` is applied on top, proving both options
 * flow end-to-end through the env-var boundary.
 */
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({
  backend: "winston",
  backendOptions: { logger: "app", level: "debug" },
})({});

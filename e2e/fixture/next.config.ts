/**
 * Fixture next.config — wraps the config with @vsfedorenko/next-logger's
 * `withLogger`, which injects `NEXT_LOGGER_CONFIG` (serialised options) into the
 * validated `env` key. Level 4 (debug) is set so the e2e can prove the
 * config-driven level is applied (a debug message would be hidden at the
 * default level of 3).
 */
import { withLogger } from "@vsfedorenko/next-logger";

export default withLogger({ consola: { level: 4 } })({});

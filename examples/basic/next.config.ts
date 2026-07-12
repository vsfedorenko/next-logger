import { withLogger } from "@vsfedorenko/next-logger";

/**
 * Step 1 — wrap your Next.js config with `withLogger`.
 *
 * It serialises the options into the `NEXT_LOGGER_CONFIG` env var via Next's
 * validated `env` key (inlined at build time, no "Unrecognized key" warning).
 *
 * `level: 4` enables debug-level output. Drop the option (or use `3`) for
 * production.
 */
export default withLogger({ consola: { level: 4 } })({
  // ...your other next config
});

/**
 * Instrumentation hook — initialises @vsfedorenko/next-logger in the Node.js
 * server runtime with the pino backend.
 *
 * The side-effect import of `@vsfedorenko/next-logger/backends/pino` registers
 * the "pino" backend adapter BEFORE `init()` builds the logger from the
 * `NEXT_LOGGER_CONFIG` env var (which requests `backend: "pino"`).
 */
import "@vsfedorenko/next-logger/backends/pino";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@vsfedorenko/next-logger");
    await init();
  }
}

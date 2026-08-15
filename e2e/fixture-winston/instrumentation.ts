/**
 * Instrumentation hook — initialises @vsfedorenko/next-logger in the Node.js
 * server runtime with the winston backend.
 *
 * The side-effect import of `@vsfedorenko/next-logger/backends/winston`
 * registers the "winston" backend adapter BEFORE `init()` builds the logger
 * from the `NEXT_LOGGER_CONFIG` env var.
 *
 * backendOptions cross the build→runtime boundary as JSON, so transport
 * objects cannot be configured there. Instead the app creates a named logger
 * in the winston container — with a Console transport emitting single-line
 * JSON and warn/error routed to stderr — and selects it by id from
 * next.config via `backendOptions: { logger: "app" }`.
 */
import "@vsfedorenko/next-logger/backends/winston";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const winston = await import("winston");
    winston.loggers.add("app", {
      level: "debug",
      transports: [
        new winston.transports.Console({
          stderrLevels: ["warn", "error"],
        }),
      ],
    });
    const { init } = await import("@vsfedorenko/next-logger");
    await init();
  }
}

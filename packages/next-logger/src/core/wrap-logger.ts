/**
 * Shared helper for wrappers that re-dispatch every log method of a
 * {@link Logger} — metadata attachment (`withMetadata`), sampling
 * (`sampleLogger`), and request-scoped context (`createRequestLogger`) all
 * wrap the same seven methods; backends build their adapters from the same
 * method set.
 */

import type { Logger } from "./backend.js";

/** The variadic log methods of {@link Logger} — everything except `level` and `withTag`. */
export type LogMethodName = Exclude<keyof Logger, "level" | "withTag">;

/** {@link LogMethodName} values in {@link Logger} declaration order. */
export const LOG_METHODS: readonly LogMethodName[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "log",
];

/**
 * Wrap every log method of `logger` through `wrap`.
 *
 * `wrap` receives the method name and a bound call into the underlying
 * logger; whatever it returns becomes that method on the resulting record —
 * spread it into a full {@link Logger} alongside `level` and `withTag`.
 */
export function wrapLogMethods(
  logger: Logger,
  wrap: (
    method: LogMethodName,
    call: (...args: unknown[]) => void,
  ) => (...args: unknown[]) => void,
): Record<LogMethodName, (...args: unknown[]) => void> {
  const methods = {} as Record<LogMethodName, (...args: unknown[]) => void>;
  for (const method of LOG_METHODS) {
    methods[method] = wrap(method, (...args: unknown[]) => logger[method](...args));
  }
  return methods;
}

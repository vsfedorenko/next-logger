/**
 * Shared classification of a consola log object's variadic arguments.
 *
 * Console-style calls mix strings, objects, and Errors in one argument list.
 * Every reporter (datadog, otlp, pino, sentry) and the log viewer face the
 * same split: join the primitives into a human-readable message, keep the
 * structured payloads keyed by argument position. This module is that one
 * rule, expressed once — reporters only decide how a serialised `Error` is
 * keyed and shaped (see {@link SplitLogArgsOptions}).
 */

import type { LogObject } from "consola/core";

/** How a serialised `Error` arg is keyed and shaped — see {@link splitLogArgs}. */
export interface SplitLogArgsOptions {
  /**
   * Key for a serialised `Error` argument. Default: `arg_${i}`. (The OTLP
   * reporter appends `.exception` to distinguish errors from plain objects.)
   */
  errorKey?(index: number): string;
  /**
   * Serialise an `Error` argument. Default: `{ name, message, stack }`. (The
   * Sentry breadcrumb reporter omits the stack; OTLP renames `name` to `type`.)
   */
  serializeError?(error: Error): Record<string, unknown>;
}

/** Result of splitting a log object's args — see {@link splitLogArgs}. */
export interface SplitLogArgs {
  /** String args (plus `logObj.message` when set), in call order. */
  messageParts: string[];
  /** Object/Error args keyed by argument position (`arg_0`, …). */
  structured: Record<string, unknown>;
}

/**
 * Split a consola log object's arguments into message parts and structured
 * payloads.
 *
 * - `logObj.message` (when set) becomes the first message part.
 * - Primitive args are stringified and join the message parts.
 * - `Error` args are serialised under `arg_N` (customisable).
 * - Other non-null object args are kept verbatim under `arg_N`.
 */
export function splitLogArgs(
  logObj: LogObject,
  options: SplitLogArgsOptions = {},
): SplitLogArgs {
  const errorKey = options.errorKey ?? ((i: number): string => `arg_${i}`);
  const serializeError =
    options.serializeError ??
    ((error: Error): Record<string, unknown> => ({
      name: error.name,
      message: error.message,
      stack: error.stack,
    }));

  const args = logObj.args ?? [];
  const messageParts: string[] = [];
  const structured: Record<string, unknown> = {};

  if (logObj.message) messageParts.push(logObj.message);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      structured[errorKey(i)] = serializeError(arg);
    } else if (typeof arg === "object" && arg !== null) {
      structured[`arg_${i}`] = arg;
    } else {
      messageParts.push(String(arg));
    }
  }

  return { messageParts, structured };
}

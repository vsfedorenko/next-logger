/**
 * JSON reporter for consola — emits each log as a single-line JSON object to
 * stdout (or stderr for error+), suitable for structured-log aggregators
 * (Loki, Datadog, CloudWatch, Elasticsearch, …).
 *
 * Output shape (stable):
 *
 * ```json
 * {"level":"error","type":"error","tag":"next.js","msg":"failed to compile","date":"2026-07-11T13:43:10.712Z"}
 * ```
 *
 *   - `level` — consola's named level (`silent`/`error`/`warn`/`info`/`debug`/`trace`/`verbose`/…).
 *   - `type`  — consola's log type (usually matches `level`, but Next.js
 *     distinguishes `event`, `ready`, `wait` etc.).
 *   - `tag`   — the consola tag (`next.js`, `console`, `app`, …).
 *   - `msg`   — the interpolated message string (multi-arg args joined with space).
 *   - `args`  — additional structured arguments beyond the message (objects,
 *     errors). Omitted when there are no extra args.
 *   - `date`  — ISO 8601 timestamp.
 *
 * Errors are serialised as `{ message, stack, name }` so stack traces survive
 * in log aggregators.
 */

import type { ConsolaReporter, LogObject, ConsolaOptions } from "consola";
import { LEVEL_TO_NAME } from "../defaults";

/**
 * Serialises an `Error` into a JSON-safe plain object (preserves stack + cause).
 */
function serializeError(err: Error): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  if (err.cause !== undefined) {
    obj.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause;
  }
  return obj;
}

/**
 * Makes any value JSON-safe — recursively converts BigInt, Error, circular
 * references, and class instances into plain objects.
 */
function jsonSafe(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return String(value);
    case "function":
      return `[Function: ${value.name || "anonymous"}]`;
    case "symbol":
      return String(value);
    case "object": {
      // Circular reference guard.
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);

      if (value instanceof Date) return value.toISOString();
      if (value instanceof Error) return serializeError(value);
      if (value instanceof RegExp) return value.toString();

      if (Array.isArray(value)) {
        return value.map((v) => jsonSafe(v, seen));
      }

      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = jsonSafe(val, seen);
      }
      return result;
    }
    default:
      return String(value);
  }
}

/**
 * Creates a JSON reporter that writes to `process.stdout` / `process.stderr`.
 *
 *   - Error-level messages (level ≤ 1) go to **stderr** (conventional for
 *     structured logs, keeps stdout clean for piping).
 *   - Everything else goes to **stdout**.
 *
 * @param overrideStream force all output to a single stream (useful for tests).
 */
export function createJsonReporter(
  overrideStream?: { write: (s: string) => boolean },
): ConsolaReporter {
  return {
    log(logObj: LogObject, _ctx: { options: ConsolaOptions }): void {
      const msg = buildMessage(logObj.args);
      const extra = buildExtraArgs(logObj.args);

      const entry: Record<string, unknown> = {
        level: LEVEL_TO_NAME[logObj.level] ?? "info",
        type: logObj.type,
        tag: logObj.tag ?? "",
        msg,
        date: logObj.date instanceof Date ? logObj.date.toISOString() : logObj.date,
      };

      // Include extra structured args when present.
      if (extra !== undefined) {
        entry.args = extra;
      }

      const line = JSON.stringify(jsonSafe(entry)) + "\n";

      const stream = overrideStream ?? selectStream(logObj.level);
      stream.write(line);
    },
  };
}

/** Selects stdout for info+ messages, stderr for error-level. */
function selectStream(level: number): { write: (s: string) => boolean } {
  if (level <= 1) {
    return process.stderr ?? process.stdout;
  }
  return process.stdout;
}

/**
 * Extracts the message string from consola args.
 *
 * Following the upstream sainsburys-tech/next-logger convention: string args
 * are joined with a space. The first non-string arg (object/error) is NOT part
 * of the message — it goes into `args`.
 */
function buildMessage(args: unknown[]): string {
  const parts: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      parts.push(arg);
    } else if (arg instanceof Error) {
      parts.push(arg.message);
    } else {
      break; // stop at the first non-string, non-error arg
    }
  }
  return parts.join(" ");
}

/**
 * Extracts structured arguments beyond the message string — objects, errors,
 * and non-string values that carry diagnostic metadata.
 *
 * Returns `undefined` when there are no extra args (keeps the JSON output clean).
 */
function buildExtraArgs(args: unknown[]): unknown[] | undefined {
  const extra: unknown[] = [];
  for (const arg of args) {
    if (typeof arg === "string") continue;
    extra.push(arg);
  }
  return extra.length > 0 ? extra : undefined;
}

/**
 * # Structured metadata
 *
 * Attach a fixed bag of structured fields to every log entry produced by a
 * logger, without threading them into every call site by hand. Mirrors the
 * ergonomics of pino's `logger.child()` / winston's `child()` while keeping
 * next-logger's backend-agnostic {@link Logger} surface.
 *
 * ## Usage
 *
 * ```ts
 * import { getLogger, withMetadata } from "@vsfedorenko/next-logger";
 *
 * const logger = withMetadata(getLogger(), { requestId: "abc", userId: 42 });
 * logger.info("processing");               // → info("processing", { requestId: "abc", userId: 42 })
 * logger.info("done", { ms: 12 });          // → info("done", { requestId: "abc", userId: 42, ms: 12 })
 * logger.withTag("db").info("query");       // child logger preserves the metadata
 * ```
 *
 * ## Environment-driven metadata
 *
 * {@link resolveMetadataFromEnv} reads the `LOG_METADATA` environment variable
 * (a JSON object) so deployment-wide metadata (service name, version, region)
 * can be applied at boot without touching application code:
 *
 * ```bash
 * LOG_METADATA='{"service":"api","version":"1.0"}' next start
 * ```
 *
 * ```ts
 * import { getLogger, withMetadata, resolveMetadataFromEnv } from "@vsfedorenko/next-logger";
 *
 * const logger = withMetadata(getLogger(), resolveMetadataFromEnv());
 * ```
 */

import type { Logger } from "./backend.js";

/**
 * Tests whether a value is a plain, mergeable object — i.e. a non-null object
 * that is not an array, Date, RegExp, Error, or class instance. We only want to
 * *merge* metadata into argument objects that look like structured fields, not
 * into things like `Error` instances (which should be preserved verbatim).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  // Arrays and class instances have a non-Object prototype — skip them so we
  // never accidentally mutate an Error, Date, etc.
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true; // Object.create(null)
  return proto === Object.prototype;
}

/**
 * The log methods that {@link withMetadata} wraps. Mirrors the full method set
 * of {@link Logger}.
 */
type MetadataMethod =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "log";

/**
 * Merges a fixed metadata bag into a single log call's arguments.
 *
 * Rules (applied to each argument, left to right):
 *
 * - **String / number / boolean** args are left in place; the metadata is
 *   appended as a trailing object argument (so the message stays readable and
 *   the metadata lands as structured fields).
 * - **Plain object** args have the metadata keys merged in (metadata wins on
 *   key collisions, so per-call fields can be overridden).
 * - **Other objects** (Error, Date, arrays, class instances) are forwarded
 *   verbatim, and the metadata is appended as a trailing object argument — the
 *   same as for primitives.
 *
 * The original arguments array is never mutated; a new array is returned.
 */
function applyMetadata(
  args: unknown[],
  metadata: Record<string, unknown>,
): unknown[] {
  // Fast path: no metadata to apply.
  const keys = Object.keys(metadata);
  if (keys.length === 0) return args;

  let mergedAnyObject = false;
  const next = args.map((arg) => {
    if (isPlainObject(arg)) {
      mergedAnyObject = true;
      // Per-call object keys override metadata keys on collision — spread the
      // original arg AFTER the metadata so its own keys win.
      return { ...metadata, ...arg };
    }
    return arg;
  });

  // If no plain object was found to merge into, append the metadata as a
  // trailing object argument so the structured fields still reach the backend.
  if (!mergedAnyObject) {
    next.push({ ...metadata });
  }

  return next;
}

/**
 * Wraps a {@link Logger} so every log call carries a fixed bag of structured
 * metadata.
 *
 * The returned logger satisfies the full {@link Logger} interface:
 *
 * - `level` is a live getter that reflects the underlying logger.
 * - Every log method (`trace` … `log`) forwards the call with metadata applied
 *   via {@link applyMetadata}.
 * - `withTag(tag)` returns a *child* logger (via the underlying logger's own
 *   `withTag`) that **preserves the metadata** — tagging does not drop it.
 *
 * Metadata keys from the fixed bag are merged into plain-object arguments and
 * appended as a trailing object argument otherwise (see {@link applyMetadata}).
 * Per-call object keys override metadata keys on collision.
 *
 * @example
 * ```ts
 * const logger = withMetadata(getLogger(), { requestId: "abc" });
 * logger.info("processing");          // info("processing", { requestId: "abc" })
 * logger.info("done", { ms: 12 });     // info("done", { requestId: "abc", ms: 12 })
 * logger.withTag("db").info("query");  // child logger keeps { requestId: "abc" }
 * ```
 */
export function withMetadata(
  logger: Logger,
  metadata: Record<string, unknown>,
): Logger {
  const wrap =
    (method: MetadataMethod) =>
    (...args: unknown[]): void => {
      logger[method](...applyMetadata(args, metadata));
    };

  return {
    get level() {
      return logger.level;
    },
    withTag(tag: string): Logger {
      // Delegate tagging to the underlying logger, then re-wrap the child so
      // the metadata follows into the tagged scope.
      return withMetadata(logger.withTag(tag), metadata);
    },
    trace: wrap("trace"),
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
    fatal: wrap("fatal"),
    log: wrap("log"),
  };
}

/**
 * The environment variable consulted by {@link resolveMetadataFromEnv}.
 */
export const METADATA_ENV_VAR = "LOG_METADATA";

/**
 * Resolves a structured-metadata bag from the `LOG_METADATA` environment
 * variable.
 *
 * The variable must hold a JSON-encoded object, e.g.
 * `LOG_METADATA='{"service":"api","version":"1.0"}'`.
 *
 * Returns an empty object (`{}`) when:
 * - the variable is absent or empty, or
 * - it does not parse as JSON, or
 * - it parses but is not a plain object (arrays / primitives are rejected).
 *
 * A parse failure is **non-fatal**: the function logs nothing and returns `{}`,
 * so a malformed `LOG_METADATA` never crashes boot — you simply get no
 * env-driven metadata.
 *
 * @example
 * ```bash
 * LOG_METADATA='{"service":"api","version":"1.0"}' next start
 * ```
 *
 * ```ts
 * const md = resolveMetadataFromEnv(); // { service: "api", version: "1.0" }
 * const logger = withMetadata(getLogger(), md);
 * ```
 */
export function resolveMetadataFromEnv(): Record<string, unknown> {
  const raw = process.env[METADATA_ENV_VAR];
  if (raw == null || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed)) return {};
  return parsed as Record<string, unknown>;
}

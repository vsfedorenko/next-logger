/**
 * Redaction reporter for consola — a middleware that strips sensitive data
 * from log entries before they reach the wrapped reporter.
 *
 * The reporter is a **decorator**: it wraps any other `ConsolaReporter` (e.g.
 * the JSON reporter, the pretty console reporter, or the Sentry breadcrumb
 * reporter) and sanitises each `LogObject` before delegating. This keeps
 * redaction orthogonal to output format — you configure it once and it
 * protects every downstream sink.
 *
 * ## What gets redacted
 *
 *   1. **Pattern-based** — regexes matched against every string in `args`
 *      (string args, error messages, nested object values). Ships with
 *      sensible defaults: emails, credit-card numbers, JWT tokens, and
 *      long hex/base64 API keys.
 *   2. **Key-based** — when a plain-object arg contains a key whose name
 *      matches a known sensitive key (e.g. `password`, `token`, `apiKey`),
 *      the corresponding **value** is replaced, regardless of its type.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts
 * import { init, getLogger } from "@vsfedorenko/next-logger";
 * import { createJsonReporter } from "@vsfedorenko/next-logger";
 * import { createRedactionReporter } from "@vsfedorenko/next-logger";
 *
 * init();
 * const logger = getLogger();
 *
 * const json = createJsonReporter();
 * const redacting = createRedactionReporter({ reporter: json });
 * logger.setReporters([redacting]);
 * ```
 *
 * Both `patterns` and `keys` default to built-in sets; pass either to override.
 */

import type { ConsolaReporter, LogObject, ConsolaOptions } from "consola";

/**
 * Options for {@link createRedactionReporter}.
 */
export interface RedactionOptions {
  /**
   * The wrapped reporter that receives the sanitised log objects.
   *
   * Required — the redaction reporter is a pure middleware; without a
   * downstream sink the sanitised log is dropped.
   */
  reporter: ConsolaReporter;
  /**
   * Regex patterns (or string literals, escaped and matched case-insensitively)
   * applied to every string-valued piece of a log entry.
   *
   * Defaults to {@link DEFAULT_PATTERNS} (emails, credit cards, JWTs, API keys).
   * Pass an explicit array to **replace** the defaults (merging is intentional
   * opt-in — a caller that supplies `patterns` owns the full set).
   */
  patterns?: (RegExp | string)[];
  /**
   * Replacement text substituted for every match.
   *
   * @default "[REDACTED]"
   */
  replacement?: string;
  /**
   * Object-key names whose values should be redacted wherever they appear in
   * plain-object args (case-insensitive, matched as a substring of the key).
   *
   * Defaults to {@link DEFAULT_KEYS}.
   */
  keys?: string[];
}

/**
 * Built-in regex patterns for common sensitive data.
 *
 *   - **Email** — RFC-5322-ish `local@domain`.
 *   - **Credit card** — 13–19 digit runs, optional `-`/space separators.
 *   - **JWT** — three base64url segments separated by dots.
 *   - **API key** — 32+ char hex or base64 runs (covers SHA-256 hashes,
 *     GitHub/AWS-style tokens, etc.).
 */
export const DEFAULT_PATTERNS: readonly RegExp[] = [
  // Email addresses.
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Credit card numbers (13–19 digits, optional spaces/dashes).
  /\b(?:\d[ -]*?){13,19}\b/g,
  // JWT tokens: three base64url segments.
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
  // Long hex / base64 API keys (≥32 chars of [0-9a-f] or base64 alphabet).
  /\b[a-fA-F0-9]{32,}\b/g,
];

/**
 * Default sensitive object-key names (case-insensitive substring match).
 */
export const DEFAULT_KEYS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "privatekey",
  "private_key",
];

/**
 * A string used to stand in for redacted values when the caller does not
 * supply a custom {@link RedactionOptions.replacement}.
 */
export const DEFAULT_REPLACEMENT = "[REDACTED]";

/**
 * Wraps a string pattern into a global, case-insensitive regex (the form
 * required by `String.prototype.replaceAll`). Strings are source-escaped so
 * they are matched literally.
 */
function toRegExp(pattern: RegExp | string): RegExp {
  if (pattern instanceof RegExp) return pattern;
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
}

/**
 * Applies every active pattern to a string, returning the redacted result.
 * Returns the original reference untouched when no pattern matches — this
 * keeps object identity stable for values that carry no sensitive data.
 */
function redactString(input: string, regexes: RegExp[], replacement: string): string {
  let result = input;
  let matched = false;
  for (const re of regexes) {
    // Global regexes carry their own lastIndex; reset to avoid state bleed.
    re.lastIndex = 0;
    if (re.test(result)) {
      matched = true;
      re.lastIndex = 0;
      result = result.replace(re, replacement);
    }
  }
  return matched ? result : input;
}

/**
 * Returns `true` when `key` matches one of the configured sensitive key names
 * (case-insensitive substring match).
 */
function isSensitiveKey(key: string, keysLower: string[]): boolean {
  const lower = key.toLowerCase();
  return keysLower.some((k) => lower.includes(k));
}

/**
 * Deeply redacts a value:
 *   - strings run through the pattern regexes;
 *   - plain objects/arrays have sensitive-key values replaced and nested
 *     values recursed (with a circular-reference guard);
 *   - `Error` instances have their `message` redacted.
 *
 * Returns a **shallow clone** for objects/arrays so the caller's original
 * argument is never mutated.
 */
function redactValue(
  value: unknown,
  regexes: RegExp[],
  keysLower: string[],
  replacement: string,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "string") {
    return redactString(value, regexes, replacement);
  }

  if (value instanceof Error) {
    // Clone with a redacted message; preserve name + stack identity.
    const clone = new (value.constructor as new (msg?: string) => Error)(
      redactString(value.message, regexes, replacement),
    );
    clone.name = value.name;
    if (value.stack) clone.stack = value.stack;
    if (value.cause !== undefined) {
      clone.cause = redactValue(value.cause, regexes, keysLower, replacement, seen);
    }
    return clone;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  // Object / array — guard against cycles.
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, regexes, keysLower, replacement, seen));
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = isSensitiveKey(key, keysLower)
      ? replacement
      : redactValue(val, regexes, keysLower, replacement, seen);
  }
  return out;
}

/**
 * Creates a redaction reporter that wraps another consola reporter.
 *
 * For every incoming {@link LogObject}, the reporter produces a **sanitised
 * shallow copy** (`args` replaced with redacted equivalents) and forwards it
 * to the wrapped reporter. The original `logObj` is never mutated.
 *
 * @param options configuration — see {@link RedactionOptions}.
 * @returns a `ConsolaReporter` decorator.
 */
export function createRedactionReporter(options: RedactionOptions): ConsolaReporter {
  const wrapped = options.reporter;
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
  const patterns = options.patterns ?? [...DEFAULT_PATTERNS];
  const regexes = patterns.map(toRegExp);
  const keysLower = (options.keys ?? [...DEFAULT_KEYS]).map((k) => k.toLowerCase());

  return {
    log(logObj: LogObject, ctx: { options: ConsolaOptions }): void {
      const args = logObj.args ?? [];
      const redactedArgs = args.map((arg) =>
        redactValue(arg, regexes, keysLower, replacement),
      );

      const sanitised: LogObject = {
        ...logObj,
        // Redact the optional top-level message too (consola populates it
        // for interpolated messages).
        message:
          typeof logObj.message === "string"
            ? redactString(logObj.message, regexes, replacement)
            : logObj.message,
        args: redactedArgs,
      };

      wrapped.log(sanitised, ctx);
    },
  };
}

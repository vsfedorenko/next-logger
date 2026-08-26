/**
 * Plugin system for @vsfedorenko/next-logger — named reporter factories and
 * config presets.
 *
 * The library's config crosses the build→runtime boundary as JSON (see
 * {@link loadConfig}), so it can only carry *serialisable* values. Reporters,
 * however, are live objects with behaviour. The plugin system bridges the gap:
 *
 *   - **Reporter factories** register behaviour **at runtime** (in your
 *     `instrumentation.ts`, where real code runs) under a stable name.
 *   - **Config** references that behaviour *by name* plus serialisable
 *     options: `{ reporters: [{ name: "datadog", options: { service: "x" } }] }`.
 *   - **Presets** bundle a backend + reporter list under one name, so
 *     `withLogger({ preset: "production" })` is all a next.config needs.
 *
 * Mirrors the {@link defineBackend} registry pattern: define → reference by
 * name → resolve at `init()` time. Unknown names fail fast with the list of
 * available registrations (never a silent no-op).
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts — register plugins before init()
 * import { defineReporter, definePreset, init } from "@vsfedorenko/next-logger";
 * import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";
 *
 * defineReporter("datadog", (options) =>
 *   createDatadogLogsReporter(options as { service?: string }),
 * );
 *
 * definePreset("production", {
 *   reporters: [{ name: "json" }, { name: "datadog", options: { service: "my-app" } }],
 * });
 *
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === "nodejs") {
 *     init();
 *   }
 * }
 * ```
 *
 * ```ts
 * // next.config.ts — reference the preset by name (serialisable)
 * import { withLogger } from "@vsfedorenko/next-logger";
 * export default withLogger({ preset: "production" })({ /* … *\/ });
 * ```
 */

import type { ConsolaReporter } from "consola/core";
import { createJsonReporter } from "./reporters/json.js";

/**
 * A factory that creates a {@link ConsolaReporter} from serialisable options.
 *
 * Options arrive from the JSON config, so implementations must treat them as
 * untrusted plain data — never close over them, and never expect functions or
 * class instances inside.
 */
export type ReporterFactory = (options: Record<string, unknown>) => ConsolaReporter;

/**
 * A serialisable reference to a reporter: a registered factory name plus the
 * options passed to it.
 *
 * Used in {@link LoggerPreset} and in the `reporters` key of the logger
 * config (`withLogger({ reporters: [...] })`).
 */
export interface ReporterSpec {
  /** Name of a factory registered via {@link defineReporter}. */
  readonly name: string;
  /** Serialisable options forwarded to the factory. */
  readonly options?: Record<string, unknown>;
}

/**
 * A reporter reference in a config: either a full {@link ReporterSpec} or a
 * bare factory name string (shorthand for `{ name }` — handy in JS config
 * files where no type-checker nudges toward the object form).
 */
export type ReporterRef = ReporterSpec | string;

/**
 * A named bundle of logger config — backend selection plus a reporter list.
 *
 * Everything must be serialisable; reporters are referenced via
 * {@link ReporterRef} (factory names registered at runtime, with the bare
 * string shorthand allowed).
 */
export interface LoggerPreset {
  /** Name of the registered backend adapter (default: `"consola"`). */
  readonly backend?: string;
  /** Serialisable options forwarded to the backend adapter. */
  readonly backendOptions?: Record<string, unknown>;
  /** Partial consola options (ignored when `backend` is set). */
  readonly consola?: Record<string, unknown>;
  /** Reporters to attach (appended after the built-in ones). */
  readonly reporters?: readonly ReporterRef[];
}

/** Registry of named reporter factories. */
const reporters = new Map<string, ReporterFactory>();

/** Registry of named presets. */
const presets = new Map<string, LoggerPreset>();

/**
 * Register a named reporter factory.
 *
 * Calling `defineReporter` with an existing name replaces the prior factory.
 */
export function defineReporter(name: string, factory: ReporterFactory): void {
  reporters.set(name, factory);
}

/**
 * Get a registered reporter factory, or throw with the available names listed.
 */
export function getReporter(name: string): ReporterFactory {
  const factory = reporters.get(name);
  if (!factory) {
    throw new Error(
      `@vsfedorenko/next-logger: reporter "${name}" is not registered. ` +
        `Available: ${Array.from(reporters.keys()).join(", ")}. ` +
        `Use defineReporter() to register a custom reporter.`,
    );
  }
  return factory;
}

/** Check if a reporter factory is registered. */
export function hasReporter(name: string): boolean {
  return reporters.has(name);
}

/**
 * Removes a registered reporter factory (mainly for testing).
 *
 * Returns `true` when a factory was removed.
 */
export function removeReporter(name: string): boolean {
  return reporters.delete(name);
}

/**
 * Register a named config preset.
 *
 * Calling `definePreset` with an existing name replaces the prior preset.
 */
export function definePreset(name: string, preset: LoggerPreset): void {
  presets.set(name, preset);
}

/**
 * Get a registered preset, or throw with the available names listed.
 */
export function getPreset(name: string): LoggerPreset {
  const preset = presets.get(name);
  if (!preset) {
    throw new Error(
      `@vsfedorenko/next-logger: preset "${name}" is not registered. ` +
        `Available: ${Array.from(presets.keys()).join(", ")}. ` +
        `Use definePreset() to register a custom preset.`,
    );
  }
  return preset;
}

/** Check if a preset is registered. */
export function hasPreset(name: string): boolean {
  return presets.has(name);
}

/**
 * Removes a registered preset (mainly for testing).
 *
 * Returns `true` when a preset was removed.
 */
export function removePreset(name: string): boolean {
  return presets.delete(name);
}

/**
 * Build live reporters from serialisable {@link ReporterSpec} references.
 *
 * Returns an empty array for `undefined`/empty input. Throws (via
 * {@link getReporter}) on an unknown reporter name — fail fast at `init()`
 * rather than silently dropping logs.
 */
export function resolveReporters(
  specs: readonly ReporterRef[] | undefined,
): ConsolaReporter[] {
  if (!specs) return [];
  return specs.map((ref) => {
    const spec = normaliseReporterRef(ref);
    return getReporter(spec.name)(spec.options ?? {});
  });
}

// Built-in reporter factories. The JSON reporter is part of the main entry
// (no optional peer deps), so registering it here is bundle-safe. Network
// reporters (datadog, otlp, sentry, pino) stay on their subpath entries —
// register those explicitly via defineReporter() to keep them tree-shakeable.
/**
 * Normalise a reporter reference: a bare string is shorthand for
 * `{ name: string }`; anything else that is not a spec-shaped object fails
 * fast with a message naming the offending entry (not just "undefined").
 */
function normaliseReporterRef(ref: ReporterRef): ReporterSpec {
  if (typeof ref === "string") return { name: ref };
  if (ref && typeof ref === "object" && typeof ref.name === "string") {
    return ref;
  }
  throw new TypeError(
    `@vsfedorenko/next-logger: invalid reporter entry ${JSON.stringify(ref) ?? String(ref)} — ` +
      `use a factory name string or { name, options }.`,
  );
}

defineReporter("json", () => createJsonReporter());

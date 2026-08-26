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
import { createJsonReporter } from "../reporters/json.js";
import { createRegistry } from "../core/registry.js";

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
const reporters = createRegistry<ReporterFactory>({
  kind: "reporter",
  paramLabel: "factory",
  valueKind: "a factory function",
  valueDetail:
    "The factory is called with reporter options and must return a consola reporter.",
  article: "a custom reporter",
  isValidValue: (factory) => typeof factory === "function",
});

/** Registry of named presets. */
const presets = createRegistry<LoggerPreset>({
  kind: "preset",
  paramLabel: "preset",
  valueKind: "a preset object",
  valueDetail: "A preset carries backend / backendOptions / reporters fields.",
  article: "a custom preset",
  isValidValue: (preset) => typeof preset === "object" && preset !== null,
});

/**
 * Register a named reporter factory.
 *
 * Calling `defineReporter` with an existing name replaces the prior factory.
 *
 * @throws When `name` is not a non-empty string or `factory` is not a
 * function — a wrong-shaped registration must fail at the registration site,
 * not later as a raw TypeError inside `init()`.
 */
export function defineReporter(name: string, factory: ReporterFactory): void {
  reporters.define(name, factory);
}

/**
 * Get a registered reporter factory, or throw with the available names listed.
 */
export function getReporter(name: string): ReporterFactory {
  return reporters.get(name);
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
  return reporters.remove(name);
}

/**
 * Register a named config preset.
 *
 * Calling `definePreset` with an existing name replaces the prior preset.
 *
 * @throws When `name` is not a non-empty string or `preset` is not an object —
 * catching wrong-shaped registrations at the registration site.
 */
export function definePreset(name: string, preset: LoggerPreset): void {
  presets.define(name, preset);
}

/**
 * Get a registered preset, or throw with the available names listed.
 */
export function getPreset(name: string): LoggerPreset {
  return presets.get(name);
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
  return presets.remove(name);
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
defineReporter("json", () => createJsonReporter());

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

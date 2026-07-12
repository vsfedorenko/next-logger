/**
 * Central type definitions for next-log.
 *
 * Re-exports consola's core types so consumers don't need to depend on consola
 * directly for type-only imports, and defines the shape of the Next.js log
 * module we patch.
 */

import type { ConsolaInstance } from "consola";

/**
 * A variadic log function — the common shape shared by `console.*`,
 * consola's `LogFn`, and Next.js' log methods. Accepts any arguments
 * (strings, objects, errors, mixed) and returns void.
 */
export type LogFunction = (...args: unknown[]) => void;

/**
 * A Next.js log method signature. Identical to {@link LogFunction} but named
 * to document that it matches the methods exported by
 * `next/dist/build/output/log`.
 */
export type NextLogFn = (...args: unknown[]) => void;

/**
 * The shape of `next/dist/build/output/log` that we patch.
 *
 * Based on the actual exports of Next.js 13+ (see
 * `next/dist/build/output/log.d.ts`):
 *
 *   - `prefixes` — a record mapping each method name to its coloured
 *     symbol (○ ⨯ ⚠ ▲ etc.).
 *   - `wait`/`error`/`warn`/`ready`/`info`/`event`/`trace` — the prefix-based
 *     log methods we replace.
 *   - `bootstrap` — a raw `console.log` (single `message` string, no prefix).
 *   - `warnOnce`/`errorOnce` — deduplicating wrappers (optional — older
 *     Next versions don't export them).
 */
export interface NextLogModule {
  readonly prefixes: Record<string, string>;
  wait: NextLogFn;
  error: NextLogFn;
  warn: NextLogFn;
  ready: NextLogFn;
  info: NextLogFn;
  event: NextLogFn;
  trace: NextLogFn;
  bootstrap: (message: string) => void;
  warnOnce?: NextLogFn;
  errorOnce?: NextLogFn;
}

/**
 * Type guard: narrows `unknown` to {@link ConsolaInstance} by checking for the
 * two methods both patches depend on (`.withTag()` + `.log()`).
 *
 * Used when resolving a config file's `consola` key — the value may be a
 * partial options object, a factory, or a fully built instance.
 */
export function isConsolaInstance(value: unknown): value is ConsolaInstance {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ConsolaInstance).withTag === "function" &&
    typeof (value as ConsolaInstance).log === "function"
  );
}

/**
 * Core abstraction for @vsfedorenko/next-logger.
 *
 * A {@link Logger} is the minimal interface every logging backend must
 * implement. A {@link BackendAdapter} is a factory that creates a Logger from
 * serialisable options. Adapters register themselves by name so
 * {@link buildLogger} can pick them via config.
 *
 * Both `ConsolaInstance` and pino instances satisfy `Logger` natively or via
 * thin adapter wrappers.
 */

import { createRegistry } from "./registry.js";

/**
 * The minimal interface every logging backend must implement.
 *
 * Designed to be structurally compatible with `ConsolaInstance` (consola
 * satisfies it natively) and adaptable for pino, winston, and others.
 */
export interface Logger {
  /** Numeric log level (0=error … 5=trace, consola convention). */
  readonly level: number;
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
  log(...args: unknown[]): void;
  /** Returns a child logger tagged with `tag`. */
  withTag(tag: string): Logger;
}

/**
 * A factory that creates a {@link Logger} from serialisable options.
 *
 * Backends register their adapter so {@link buildLogger} can construct a logger
 * by name at runtime — the options cross the build→runtime boundary as JSON,
 * so they must be plain-serialisable.
 */
export type BackendAdapter = (options: Record<string, unknown>) => Logger;

/** Registry of named backend adapters. */
const backends = createRegistry<BackendAdapter>({
  kind: "backend",
  paramLabel: "adapter",
  valueKind: "an adapter function",
  valueDetail:
    "The adapter is called with backendOptions and must return a Logger instance.",
  article: "a custom backend",
  isValidValue: (adapter) => typeof adapter === "function",
});

/**
 * Register a named backend adapter.
 *
 * Calling `defineBackend` with an existing name replaces the prior adapter.
 *
 * @throws When `name` is not a non-empty string or `adapter` is not a
 * function — a wrong-shaped registration must fail at the registration site,
 * not later as a raw TypeError inside `init()`.
 */
export function defineBackend(name: string, adapter: BackendAdapter): void {
  backends.define(name, adapter);
}

/**
 * Get a registered backend adapter, or throw with the available names listed.
 */
export function getBackend(name: string): BackendAdapter {
  return backends.get(name);
}

/** Check if a backend adapter is registered. */
export function hasBackend(name: string): boolean {
  return backends.has(name);
}

/**
 * Removes a registered backend adapter (mainly for testing).
 *
 * Returns `true` when an adapter was removed.
 */
export function removeBackend(name: string): boolean {
  return backends.remove(name);
}

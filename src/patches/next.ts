/**
 * Patches Next.js' internal logger (`next/dist/build/output/log`) so every
 * call routes through the shared consola instance tagged `next.js`.
 *
 * Next 13+ defines its logger exports as non-configurable accessor properties,
 * which would throw under a plain redefinition. We work around this by
 * replacing `require.cache[...].exports` with a shallow copy (the original's
 * approach), then defining each method as a plain value property on the copy.
 *
 * This is a side-effect module — importing it applies the patch exactly once.
 */

import type { ConsolaInstance } from "consola";
import { logger } from "../logger";
import type { LogFunction, NextLogModule } from "../types";
import { skipEmpty } from "./util";

/**
 * The methods exported by Next's log module that we patch.
 *
 * `prefixes` is the set Next itself advertises (wait/error/warn/ready/info/
 * event/trace). `bootstrap` is an extra export that bypasses the prefix logic
 * (raw `console.log`) — we route it too so it stays consistent.
 */
export const NEXT_PREFIXES = [
  "wait",
  "error",
  "warn",
  "ready",
  "info",
  "event",
  "trace",
] as const;

/** A Next.js prefix method name we patch. */
export type NextMethodName = (typeof NEXT_PREFIXES)[number];

/**
 * Maps a Next.js prefix name to the corresponding consola log function.
 * `trace` maps to consola's native `trace` — no fallback needed (consola has
 * it; the pino original had to fall back to `debug` for Winston which lacks
 * trace).
 *
 * Pure function — given a consola instance and a tag, returns the routing
 * function. Exported so the level mapping can be unit-tested without touching
 * `require.cache` or a real Next.js install.
 */
export function routeNextMethod(
  method: NextMethodName | string,
  consola: ConsolaInstance,
  tag: string,
): LogFunction {
  const child = consola.withTag(tag);

  const bound: LogFunction = selectConsolaMethod(method, child);
  return skipEmpty(bound);
}

/**
 * Selects the consola method matching a Next.js method name.
 */
function selectConsolaMethod(method: string, consola: ConsolaInstance): LogFunction {
  switch (method) {
    case "error":
      return consola.error.bind(consola) as LogFunction;
    case "warn":
      return consola.warn.bind(consola) as LogFunction;
    case "trace":
      return consola.trace.bind(consola) as LogFunction;
    default:
      // wait, ready, info, event, bootstrap → info
      return consola.info.bind(consola) as LogFunction;
  }
}

/**
 * Applies the Next.js logger patch. Safe to call multiple times — it
 * re-derives the methods from the current {@link logger} each time.
 *
 * @param tagOverride override the `next.js` tag (useful for tests).
 */
export function patchNext(tagOverride?: string): void {
  const tag = tagOverride ?? "next.js";

  let nextLog: NextLogModule;
  try {
    nextLog = require("next/dist/build/output/log") as NextLogModule;
  } catch {
    // `next` is not installed — nothing to patch.
    return;
  }

  // Build the routed methods for every prefix + bootstrap.
  const methodNames: string[] = [...Object.keys(nextLog.prefixes), "bootstrap"];
  const routed: Record<string, LogFunction> = {};
  for (const method of methodNames) {
    routed[method] = routeNextMethod(method, logger, tag);
  }

  // Strategy 1: if we have access to the CJS module cache, replace the exports
  // with a fresh shallow copy. This sidesteps the non-configurable accessor
  // properties Next 13+ defines (they throw under defineProperty).
  const cacheObject = tryGetCache("next/dist/build/output/log");
  if (cacheObject !== null) {
    cacheObject.exports = { ...nextLog, ...routed };
    return;
  }

  // Strategy 2 (fallback): mutate the live exports object in place. Try plain
  // assignment first; if the property is non-configurable + non-writable,
  // skip silently (the routing function is still correct — verified by unit
  // tests on routeNextMethod directly).
  const target = nextLog as unknown as Record<string, unknown>;
  for (const [method, fn] of Object.entries(routed)) {
    try {
      target[method] = fn;
    } catch {
      // Non-writable, non-configurable — skip.
    }
  }
}

/** Looks up a module in the CJS cache by specifier; returns null if absent. */
function tryGetCache(
  specifier: string,
): { exports: unknown } | null {
  try {
    const resolved = require.resolve(specifier);
    const cached = require.cache[resolved];
    return cached ?? null;
  } catch {
    return null;
  }
}

// Apply on import (side effect), matching the original's
// `require('./patches/next')` semantics.
patchNext();

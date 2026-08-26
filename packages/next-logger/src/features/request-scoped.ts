/**
 * # Request-scoped logging
 *
 * Uses Node.js `AsyncLocalStorage` to maintain per-request log context across
 * async boundaries — without threading context through every function call.
 *
 * ## Usage with Next.js App Router
 *
 * ```ts
 * // middleware.ts
 * import { runWithLogContext } from "@vsfedorenko/next-logger";
 * import { headers } from "next/headers";
 *
 * export function middleware(request: NextRequest) {
 *   const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
 *   return runWithLogContext({ requestId, route: request.nextUrl.pathname }, () =>
 *     next(request)
 *   );
 * }
 * ```
 *
 * Inside any route handler, `getCurrentLogContext()` returns the active context
 * so you can enrich log entries with `requestId`, `userId`, etc.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import consola, { type ConsolaInstance, type ConsolaOptions } from "consola";
import { defaultConsolaOptions } from "../core/defaults.js";
import { LOG_METHODS, type LogMethodName } from "../core/wrap-logger.js";

/**
 * Per-request context attached to all log entries within the scope.
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  [key: string]: unknown;
}

const als = new AsyncLocalStorage<LogContext>();

/**
 * Runs `fn` with the given log context active. Any code inside `fn` (including
 * async descendants) can call {@link getCurrentLogContext} to retrieve it.
 *
 * Context is cleaned up automatically when `fn` returns or throws.
 *
 * @example
 * ```ts
 * runWithLogContext({ requestId: "abc-123" }, () => {
 *   // getCurrentLogContext() === { requestId: "abc-123" }
 *   logger.info("processing request");
 * });
 * ```
 */
export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return als.run(context, fn);
}

/**
 * Returns the active log context, or `null` if called outside a
 * {@link runWithLogContext} scope.
 */
export function getCurrentLogContext(): LogContext | null {
  return als.getStore() ?? null;
}

/**
 * Creates a consola instance that automatically merges the active request
 * context into every log entry's args.
 *
 * When called inside a `runWithLogContext` scope, each log entry gets an extra
 * object argument with the context fields (requestId, userId, route, ...).
 * Outside a scope, logs pass through unchanged.
 *
 * @example
 * ```ts
 * const reqLogger = createRequestLogger();
 *
 * runWithLogContext({ requestId: "abc" }, () => {
 *   reqLogger.info("hello");
 *   // Output includes: { requestId: "abc" }
 *   // {"level":"info","tag":"app","msg":"hello","requestId":"abc"}
 * });
 * ```
 */
export function createRequestLogger(
  options?: Partial<ConsolaOptions>,
): ConsolaInstance {
  const base = consola.create({
    ...defaultConsolaOptions,
    ...options,
  });

  // Wrap each standard log method in place so the active ALS context is
  // appended as structured data (one cast for the whole loop, not one per
  // method). Note: children from `withTag` are NOT re-wrapped — deliberate
  // divergence from withMetadata/sampleLogger.
  const methods = base as unknown as Record<
    LogMethodName,
    (...args: unknown[]) => void
  >;
  for (const method of LOG_METHODS) {
    const fn = methods[method];
    methods[method] = (...args: unknown[]): void => {
      const ctx = getCurrentLogContext();
      if (ctx && Object.keys(ctx).length > 0) {
        fn(...args, ctx);
        return;
      }
      fn(...args);
    };
  }

  return base;
}

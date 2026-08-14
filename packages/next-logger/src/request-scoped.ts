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
import { createConsola, type ConsolaInstance, type ConsolaOptions } from "consola";
import { defaultConsolaOptions } from "./defaults";

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
  const base = createConsola({
    ...defaultConsolaOptions,
    ...options,
  });

  // Wrap each log method so the active ALS context is appended as structured data.
  const wrap = <F extends (...args: unknown[]) => void>(fn: F): F => {
    return ((...args: unknown[]) => {
      const ctx = getCurrentLogContext();
      if (ctx && Object.keys(ctx).length > 0) {
        return fn(...args, ctx);
      }
      return fn(...args);
    }) as F;
  };

  // Wrap the standard log methods.
  base.trace = wrap(base.trace) as ConsolaInstance["trace"];
  base.debug = wrap(base.debug) as ConsolaInstance["debug"];
  base.info = wrap(base.info) as ConsolaInstance["info"];
  base.warn = wrap(base.warn) as ConsolaInstance["warn"];
  base.error = wrap(base.error) as ConsolaInstance["error"];
  base.fatal = wrap(base.fatal) as ConsolaInstance["fatal"];
  base.log = wrap(base.log) as ConsolaInstance["log"];

  return base;
}

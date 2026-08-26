/**
 * # Correlation IDs
 *
 * Automatic per-request correlation ID propagation built on top of the
 * request-scoped {@link LogContext}. Every request gets a unique ID (or reuses
 * one from the `X-Request-ID` header) that flows through the same
 * `AsyncLocalStorage` used by `createRequestLogger`, so correlation IDs appear
 * in every log entry for that request — no manual threading required.
 *
 * ## Usage with Next.js middleware
 *
 * ```ts
 * // middleware.ts
 * import { correlationMiddleware } from "@vsfedorenko/next-logger";
 *
 * export const middleware = correlationMiddleware();
 * export const config = { matcher: ["/((?!_next).*)"] };
 * ```
 *
 * The middleware reads the incoming `X-Request-ID` header (if present),
 * generates a UUIDv4 when missing, and stores it in the active log context.
 * Downstream code can read it with {@link getCorrelationId} or
 * {@link getOrCreateCorrelationId}.
 *
 * ## Manual usage inside a route handler
 *
 * If you already establish a log context via {@link runWithLogContext}, the
 * correlation helpers operate on that same context:
 *
 * ```ts
 * import { runWithLogContext, getOrCreateCorrelationId } from "@vsfedorenko/next-logger";
 *
 * runWithLogContext({}, () => {
 *   const id = getOrCreateCorrelationId(); // generated + cached for this scope
 *   logger.info({ correlationId: id }, "processing");
 * });
 * ```
 *
 * IDs are stored under the `requestId` key of {@link LogContext}, so they are
 * automatically surfaced by `createRequestLogger`.
 */

import {
  runWithLogContext,
  getCurrentLogContext,
  type LogContext,
} from "./request-scoped.js";

/**
 * The request header consulted for an inbound correlation ID.
 */
export const CORRELATION_HEADER = "X-Request-ID";

/** Key under which the correlation ID is stored inside {@link LogContext}. */
export const CORRELATION_CONTEXT_KEY = "requestId" as const;

/**
 * Reads the correlation ID for the current request scope without generating
 * one. Returns `null` when no scope is active or the ID has not been set.
 *
 * Read-only: this never mutates the active context.
 */
export function getCorrelationId(): string | null {
  const ctx = getCurrentLogContext();
  return (ctx?.[CORRELATION_CONTEXT_KEY] as string | undefined) ?? null;
}

/**
 * Sets the correlation ID for the current request scope.
 *
 * Throws when called outside a {@link runWithLogContext} scope — there is no
 * store to write to.
 *
 * @param id The correlation ID to store.
 */
export function setCorrelationId(id: string): void {
  const ctx = getCurrentLogContext();
  if (!ctx) {
    throw new Error(
      "setCorrelationId() must be called inside a runWithLogContext() scope",
    );
  }
  ctx[CORRELATION_CONTEXT_KEY] = id;
}

/**
 * Returns the correlation ID for the current request scope, generating and
 * caching a new UUID when none is present.
 *
 * If a scope is active but has no correlation ID, a fresh UUIDv4 is generated
 * via `crypto.randomUUID()` and stored so subsequent calls within the same
 * scope return the same value. If no scope is active, a throw-free ephemeral
 * UUID is generated and returned (it is not persisted anywhere).
 */
export function getOrCreateCorrelationId(): string {
  const existing = getCorrelationId();
  if (existing) return existing;

  const id = crypto.randomUUID();

  const ctx = getCurrentLogContext();
  if (ctx) {
    ctx[CORRELATION_CONTEXT_KEY] = id;
  }
  return id;
}

/**
 * A minimal Next.js-style request shape. We accept this narrow interface
 * rather than importing `NextRequest` at runtime so the helper is usable in
 * tests without a Next.js environment.
 */
interface CorrelationRequestLike {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Builds Next.js middleware that propagates a correlation ID for every
 * matched request.
 *
 * Behaviour:
 * 1. Reads the incoming `X-Request-ID` header.
 * 2. If absent, generates a UUIDv4.
 * 3. Establishes (or augments) the active {@link LogContext} with the ID and
 *    runs the downstream handler inside that scope.
 *
 * The returned function mirrors Next.js middleware semantics: it receives the
 * request and a `next` continuation, and returns whatever `next` returns. The
 * correlation ID is established *before* `next` runs so downstream handlers
 * can read it via {@link getCorrelationId}.
 *
 * If a context is already active (e.g. established by an outer
 * {@link runWithLogContext}), its fields are preserved and the correlation ID
 * is merged in.
 *
 * @example
 * ```ts
 * // middleware.ts
 * export const middleware = correlationMiddleware();
 * ```
 */
export function correlationMiddleware(): <T>(
  request: CorrelationRequestLike,
  next: () => T,
) => T {
  return function correlationMiddlewareHandler<T>(
    request: CorrelationRequestLike,
    next: () => T,
  ): T {
    const headerId = request.headers.get(CORRELATION_HEADER);
    // An empty/whitespace value is treated as absent — generate a fresh ID.
    const id = headerId?.trim() || crypto.randomUUID();

    // Merge into any pre-existing context so other fields (userId, route, …)
    // survive. If nothing is active, start a fresh context.
    const parent = getCurrentLogContext() ?? {};
    const context: LogContext = { ...parent, [CORRELATION_CONTEXT_KEY]: id };

    return runWithLogContext(context, next);
  };
}

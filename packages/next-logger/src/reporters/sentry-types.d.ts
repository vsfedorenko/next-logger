/**
 * Ambient declaration for the optional `@sentry/nextjs` peer dependency.
 *
 * `@sentry/nextjs` is listed as an optional peer dependency in package.json —
 * consumers that don't use Sentry don't install it, so it's not available
 * during this package's own build. This minimal ambient module satisfies
 * TypeScript's dynamic-import resolution (`import("@sentry/nextjs")`) without
 * pulling the real package into the dev dependency tree.
 *
 * At runtime, the dynamic import resolves to the consumer's installed copy of
 * `@sentry/nextjs`, or rejects if the package is absent (the reporter catches
 * that and becomes a no-op).
 *
 * This file is an ambient module definition (not an augmentation) — it must
 * be a top-level `.d.ts` with no imports/exports of its own so TypeScript
 * treats it as a module declaration rather than an augmentation.
 */
declare module "@sentry/nextjs" {
  export function addBreadcrumb(breadcrumb: {
    level?: string;
    category?: string;
    message?: string;
    data?: Record<string, unknown>;
  }): void;
}

/**
 * Lazy resolution of optional peer dependencies, shared by the reporters
 * that bridge into one (pino, `@sentry/nextjs`).
 *
 * The import is attempted once and cached: a success resolves to the module
 * forever after; a rejection is caught and `null` is cached so subsequent
 * calls are a silent no-op without retrying. A missing optional install must
 * never break logging.
 */

/**
 * Cache a dynamic import behind a null-safe accessor.
 *
 * @param loader Performs the dynamic `import()` — called at most once.
 * @returns A function resolving to the module, or `null` when the import
 *   failed (peer not installed).
 */
export function memoizeOptionalImport<T>(
  loader: () => Promise<T>,
): () => Promise<T | null> {
  let cached: Promise<T | null> | null = null;
  return (): Promise<T | null> => {
    if (!cached) {
      cached = loader().catch(() => null);
    }
    return cached;
  };
}

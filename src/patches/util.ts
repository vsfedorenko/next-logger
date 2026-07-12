/**
 * Shared helpers for the patch modules.
 */

/**
 * Returns `true` when the arguments constitute an "empty" message — i.e. there
 * is nothing meaningful to log. Used to skip printing when Next.js or `console`
 * calls a method with no arguments, or with only `undefined`/`null`/`""`.
 *
 * Matches the upstream sainsburys-tech/next-logger behaviour where an empty
 * message produces no output, and avoids consola emitting a bare tag line with
 * no payload.
 *
 * Note: falsy-but-present values (`0`, `false`) are **not** considered empty —
 * they carry diagnostic value and are printed normally.
 */
export function isEmptyMessage(args: readonly unknown[]): boolean {
  if (args.length === 0) return true;

  // Skip when every argument is `undefined`, `null`, or `""` — these carry no
  // diagnostic value and would render as an empty/blank line under consola.
  return args.every((arg) => arg === undefined || arg === null || arg === "");
}

/**
 * Wraps a log function so it becomes a no-op for empty messages (see
 * {@link isEmptyMessage}). Non-empty messages pass through unchanged.
 *
 * Generic over the input function's parameter types, so the returned wrapper
 * has the same call signature as `fn` — no `unknown[]` widening.
 */
export function skipEmpty<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
): (...args: TArgs) => void {
  return (...args: TArgs): void => {
    if (isEmptyMessage(args)) return;
    fn(...args);
  };
}

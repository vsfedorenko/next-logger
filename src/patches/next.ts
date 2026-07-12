/**
 * Classifier for Next.js' internal log output captured at the console sink.
 *
 * Next.js' `next/dist/build/output/log` funnels every diagnostic line through
 * `console.log`/`console.warn`/`console.error`, prefixing each with a coloured
 * marker symbol (`▲`, `✓`, `⚠`, …). Detecting that prefix lets the console
 * patch tag those lines as `next.js` rather than `console` — restoring the
 * source distinction WITHOUT monkeypatching Next's module (which is isolated
 * into a separate bundle instance under Turbopack and unreachable via
 * `require.cache`).
 */

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * Marker symbols Next.js prefixes its log lines with (after stripping ANSI
 * colour codes). Covers the startup banner (`▲ Next.js`), `✓ Ready`/`event`,
 * and `⚠` warnings.
 */
const NEXT_MARKERS = ["▲", "✓", "⚠", "●", "✗"] as const;

/**
 * Returns `true` when the given console call args look like a Next.js log line
 * (first string arg, ANSI-stripped, starts with a Next marker symbol).
 */
export function isNextLog(args: readonly unknown[]): boolean {
  const first = args.find((a): a is string => typeof a === "string");
  if (first === undefined) return false;
  const stripped = first.replace(ANSI, "").trimStart();
  return NEXT_MARKERS.some((m) => stripped.startsWith(m));
}

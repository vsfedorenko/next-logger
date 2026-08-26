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
 * Informational prefix dev-server lines carry before the marker symbol
 * (`ℹ ✓ Compiled in …`).
 */
const INFO_PREFIX = "ℹ";

/**
 * Next.js' dev-server request log: `GET /path 200 in 716ms (next.js: 330ms,
 * application-code: 386ms)`. Word-bounded HTTP verb + path + status, with
 * optional route params and timing breakdown in parentheses.
 */
const HTTP_REQUEST_LOG =
  /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^ ]*\s+\d{3}\s+in\s+/;

/**
 * Bracketed plugin/component prefixes the dev server prints without a marker
 * symbol (`[MDX] generated files in …`, `[console 6:12 PM] ERROR [browser] …`).
 */
const BRACKETED_PREFIX = /^\s*\[[^\]]+\]/;

/**
 * Returns `true` when the given console call args look like a Next.js log line:
 * first string arg, ANSI-stripped, either starting with a Next marker symbol
 * (optionally behind an `ℹ` info prefix), or matching the dev-server request
 * log shape, or opening with a bracketed component prefix.
 */
export function isNextLog(args: readonly unknown[]): boolean {
  const first = args.find((a): a is string => typeof a === "string");
  if (first === undefined) return false;
  let stripped = first.replace(ANSI, "").trimStart();
  if (stripped.startsWith(INFO_PREFIX)) {
    stripped = stripped.slice(INFO_PREFIX.length).trimStart();
  }
  return (
    NEXT_MARKERS.some((m) => stripped.startsWith(m)) ||
    HTTP_REQUEST_LOG.test(stripped) ||
    BRACKETED_PREFIX.test(stripped)
  );
}

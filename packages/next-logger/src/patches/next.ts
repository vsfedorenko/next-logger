/**
 * Classifier for Next.js' internal log output, plus the shared vocabulary
 * (ANSI stripping, marker symbols, the `next.js` tag) the other patch modules
 * reuse.
 *
 * Next.js' `next/dist/build/output/log` funnels every diagnostic line through
 * `console.log`/`console.warn`/`console.error`, prefixing each with a coloured
 * marker symbol (`▲`, `✓`, `⚠`, …). Detecting that prefix lets the console
 * patch tag those lines as `next.js` rather than `console` — restoring the
 * source distinction WITHOUT monkeypatching Next's module (which is isolated
 * into a separate bundle instance under Turbopack and unreachable via
 * `require.cache`).
 */

/** Strips ANSI colour codes from a line. */
export const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

/**
 * Marker symbols Next.js prefixes its log lines with (after stripping ANSI
 * colour codes), grouped by the level the patches assign: `▲✓●` → info,
 * `⚠` → warn, `✗` → error. Covers the startup banner (`▲ Next.js`),
 * `✓ Ready`/`event`, and `●` bullet lines.
 */
export const INFO_MARKERS: readonly string[] = ["▲", "✓", "●"];
export const WARN_MARKERS: readonly string[] = ["⚠"];
// ✗ (U+2717) and ⨯ (U+2A2F) are both Next.js failure glyphs — different
// codepoints, same meaning. The dev server prints ⨯ for request errors.
export const ERROR_MARKERS: readonly string[] = ["✗", "⨯"];

/** All marker symbols Next.js prefixes its log lines with. */
const NEXT_MARKERS: readonly string[] = [
  ...INFO_MARKERS,
  ...WARN_MARKERS,
  ...ERROR_MARKERS,
];

/**
 * Informational prefix dev-server lines carry before the marker symbol
 * (`ℹ ✓ Compiled in …`).
 */
const INFO_PREFIX = "ℹ";

/** The source tag the patches assign to recognised Next.js lines. */
export const NEXT_TAG = "next.js";

/** HTTP verbs the dev-server request log prints, in regex-alternation form. */
const HTTP_VERBS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

/**
 * Next.js' dev-server request log: `GET /path 200 in 716ms (next.js: 330ms,
 * application-code: 386ms)`. Word-bounded HTTP verb + path + status, with
 * optional route params and timing breakdown in parentheses.
 */
const HTTP_REQUEST_LOG = new RegExp(
  `^\\s*(${HTTP_VERBS})\\s+\\/[^ ]*\\s+\\d{3}\\s+in\\s+`,
);

/** The request-log shape the stream capture matches (path as a capture group). */
export const HTTP_REQUEST_LOG_CAPTURE = new RegExp(
  `^(${HTTP_VERBS})\\s+(\\S+)\\s+(\\d{3})\\s+in\\s+`,
);

/**
 * Bracketed plugin/component prefixes the dev server prints without a marker
 * symbol (`[MDX] generated files in …`, `[console 6:12 PM] ERROR [browser] …`).
 */
const BRACKETED_PREFIX = /^\s*\[[^\]]+\]/;

/** Strips a leading `ℹ` info prefix from an already ANSI-stripped line. */
export function stripInfoPrefix(line: string): string {
  return line.startsWith(INFO_PREFIX)
    ? line.slice(INFO_PREFIX.length).trimStart()
    : line;
}

/**
 * Returns `true` when the given console call args look like a Next.js log line:
 * first string arg, ANSI-stripped, either starting with a Next marker symbol
 * (optionally behind an `ℹ` info prefix), or matching the dev-server request
 * log shape, or opening with a bracketed component prefix.
 */
export function isNextLog(args: readonly unknown[]): boolean {
  const first = args.find((a): a is string => typeof a === "string");
  if (first === undefined) return false;
  const stripped = stripInfoPrefix(first.replace(ANSI_REGEX, "").trimStart());
  return (
    NEXT_MARKERS.some((m) => stripped.startsWith(m)) ||
    HTTP_REQUEST_LOG.test(stripped) ||
    BRACKETED_PREFIX.test(stripped)
  );
}

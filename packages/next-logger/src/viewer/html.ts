/**
 * Dependency-free HTML rendering for the dev log viewer page.
 */

import type { LogViewerEntry } from "./store.js";

/** Escape text for safe interpolation into the HTML shell. */
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** JSON.stringify that never throws on circular structures. */
function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    }) ?? "undefined";
  } catch {
    return String(value);
  }
}

/**
 * Render the dependency-free HTML page for the given entries (auto-refresh
 * via `<meta http-equiv="refresh">`).
 */
export function renderLogViewerHtml(
  entries: readonly LogViewerEntry[],
  capacity: number,
): string {
  const rows = entries
    .map((e) => {
      const extras = Object.keys(e.extras).length
        ? `<details><summary>extras</summary><pre>${escapeHtml(safeJson(e.extras))}</pre></details>`
        : "";
      return `<tr>
  <td>${new Date(e.time).toISOString()}</td>
  <td class="lvl lvl-${e.level}">${e.levelName}</td>
  <td>${escapeHtml(e.tag)}</td>
  <td>${escapeHtml(e.message)}${extras}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>next-logger — /__logs</title>
<meta http-equiv="refresh" content="5">
<style>
  :root { color-scheme: light dark; }
  body { font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 24px; }
  h1 { font-size: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
  td:nth-child(1) { white-space: nowrap; color: color-mix(in srgb, currentColor 55%, transparent); }
  td:nth-child(2) { white-space: nowrap; font-weight: 600; }
  .lvl-0 { color: #e5484d; } .lvl-1 { color: #e5a13d; } .lvl-3 { color: #4ba0e5; } .lvl-4, .lvl-5 { color: #8a8f98; }
  details { margin-top: 2px; } summary { cursor: pointer; opacity: .6; }
  pre { margin: 4px 0 0; padding: 6px; border-radius: 4px; background: color-mix(in srgb, currentColor 7%, transparent); white-space: pre-wrap; word-break: break-all; }
  .empty { opacity: .6; }
</style>
</head>
<body>
<h1>@vsfedorenko/next-logger — dev log viewer</h1>
<p class="empty">${entries.length} entries · ring capacity ${capacity} · auto-refresh 5s · <a href="?format=json">JSON</a></p>
${entries.length === 0 ? '<p class="empty">No entries captured yet — the viewer reporter captures everything flowing through the logger.</p>' : ""}
<table>
<thead><tr><th>time</th><th>level</th><th>tag</th><th>message</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

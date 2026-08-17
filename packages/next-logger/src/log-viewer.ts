/**
 * Dev-only in-memory log viewer: a ring-buffer store plus a ready-made
 * route handler serving `/__logs`.
 *
 * ## Why globalThis
 *
 * Next.js/Turbopack bundles the instrumentation module and route modules
 * into SEPARATE module instances — a module-level store would be empty in
 * the route. The buffer lives on `globalThis` under a registered symbol,
 * the same instance in every bundle.
 *
 * ## Safety
 *
 * Dev-only by design:
 * - `NODE_ENV === "production"` routes get a 404-style refusal without
 *   touching the store (the handler is guarded; the buffer never fills in
 *   prod when the reporter is only added in dev).
 * - The buffer is bounded (ring) — memory is capped regardless of traffic.
 * - No secrets cross the build→runtime boundary: everything is runtime
 *   state, nothing is read from config.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts
 * import { init, getLogger } from "@vsfedorenko/next-logger";
 * import { createLogViewerReporter, logViewerHandler } from "@vsfedorenko/next-logger/log-viewer";
 *
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === "nodejs") {
 *     if (process.env.NODE_ENV !== "production") {
 *       const { init } = await import("@vsfedorenko/next-logger");
 *       const logger = init();
 *       logger.addReporter(createLogViewerReporter());
 *     }
 *   }
 * }
 *
 * // app/__logs/route.ts
 * import { logViewerHandler } from "@vsfedorenko/next-logger/log-viewer";
 * export const GET = logViewerHandler;
 * ```
 */

import type { ConsolaReporter, LogObject } from "consola";

/** A captured log entry as served by the viewer. */
export interface LogViewerEntry {
  /** Milliseconds since epoch. */
  time: number;
  /** consola numeric level (0=error … 5=trace). */
  level: number;
  /** Level name for display. */
  levelName: string;
  /** Logger tag (e.g. `console`, `next.js`, user tag). */
  tag: string;
  /** Joined string args / message. */
  message: string;
  /** Structured extra args (objects, errors) keyed by arg index. */
  extras: Record<string, unknown>;
}

/** Ring-buffer options. */
export interface LogViewerOptions {
  /** Max entries kept. Default `500`. */
  capacity?: number;
}

const DEFAULT_CAPACITY = 500;

const STORE_KEY = Symbol.for("@vsfedorenko/next-logger/log-viewer");

/** Internal store shape stored on globalThis. */
interface ViewerStore {
  buffer: LogViewerEntry[];
  capacity: number;
  /** Monotonic sequence for stable ordering. */
  seq: number;
  seqs: number[];
}

type GlobalWithStore = typeof globalThis & { [key: symbol]: ViewerStore | undefined };

function getStore(options?: LogViewerOptions): ViewerStore {
  const g = globalThis as GlobalWithStore;
  let store = g[STORE_KEY];
  if (!store) {
    const capacity = options?.capacity ?? DEFAULT_CAPACITY;
    store = { buffer: [], capacity, seq: 0, seqs: [] };
    g[STORE_KEY] = store;
  }
  return store;
}

/** Level index → display name, aligned with consola levels. */
const LEVEL_NAMES: readonly string[] = [
  "ERROR", "WARN", "LOG", "INFO", "DEBUG", "TRACE",
];

/** Test hook: drop the store (unit tests reset state between cases). */
export function resetLogViewer(): void {
  delete (globalThis as GlobalWithStore)[STORE_KEY];
}

/**
 * The captured entries, oldest first.
 *
 * Returns copies — callers (including the HTML renderer) cannot mutate
 * the ring's live state.
 */
export function getLogViewerEntries(): readonly LogViewerEntry[] {
  const store = getStore();
  return store.buffer.map((e) => ({ ...e, extras: { ...e.extras } }));
}

/**
 * A consola reporter that appends every entry to the viewer ring buffer.
 *
 * Cheap by design: one object build + push per entry, no timers, no
 * network. Attach in dev only (see the usage example).
 */
export function createLogViewerReporter(options: LogViewerOptions = {}): ConsolaReporter {
  const store = getStore(options);
  return {
    log(logObj: LogObject): void {
      const args = logObj.args ?? [];
      const messageParts: string[] = [];
      const extras: Record<string, unknown> = {};

      if (logObj.message) messageParts.push(logObj.message);
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg instanceof Error) {
          extras[`arg_${i}`] = { name: arg.name, message: arg.message, stack: arg.stack };
        } else if (typeof arg === "object" && arg !== null) {
          extras[`arg_${i}`] = arg;
        } else {
          messageParts.push(String(arg));
        }
      }

      const level = Math.max(0, Math.min(5, logObj.level));
      const entry: LogViewerEntry = {
        time: (logObj.date ?? new Date()).getTime(),
        level,
        levelName: LEVEL_NAMES[level] ?? "INFO",
        tag: logObj.tag ?? "",
        message: messageParts.join(" ") || "(empty)",
        extras,
      };

      // Ring semantics: push, then trim the oldest beyond capacity.
      store.buffer.push(entry);
      store.seq = store.seq + 1;
      store.seqs.push(store.seq);
      if (store.buffer.length > store.capacity) {
        const drop = store.buffer.length - store.capacity;
        store.buffer.splice(0, drop);
        store.seqs.splice(0, drop);
      }
    },
  };
}

/** Escape text for safe interpolation into the HTML shell. */
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The ready-made route handler for `app/__logs/route.ts`.
 *
 * Serves:
 * - `GET /__logs` — a dependency-free HTML page with the entries table
 *  (auto-refresh via `<meta http-equiv="refresh">`).
 * - `GET /__logs?format=json` — the raw entries as JSON (tooling,
 *  custom UIs).
 *
 * In production (`NODE_ENV === "production"`) responds 404 regardless of
 * what the store holds — the viewer is a development aid, not a surface.
 */
export const logViewerHandler = async (request: Request): Promise<Response> => {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    const entries = getLogViewerEntries();
    return Response.json({ count: entries.length, entries });
  }

  const entries = getLogViewerEntries();
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

  const html = `<!doctype html>
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
<p class="empty">${entries.length} entries · ring capacity ${getStore().capacity} · auto-refresh 5s · <a href="?format=json">JSON</a></p>
${entries.length === 0 ? '<p class="empty">No entries captured yet — the viewer reporter captures everything flowing through the logger.</p>' : ""}
<table>
<thead><tr><th>time</th><th>level</th><th>tag</th><th>message</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

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

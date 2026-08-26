/**
 * Dev-only in-memory log viewer: a ring-buffer store plus a ready-made
 * route handler serving `/__logs`.
 *
 * ## Safety
 *
 * Dev-only by design:
 * - `NODE_ENV === "production"` routes get a 404-style refusal without
 *   touching the store (the handler is guarded; the buffer never fills in
 *   prod when the reporter is only added in dev).
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

import { renderLogViewerHtml } from "./viewer/html.js";
import { getLogViewerEntries, getStore } from "./viewer/store.js";

export { createLogViewerReporter } from "./viewer/reporter.js";
export {
  getLogViewerEntries,
  resetLogViewer,
} from "./viewer/store.js";
export type {
  LogViewerEntry,
  LogViewerOptions,
} from "./viewer/store.js";

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
  const entries = getLogViewerEntries();
  if (url.searchParams.get("format") === "json") {
    return Response.json({ count: entries.length, entries });
  }
  return new Response(renderLogViewerHtml(entries, getStore().capacity), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

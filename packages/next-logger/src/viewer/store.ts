/**
 * Ring-buffer store for the dev log viewer.
 *
 * ## Why globalThis
 *
 * Next.js/Turbopack bundles the instrumentation module and route modules
 * into SEPARATE module instances — a module-level store would be empty in
 * the route. The buffer lives on `globalThis` under a registered symbol,
 * the same instance in every bundle. The ring is bounded — memory is capped
 * regardless of traffic.
 */

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
}

type GlobalWithStore = typeof globalThis & { [key: symbol]: ViewerStore | undefined };

/** The ring store, created on first access (capacity from the first caller). */
export function getStore(options?: LogViewerOptions): ViewerStore {
  const g = globalThis as GlobalWithStore;
  let store = g[STORE_KEY];
  if (!store) {
    const capacity = options?.capacity ?? DEFAULT_CAPACITY;
    store = { buffer: [], capacity };
    g[STORE_KEY] = store;
  }
  return store;
}

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

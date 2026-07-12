/**
 * # @vsfedorenko/next-logger/browser
 *
 * Browser-safe entry — exports a consola instance built from env-driven
 * defaults, WITHOUT the server-side patching machinery.
 *
 * Use this from Client Components or any browser code:
 *
 * ```ts
 * import { logger } from "@vsfedorenko/next-logger/browser";
 *
 * logger.info("hello from the browser");
 * logger.warn("deprecation notice");
 * ```
 *
 * ## Why a separate entry?
 *
 * The main entry (`@vsfedorenko/next-logger`) imports the patch modules, which
 * depend on `require.cache` and `lilconfig` (filesystem) — neither of which
 * exists in a browser bundle. This entry skips those entirely and builds the
 * consola instance directly from {@link defaultConsolaOptions}.
 *
 * ## Level resolution
 *
 * Same as the server entry: `LOG_LEVEL` → `NEXT_PUBLIC_LOG_LEVEL` → `3` (info).
 * For values inlined at build time (visible in the browser bundle), use
 * `NEXT_PUBLIC_LOG_LEVEL`.
 */

import { createConsola } from "consola";
import { defaultConsolaOptions } from "./defaults";

/**
 * The shared consola instance for browser use.
 *
 * Built once from {@link defaultConsolaOptions}. Unlike the server entry, there
 * is no config-file discovery (the browser has no filesystem). Override the
 * level at runtime via `logger.level = N`.
 */
export const logger = createConsola(defaultConsolaOptions);

export { defaultConsolaOptions } from "./defaults";
export { isEmptyMessage, skipEmpty } from "./patches/util";

// Types (browser-safe — pure type re-exports, no runtime import of Node modules).
export type { LogFunction, NextLogFn } from "./types";
export type {
  ConsolaInstance,
  ConsolaOptions,
  FormatOptions,
  LogLevel,
  LogObject,
  LogType,
} from "consola";

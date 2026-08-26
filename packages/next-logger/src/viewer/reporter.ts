/**
 * Consola reporter feeding the viewer ring buffer.
 */

import type { ConsolaReporter, LogObject } from "consola/core";
import { clampLevel } from "../core/defaults.js";
import { splitLogArgs } from "../core/log-args.js";
import { getStore, type LogViewerEntry, type LogViewerOptions } from "./store.js";

/** Level index → display name, aligned with consola levels. */
const LEVEL_NAMES: readonly string[] = [
  "ERROR", "WARN", "LOG", "INFO", "DEBUG", "TRACE",
];

/**
 * A consola reporter that appends every entry to the viewer ring buffer.
 *
 * Cheap by design: one object build + push per entry, no timers, no
 * network. Attach in dev only (see the log-viewer usage example).
 */
export function createLogViewerReporter(
  options: LogViewerOptions = {},
): ConsolaReporter {
  const store = getStore(options);
  return {
    log(logObj: LogObject): void {
      const { messageParts, structured: extras } = splitLogArgs(logObj);

      const level = clampLevel(logObj.level);
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
      if (store.buffer.length > store.capacity) {
        store.buffer.splice(0, store.buffer.length - store.capacity);
      }
    },
  };
}

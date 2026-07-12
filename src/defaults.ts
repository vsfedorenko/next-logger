import { LogLevels, type LogType, type LogLevel, type ConsolaOptions } from "consola";

/**
 * Reverse lookup: consola numeric level → canonical name.
 *
 * Built by inverting consola's exported `LogLevels` (`Record<LogType, number>`),
 * so this is always in sync with the actual library — no hand-rolled map that
 * can drift. Multiple `LogType` values share the same numeric level (e.g.
 * `fatal`/`error` → `0`, `info`/`success`/`ready`/`start`/`box` → `3`).
 *
 * When multiple names share a level, a priority list picks the most
 * universally understood name (e.g. `"error"` over `"fatal"` for level `0`,
 * `"info"` over `"success"`/`"ready"` etc. for level `3`).
 */
const PREFERRED_NAMES: readonly LogType[] = [
  "silent",
  "error", // preferred over "fatal" for level 0
  "warn",
  "log",
  "info", // preferred over "success"/"fail"/"ready"/"start"/"box" for level 3
  "debug",
  "trace",
  "verbose",
];

export const LEVEL_TO_NAME: Readonly<Record<number, LogType>> = (() => {
  const inv: Record<number, LogType> = {};
  // First pass: populate from PREFERRED_NAMES in priority order.
  for (const name of PREFERRED_NAMES) {
    const level = LogLevels[name];
    if (!(level in inv)) inv[level] = name;
  }
  // Second pass: fill any remaining levels from LogLevels (e.g. -Infinity for
  // "silent" is already covered, but this catches edge cases).
  for (const [name, level] of Object.entries(LogLevels)) {
    if (!(level in inv)) inv[level] = name as LogType;
  }
  return inv;
})();

/**
 * Forward lookup: canonical name → consola numeric level.
 *
 * Directly derived from `LogLevels` — the authoritative source.
 */
const NAME_TO_LEVEL: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(LogLevels),
);

/**
 * Clamps an arbitrary number to consola's finite numeric level range `[0, 5]`.
 *
 * `-Infinity` (silent) and `Infinity` (verbose) are consola's sentinels; we
 * collapse them to `0` and `5` respectively for env-var-driven configuration
 * (users typing `LOG_LEVEL=999` get `5` = trace, not an unbounded value).
 */
function clampLevel(n: number): LogLevel {
  if (n <= 0) return 0;
  if (n >= 5) return 5;
  return Math.floor(n) as LogLevel;
}

/**
 * Resolves the default log level from the environment.
 *
 * Priority: `process.env.LOG_LEVEL` (numeric or named) →
 * `process.env.NEXT_PUBLIC_LOG_LEVEL` (same rules; useful when the value must
 * be inlined at build time) → `3` (info).
 *
 * Named values are resolved against consola's canonical `LogLevels` map.
 * Numeric values are clamped to `[0, 5]`.
 */
function resolveLevel(): LogLevel {
  for (const raw of [process.env.LOG_LEVEL, process.env.NEXT_PUBLIC_LOG_LEVEL]) {
    if (raw === undefined || raw === "") continue;

    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return clampLevel(numeric);
    }

    const mapped = NAME_TO_LEVEL[raw.toLowerCase()];
    if (mapped !== undefined) {
      return mapped as LogLevel;
    }
  }

  return 3; // info
}

/**
 * Supported log output formats.
 *
 *   - `text` — consola's default pretty reporter (human-readable, coloured in TTY).
 *   - `json` — newline-delimited JSON to stdout/stderr (structured logging).
 *
 * Server-only; the browser entry always uses consola's built-in browser reporter.
 */
export type LogFormat = "text" | "json";

/**
 * Resolves the log format from the environment.
 *
 * Priority: `LOG_FORMAT` → `NEXT_PUBLIC_LOG_FORMAT` → `text`.
 *
 * Accepts `text`/`json` (case-insensitive). Unknown values fall back to `text`.
 */
export function resolveFormat(): LogFormat {
  const raw = process.env.LOG_FORMAT ?? process.env.NEXT_PUBLIC_LOG_FORMAT;
  if (raw === undefined || raw === "") return "text";
  return raw.toLowerCase() === "json" ? "json" : "text";
}

/**
 * Default consola options for the patched loggers.
 *
 * Unlike the pino original, consola already normalises console-style multi-arg
 * signatures (strings, objects, errors, mixed), so there is no need for a
 * `logMethod` hook. The level is env-driven instead of hardcoded.
 *
 * `colors` is intentionally omitted — consola auto-detects TTY and `CI`
 * internally, so duplicating that logic here would be fragile.
 */
export const defaultConsolaOptions: Readonly<Partial<ConsolaOptions>> = {
  level: resolveLevel(),
  formatOptions: {
    date: true,
    compact: false,
  },
};

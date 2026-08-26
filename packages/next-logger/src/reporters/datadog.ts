/**
 * Datadog Logs reporter for consola — mirrors every log entry to the
 * Datadog Logs intake over HTTP.
 *
 * ## Zero dependencies
 *
 * Unlike the Sentry reporter (optional `@sentry/nextjs` peer), Datadog's
 * intake is a plain HTTP endpoint — the reporter talks to it with global
 * `fetch`. No `@datadog/*` package is needed or ever installed; nothing
 * is added to this library's dependencies. The API key is read from the
 * environment on reporter creation (`DATADOG_API_KEY` / `DD_API_KEY`),
 * never from config: config values cross the build→runtime boundary as
 * JSON and must not carry secrets.
 *
 * ## Batching
 *
 * Entries are buffered and flushed in batches:
 * - when `batchSize` entries accumulate, or
 * - every `flushIntervalMs`, whichever comes first.
 *
 * HTTP failures never throw from `log()` — the batch is dropped with a
 * single stderr warning (logging must not take the app down). When no API
 * key is present the reporter is a no-op with one warning.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts
 * import { getLogger } from "@vsfedorenko/next-logger";
 * import { createDatadogLogsReporter } from "@vsfedorenko/next-logger/reporters/datadog";
 *
 * getLogger().addReporter(
 *   createDatadogLogsReporter({
 *     service: "my-next-app",
 *     env: process.env.NODE_ENV,
 *     ddtags: "region:us,team:web",
 *   }),
 * );
 * ```
 */

import type { ConsolaReporter, LogObject } from "consola/core";
import { clampLevel } from "../core/defaults.js";
import { splitLogArgs } from "../core/log-args.js";
import { createBatchingReporter } from "./batching.js";

/** Datadog log status values, ordered from most to least severe. */
type DatadogStatus = "emergency" | "alert" | "critical" | "error" | "warning" | "notice" | "info" | "debug";

/**
 * Map consola's numeric level to a Datadog status.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
 */
const STATUS_MAP: readonly DatadogStatus[] = [
  "error", // 0 — error / fatal
  "warning", // 1 — warn
  "info", // 2 — log
  "info", // 3 — info / success / ready
  "debug", // 4 — debug
  "debug", // 5 — trace / verbose
];

/** JSON-serialisable options — they may cross the build→runtime boundary. */
export interface DatadogLogsReporterOptions {
  /** Datadog site — the `<site>` in `http-intake.logs.<site>`. Default `datadoghq.com`. */
  site?: string;
  /** The `service` attribute attached to every log entry. */
  service?: string;
  /** The `env` attribute (ddtags-style) attached to every entry. */
  env?: string;
  /** Comma-separated `key:value` tags attached to every entry. */
  ddtags?: string;
  /** Full intake URL override (self-hosted / tests). Defaults to `https://http-intake.logs.<site>/api/v2/logs`. */
  intakeUrl?: string;
  /** Entries per flush batch. Default `50`. */
  batchSize?: number;
  /** Max milliseconds a buffered entry waits before flush. Default `5000`. */
  flushIntervalMs?: number;
}

/**
 * A ConsolaReporter with an explicit flush: entries buffered below the
 * batch threshold would otherwise be lost at process shutdown.
 */
export interface DatadogReporter extends ConsolaReporter {
  /** Ship any buffered entries immediately. Call on shutdown/beforeExit. */
  flush(): void;
}

/** A single entry of the Datadog intake payload. */
export interface DatadogLogEntry {
  message: string;
  status: DatadogStatus;
  service?: string;
  ddsource?: string;
  ddtags?: string;
  [key: string]: unknown;
}

const DEFAULT_SITE = "datadoghq.com";
const DEFAULT_SOURCE = "next-logger";

/**
 * Build a Datadog intake entry from a consola log object.
 *
 * Pure function — no network, fully testable in isolation.
 *
 * - String arguments and `logObj.message` join into `message`.
 * - `Error` instances become structured `{ name, message, stack }`.
 * - Other objects are spread into the entry as extra attributes.
 */
export function logObjectToDatadogEntry(
  logObj: LogObject,
  opts: Pick<DatadogLogsReporterOptions, "service" | "env" | "ddtags"> = {},
): DatadogLogEntry {
  const status = STATUS_MAP[clampLevel(logObj.level)] ?? "info";
  const { messageParts, structured: extra } = splitLogArgs(logObj);

  const tags = [opts.env ? `env:${opts.env}` : "", opts.ddtags ?? ""].filter(Boolean).join(",");

  const entry: DatadogLogEntry = {
    message: messageParts.join(" ") || "(empty)",
    status,
    ddsource: DEFAULT_SOURCE,
  };
  if (opts.service) entry.service = opts.service;
  if (tags) entry.ddtags = tags;
  Object.assign(entry, extra);
  return entry;
}

/** Read the Datadog API key from the environment (never from config). */
function readApiKey(): string | undefined {
  return process.env.DATADOG_API_KEY ?? process.env.DD_API_KEY ?? undefined;
}

/**
 * Create a consola reporter that batches log entries and ships them to the
 * Datadog Logs intake via `fetch`.
 *
 * Safe to attach unconditionally:
 * - No API key in the environment → one-time warning, then a silent no-op.
 * - Intake unreachable / non-2xx → the batch is dropped with a single
 *   stderr warning; `log()` never throws and never blocks.
 */
export function createDatadogLogsReporter(
  options: DatadogLogsReporterOptions = {},
  transport: typeof fetch = fetch,
): DatadogReporter {
  const apiKey = readApiKey();

  if (!apiKey) {
    console.warn(
      "@vsfedorenko/next-logger: datadog reporter is a no-op — set DATADOG_API_KEY (or DD_API_KEY) to enable it",
    );
    return { log() {}, flush() {} };
  }

  const site = options.site ?? DEFAULT_SITE;
  const intakeUrl =
    options.intakeUrl ?? `https://http-intake.logs.${site}/api/v2/logs`;

  return createBatchingReporter<DatadogLogEntry>({
    url: intakeUrl,
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": apiKey,
    },
    toEntry: (logObj) => logObjectToDatadogEntry(logObj, options),
    buildBody: JSON.stringify,
    label: "datadog",
    entryNoun: "entries",
    batchSize: options.batchSize,
    flushIntervalMs: options.flushIntervalMs,
    transport,
  });
}

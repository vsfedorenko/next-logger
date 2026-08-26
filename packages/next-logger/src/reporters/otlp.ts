/**
 * OpenTelemetry OTLP/HTTP JSON logs reporter for consola — mirrors every
 * log entry to an OpenTelemetry Collector over HTTP.
 *
 * ## Zero dependencies
 *
 * The OTLP/HTTP JSON protocol is a plain HTTP endpoint with a JSON body —
 * the reporter talks to it with global `fetch`. No `@opentelemetry/*`
 * package is needed or ever installed; nothing is added to this library's
 * dependencies. Endpoint and headers are resolved from the spec-defined
 * environment variables (`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` and friends,
 * falling back to the generic `OTEL_EXPORTER_OTLP_ENDPOINT`) at reporter
 * creation, never from config: config values cross the build→runtime
 * boundary as JSON and must not carry secrets.
 *
 * ## Semantic conventions
 *
 * Entries map to OTLP `LogRecord`s following the log data-model mapping:
 * - `severityNumber` derived from consola's numeric level (offset into the
 *   1–24 range, clamped), `severityText` from the level name.
 * - `body` joins string args and `logObj.message`.
 * - `Error` args land in `attributes["arg_N.exception"]` as structured
 *   `{ type, message, stack }`; plain objects as `attributes["arg_N"]`.
 * - Resource `service.name` from options or `OTEL_SERVICE_NAME`.
 *
 * ## Batching
 *
 * Entries are buffered and flushed in batches:
 * - when `batchSize` entries accumulate, or
 * - every `flushIntervalMs`, whichever comes first.
 *
 * HTTP failures never throw from `log()` — the batch is dropped with a
 * single stderr warning (logging must not take the app down). Without a
 * configured endpoint the reporter is a no-op with one warning.
 *
 * ## Usage
 *
 * ```ts
 * // instrumentation.ts
 * import { logger } from "@vsfedorenko/next-logger/logger";
 * import { createOtlpLogsReporter } from "@vsfedorenko/next-logger/reporters/otlp";
 *
 * logger.addReporter(
 *   createOtlpLogsReporter({
 *     serviceName: "my-next-app",
 *   }),
 * );
 * ```
 */

import type { ConsolaReporter, LogObject } from "consola/core";

/** OTLP severity numbers, 1 (TRACE) … 24 (FATAL). */
type SeverityNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

/** Severity text aligned with the OTLP log data-model severity mapping. */
const SEVERITY_TEXT: readonly string[] = [
  "ERROR", // 0 — error / fatal
  "WARN", // 1 — warn
  "INFO", // 2 — log
  "INFO", // 3 — info / success / ready
  "DEBUG", // 4 — debug
  "TRACE", // 5 — trace / verbose
];

/** JSON-serialisable options — they may cross the build→runtime boundary. */
export interface OtlpLogsReporterOptions {
  /** Full collector endpoint, e.g. `http://localhost:4318/v1/logs`. Overrides env resolution when set. */
  endpoint?: string;
  /** Resource `service.name`. Falls back to `OTEL_SERVICE_NAME`. */
  serviceName?: string;
  /** Extra resource attributes merged into the resource. */
  resourceAttributes?: Record<string, string>;
  /** Scope name for the emitted `scopeLogs`. Default `@vsfedorenko/next-logger`. */
  scopeName?: string;
  /** Additional headers (e.g. vendor gateway auth) resolved by the caller, never from config. */
  headers?: Record<string, string>;
  /** Log records per flush batch. Default `50`. */
  batchSize?: number;
  /** Max milliseconds a buffered record waits before flush. Default `5000`. */
  flushIntervalMs?: number;
}

/**
 * A ConsolaReporter with an explicit flush: records buffered below the
 * batch threshold would otherwise be lost at process shutdown.
 */
export interface OtlpReporter extends ConsolaReporter {
  /** Ship any buffered records immediately. Call on shutdown/beforeExit. */
  flush(): void;
}

/** A single OTLP `LogRecord` (JSON-serialisable subset). */
export interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: SeverityNumber;
  severityText: string;
  body: string;
  attributes?: Record<string, unknown>;
}

/** The OTLP JSON export request for the logs signal. */
export interface OtlpLogsExportRequest {
  resourceLogs: Array<{
    resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
    scopeLogs: Array<{
      scope: { name: string; version?: string };
      logRecords: OtlpLogRecord[];
    }>;
  }>;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_SCOPE_NAME = "@vsfedorenko/next-logger";

/**
 * Map consola's numeric level (0–5) to an OTLP severityNumber.
 *
 * Consola: 0=error/fatal, 1=warn, 2=log, 3=info, 4=debug, 5=trace/verbose.
 * OTLP: 1=TRACE … 24=FATAL. Consola levels map to the 9–19 band
 * (INFO=9..) and out-of-range levels clamp to the nearest end.
 */
export function consolaLevelToSeverityNumber(level: number): SeverityNumber {
  const mapped = 9 + 2 * Math.max(0, Math.min(5, Math.trunc(level)));
  return Math.max(1, Math.min(24, mapped)) as SeverityNumber;
}

/**
 * Build an OTLP `LogRecord` from a consola log object.
 *
 * Pure function — no network, fully testable in isolation.
 *
 * - String arguments and `logObj.message` join into `body`.
 * - `Error` instances become structured `attributes["arg_N.exception"]`
 *   of `{ type, message, stack }`.
 * - Other objects land in `attributes["arg_N"]`.
 */
export function logObjectToOtlpRecord(logObj: LogObject): OtlpLogRecord {
  const level = Math.max(0, Math.min(5, logObj.level));
  const severityNumber = consolaLevelToSeverityNumber(level);
  const severityText = SEVERITY_TEXT[level] ?? "INFO";

  const args = logObj.args ?? [];
  const bodyParts: string[] = [];
  const attributes: Record<string, unknown> = {};

  if (logObj.message) bodyParts.push(logObj.message);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      attributes[`arg_${i}.exception`] = { type: arg.name, message: arg.message, stack: arg.stack };
    } else if (typeof arg === "object" && arg !== null) {
      attributes[`arg_${i}`] = arg;
    } else {
      bodyParts.push(String(arg));
    }
  }

  const record: OtlpLogRecord = {
    timeUnixNano: unixNanoString(logObj.date ?? new Date()),
    severityNumber,
    severityText,
    body: bodyParts.join(" ") || "(empty)",
  };
  if (Object.keys(attributes).length > 0) record.attributes = attributes;
  return record;
}

/** Format a Date as the OTLP `timeUnixNano` string (ns since epoch, no exponent). */
function unixNanoString(date: Date): string {
  return `${BigInt(Math.trunc(date.getTime())) * 1_000_000n}`;
}

/**
 * Resolve the OTLP logs endpoint from the spec-defined environment
 * variables. Signal-specific wins over generic; `/v1/logs` is appended to
 * a generic base per the OTLP spec when the signal path is absent.
 */
export function resolveOtlpEndpoint(): string | undefined {
  const signal = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
  if (signal) return signal;

  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (base) return base.replace(/\/+$/, "") + "/v1/logs";

  return undefined;
}

/**
 * Create a consola reporter that batches log records and ships them to an
 * OpenTelemetry Collector via OTLP/HTTP JSON.
 *
 * Safe to attach unconditionally:
 * - No endpoint in the environment → one-time warning, then a silent no-op.
 * - Collector unreachable / non-2xx → the batch is dropped with a single
 *   stderr warning; `log()` never throws and never blocks.
 */
export function createOtlpLogsReporter(
  options: OtlpLogsReporterOptions = {},
  transport: typeof fetch = fetch,
): OtlpReporter {
  const endpoint = options.endpoint ?? resolveOtlpEndpoint();

  if (!endpoint) {
    console.warn(
      "@vsfedorenko/next-logger: otlp reporter is a no-op — set OTEL_EXPORTER_OTLP_LOGS_ENDPOINT (or OTEL_EXPORTER_OTLP_ENDPOINT) to enable it",
    );
    return { log() {}, flush() {} };
  }

  const serviceName = options.serviceName ?? process.env.OTEL_SERVICE_NAME;
  const resourceAttrs: Array<{ key: string; value: { stringValue: string } }> = [];
  if (serviceName) resourceAttrs.push({ key: "service.name", value: { stringValue: serviceName } });
  for (const [k, v] of Object.entries(options.resourceAttributes ?? {})) {
    resourceAttrs.push({ key: k, value: { stringValue: v } });
  }

  const scopeName = options.scopeName ?? DEFAULT_SCOPE_NAME;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...options.headers };

  let buffer: OtlpLogRecord[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Wrap buffered records into the OTLP JSON export request. */
  const buildRequestBody = (records: OtlpLogRecord[]): string => {
    const request: OtlpLogsExportRequest = {
      resourceLogs: [
        {
          resource: { attributes: resourceAttrs },
          scopeLogs: [{ scope: { name: scopeName }, logRecords: records }],
        },
      ],
    };
    return JSON.stringify(request);
  };

  /** Flush any buffered records now (shutdown hooks, tests). */
  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return;

    const batch = buffer;
    buffer = [];

    void transport(endpoint, {
      method: "POST",
      headers,
      body: buildRequestBody(batch),
    }).catch((err: unknown) => {
      console.warn(
        `@vsfedorenko/next-logger: otlp reporter dropped a batch of ${batch.length} records (${String(err)})`,
      );
    });
  };

  const reporter: OtlpReporter = {
    log(logObj: LogObject) {
      buffer.push(logObjectToOtlpRecord(logObj));
      if (buffer.length >= batchSize) {
        flush();
        return;
      }
      if (timer === null) {
        timer = setTimeout(flush, flushIntervalMs);
      }
    },
    flush,
  };
  return reporter;
}

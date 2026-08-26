/**
 * Shared batching skeleton for network reporters.
 *
 * The Datadog and OTLP reporters buffer entries and ship them over HTTP with
 * identical mechanics: flush when `batchSize` entries accumulate or every
 * `flushIntervalMs` (whichever comes first), never throw from `log()`, and
 * drop a failed batch with a single stderr warning. This module is that
 * skeleton, expressed once — a reporter only supplies the URL, headers, and
 * the entry/body serialisation.
 */

import type { ConsolaReporter, LogObject } from "consola/core";

/** Batching knobs shared by every batching reporter. */
export interface BatchingOptions {
  /** Entries per flush batch. Default `50`. */
  batchSize?: number;
  /** Max milliseconds a buffered entry waits before flush. Default `5000`. */
  flushIntervalMs?: number;
}

/**
 * A ConsolaReporter with an explicit flush: entries buffered below the batch
 * threshold would otherwise be lost at process shutdown.
 */
export interface FlushableReporter extends ConsolaReporter {
  /** Ship any buffered entries immediately. Call on shutdown/beforeExit. */
  flush(): void;
}

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

/** What a batching reporter supplies beyond the shared skeleton. */
export interface BatchingConfig<TEntry> extends BatchingOptions {
  /** Intake URL POSTed to on every flush. */
  url: string;
  /** Request headers (including auth and `Content-Type`). */
  headers: Record<string, string>;
  /** Convert a consola log object into a buffered entry. */
  toEntry(logObj: LogObject): TEntry;
  /** Serialise a batch into the request body. */
  buildBody(batch: TEntry[]): string;
  /** Reporter label used in the dropped-batch warning (`"datadog"`, …). */
  label: string;
  /** Plural noun for buffered items in the warning (`"entries"`, …). */
  entryNoun: string;
  /** Injectable transport (tests). Defaults to global `fetch`. */
  transport?: typeof fetch;
}

/**
 * Create a ConsolaReporter that buffers `toEntry` output and POSTs batches.
 *
 * Failures never throw from `log()` — the batch is dropped with a single
 * stderr warning (logging must not take the app down).
 */
export function createBatchingReporter<TEntry>(
  config: BatchingConfig<TEntry>,
): FlushableReporter {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const transport = config.transport ?? fetch;

  let buffer: TEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Flush any buffered entries now (shutdown hooks, tests). */
  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return;

    const batch = buffer;
    buffer = [];

    void transport(config.url, {
      method: "POST",
      headers: config.headers,
      body: config.buildBody(batch),
    }).catch((err: unknown) => {
      console.warn(
        `@vsfedorenko/next-logger: ${config.label} reporter dropped a batch of ` +
          `${batch.length} ${config.entryNoun} (${String(err)})`,
      );
    });
  };

  return {
    log(logObj: LogObject) {
      buffer.push(config.toEntry(logObj));
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
}

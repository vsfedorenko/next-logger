/**
 * # Log sampling
 *
 * Rate-limit noisy loggers by dropping a deterministic fraction of log calls.
 * Useful for high-volume loggers (request logs, hot-loop debug traces) where
 * you'd rather see a representative sample than pay the volume cost of every
 * single entry.
 *
 * ## Resolution
 *
 * The sample rate resolves from the `LOG_SAMPLE_RATE` environment variable
 * (a float between `0.0` and `1.0`). The default is `1.0` — log everything.
 *
 * ```bash
 * # Log ~10% of entries from a noisy logger.
 * LOG_SAMPLE_RATE=0.1 next dev
 * ```
 *
 * ## Deterministic vs random
 *
 * `createSamplingWrapper` uses a counter-based scheme when the rate is an
 * exact fraction (`1/n`). This keeps the effective ratio exact and makes tests
 * reproducible. When the rate is not a clean fraction, the wrapper still uses
 * the counter so the ratio stays as close to the target as possible.
 */

import type { Logger } from "./backend.js";

/** Default sample rate — log everything. */
export const DEFAULT_SAMPLE_RATE = 1.0;

/**
 * Creates a sampling wrapper that calls `fn` for a deterministic fraction of
 * invocations.
 *
 * - `rate >= 1` — always calls `fn`.
 * - `rate <= 0` — never calls `fn`.
 * - otherwise — uses a monotonic counter so the effective ratio tracks `rate`
 *   as closely as possible (e.g. `rate = 0.1` calls `fn` once every 10 calls).
 *
 * The returned wrapper is stateful: the counter is shared across all calls to
 * the same wrapper instance. Each `createSamplingWrapper` call owns its own
 * counter.
 *
 * @example
 * ```ts
 * const sample = createSamplingWrapper(0.1); // keep 1 in 10
 * sample(() => logger.info("noisy line"));
 * ```
 */
export function createSamplingWrapper(
  rate: number,
): (fn: () => void) => void {
  if (!Number.isFinite(rate) || rate <= 0) {
    return () => {};
  }
  if (rate >= 1) {
    return (fn) => fn();
  }

  let counter = 0;

  return (fn: () => void) => {
    counter += 1;
    // Floor-difference keeps the long-run ratio at exactly ⌊N·rate⌋/N and
    // spreads sampled calls as evenly as possible. Computed fresh from the
    // integer counter each call (no running accumulator), so IEEE-754 rounding
    // never drifts — the pattern is fully deterministic and reproducible.
    const prev = Math.floor((counter - 1) * rate);
    const curr = Math.floor(counter * rate);
    if (curr > prev) {
      fn();
    }
  };
}

/**
 * Resolves the configured sample rate from the environment.
 *
 * Reads `LOG_SAMPLE_RATE` (a float between `0.0` and `1.0`). Falls back to
 * {@link DEFAULT_SAMPLE_RATE} (`1.0`) when the variable is absent, empty, or
 * outside the valid range.
 *
 * @returns A number in the closed interval `[0, 1]`.
 */
export function resolveSampleRate(): number {
  const raw = process.env.LOG_SAMPLE_RATE;
  if (raw == null || raw === "") return DEFAULT_SAMPLE_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SAMPLE_RATE;

  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

/** Log methods that {@link sampleLogger} wraps. */
type SampledMethod =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "log";

/**
 * Wraps a {@link Logger} so each log call is sampled at the given rate.
 *
 * Returns a new {@link Logger} that forwards a deterministic fraction of calls
 * to the underlying logger; the rest are dropped. `withTag` is preserved —
 * a child logger's calls are sampled independently (its own counter) using the
 * same rate, so tagging doesn't change the effective sample ratio.
 *
 * @example
 * ```ts
 * const noisy = sampleLogger(getLogger(), 0.1); // keep ~10%
 * noisy.info("request handled", { path: "/healthz" });
 * noisy.withTag("db").debug("query");            // still ~10%
 * ```
 */
export function sampleLogger(logger: Logger, rate: number): Logger {
  const sample = createSamplingWrapper(rate);

  const wrap =
    (method: SampledMethod) =>
    (...args: unknown[]): void => {
      sample(() => logger[method](...args));
    };

  return {
    get level() {
      return logger.level;
    },
    withTag(tag: string): Logger {
      return sampleLogger(logger.withTag(tag), rate);
    },
    trace: wrap("trace"),
    debug: wrap("debug"),
    info: wrap("info"),
    warn: wrap("warn"),
    error: wrap("error"),
    fatal: wrap("fatal"),
    log: wrap("log"),
  };
}

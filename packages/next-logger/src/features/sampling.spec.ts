import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSamplingWrapper,
  resolveSampleRate,
  sampleLogger,
  DEFAULT_SAMPLE_RATE,
} from "./sampling.js";

/** Minimal Logger stub: records every call to a sampled method. */
function makeFakeLogger() {
  const calls: Record<string, unknown[][]> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
    log: [],
  };
  const logger = {
    level: 3,
    trace: (...a: unknown[]) => calls.trace.push(a),
    debug: (...a: unknown[]) => calls.debug.push(a),
    info: (...a: unknown[]) => calls.info.push(a),
    warn: (...a: unknown[]) => calls.warn.push(a),
    error: (...a: unknown[]) => calls.error.push(a),
    fatal: (...a: unknown[]) => calls.fatal.push(a),
    log: (...a: unknown[]) => calls.log.push(a),
    withTag: vi.fn((tag: string) => {
      // Return a proper child logger so sampleLogger can recurse into it.
      void tag;
      return makeFakeLogger().logger;
    }),
  };
  return { logger, calls };
}

describe("createSamplingWrapper", () => {
  it("always calls fn when rate >= 1", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(1);
    for (let i = 0; i < 100; i++) sample(fn);
    expect(fn).toHaveBeenCalledTimes(100);
  });

  it("always calls fn when rate > 1 (clamped to always)", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(2.5);
    for (let i = 0; i < 10; i++) sample(fn);
    expect(fn).toHaveBeenCalledTimes(10);
  });

  it("never calls fn when rate <= 0", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(0);
    for (let i = 0; i < 100; i++) sample(fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it("never calls fn for NaN / non-finite rates", () => {
    const fn = vi.fn();
    const negInf = createSamplingWrapper(Number.NEGATIVE_INFINITY);
    for (let i = 0; i < 5; i++) negInf(fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it("deterministically samples at rate = 0.5 (every other call)", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(0.5);
    for (let i = 0; i < 100; i++) sample(fn);
    // 0.5 → exactly half.
    expect(fn).toHaveBeenCalledTimes(50);
  });

  it("deterministically samples at rate = 0.1 (1 in 10)", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(0.1);
    for (let i = 0; i < 1000; i++) sample(fn);
    // 0.1 → exactly 1/10.
    expect(fn).toHaveBeenCalledTimes(100);
  });

  it("deterministically samples at rate = 0.3", () => {
    const fn = vi.fn();
    const sample = createSamplingWrapper(0.3);
    for (let i = 0; i < 1000; i++) sample(fn);
    expect(fn).toHaveBeenCalledTimes(300);
  });

  it("spreads samples across calls (not all at the start/end)", () => {
    // For rate = 0.1, samples land at 0-indexed positions 9, 19, 29 (every
    // 10th call) under the floor-difference scheme.
    const indices: number[] = [];
    const sample = createSamplingWrapper(0.1);
    for (let i = 0; i < 30; i++) {
      sample(() => indices.push(i));
    }
    expect(indices).toEqual([9, 19, 29]);
  });

  it("uses an independent counter per wrapper instance", () => {
    const a = vi.fn();
    const b = vi.fn();
    const sampleA = createSamplingWrapper(0.5);
    const sampleB = createSamplingWrapper(0.5);
    for (let i = 0; i < 10; i++) sampleA(a);
    for (let i = 0; i < 10; i++) sampleB(b);
    expect(a).toHaveBeenCalledTimes(5);
    expect(b).toHaveBeenCalledTimes(5);
  });
});

describe("resolveSampleRate", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LOG_SAMPLE_RATE;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("defaults to 1.0 when the var is absent", () => {
    expect(resolveSampleRate()).toBe(DEFAULT_SAMPLE_RATE);
    expect(resolveSampleRate()).toBe(1.0);
  });

  it("defaults to 1.0 when the var is empty string", () => {
    process.env.LOG_SAMPLE_RATE = "";
    expect(resolveSampleRate()).toBe(1.0);
  });

  it("reads a numeric value", () => {
    process.env.LOG_SAMPLE_RATE = "0.1";
    expect(resolveSampleRate()).toBeCloseTo(0.1);
  });

  it("reads 0.5", () => {
    process.env.LOG_SAMPLE_RATE = "0.5";
    expect(resolveSampleRate()).toBe(0.5);
  });

  it("reads 0", () => {
    process.env.LOG_SAMPLE_RATE = "0";
    expect(resolveSampleRate()).toBe(0);
  });

  it("reads 1", () => {
    process.env.LOG_SAMPLE_RATE = "1";
    expect(resolveSampleRate()).toBe(1);
  });

  it("falls back to default for non-numeric garbage", () => {
    process.env.LOG_SAMPLE_RATE = "not-a-rate";
    expect(resolveSampleRate()).toBe(1.0);
  });

  it("clamps values below 0 to 0", () => {
    process.env.LOG_SAMPLE_RATE = "-0.5";
    expect(resolveSampleRate()).toBe(0);
  });

  it("clamps values above 1 to 1", () => {
    process.env.LOG_SAMPLE_RATE = "3";
    expect(resolveSampleRate()).toBe(1);
  });
});

describe("sampleLogger", () => {
  it("wraps all standard log methods", () => {
    const { logger } = makeFakeLogger();
    const sampled = sampleLogger(logger, 1);
    for (const m of [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
      "log",
    ] as const) {
      expect(typeof sampled[m]).toBe("function");
      sampled[m]("hi");
    }
  });

  it("forwards every call when rate = 1", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 1);
    sampled.info("a");
    sampled.info("b");
    expect(calls.info).toHaveLength(2);
    expect(calls.info[0]).toEqual(["a"]);
    expect(calls.info[1]).toEqual(["b"]);
  });

  it("drops every call when rate = 0", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0);
    sampled.info("a");
    sampled.error("boom");
    sampled.debug("d");
    expect(calls.info).toHaveLength(0);
    expect(calls.error).toHaveLength(0);
    expect(calls.debug).toHaveLength(0);
  });

  it("samples each method independently at rate = 0.5", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0.5);
    for (let i = 0; i < 100; i++) sampled.info("x");
    for (let i = 0; i < 100; i++) sampled.error("y");
    expect(calls.info).toHaveLength(50);
    expect(calls.error).toHaveLength(50);
  });

  it("spreads samples across log calls (rate = 0.5)", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0.5);
    for (let i = 0; i < 4; i++) sampled.info(i);
    // 0.5 keeps calls at 0-indexed positions 1 and 3.
    expect(calls.info).toEqual([[1], [3]]);
  });

  it("samples at rate = 0.1 → 1 in 10", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0.1);
    for (let i = 0; i < 100; i++) sampled.info(i);
    expect(calls.info).toHaveLength(10);
  });

  it("preserves args through the sampled call", () => {
    const { logger, calls } = makeFakeLogger();
    const sampled = sampleLogger(logger, 1);
    sampled.info("msg", 1, { key: "val" }, [1, 2]);
    expect(calls.info[0]).toEqual(["msg", 1, { key: "val" }, [1, 2]]);
  });

  it("exposes the underlying logger's level", () => {
    const { logger } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0.5);
    expect(sampled.level).toBe(logger.level);
  });

  it("level reflects updates on the underlying logger", () => {
    const { logger } = makeFakeLogger();
    const sampled = sampleLogger(logger, 0.5);
    logger.level = 5;
    expect(sampled.level).toBe(5);
  });

  describe("withTag", () => {
    it("returns a Logger (has all log methods)", () => {
      const { logger } = makeFakeLogger();
      const sampled = sampleLogger(logger, 1);
      const child = sampled.withTag("db");
      for (const m of [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "log",
      ] as const) {
        expect(typeof child[m]).toBe("function");
      }
    });

    it("delegates withTag to the underlying logger", () => {
      const { logger } = makeFakeLogger();
      const sampled = sampleLogger(logger, 1);
      sampled.withTag("api");
      expect(logger.withTag).toHaveBeenCalledWith("api");
    });

    it("child logger is independently sampled at the same rate", () => {
      const infoCalls: unknown[][] = [];
      const tagged: { logger: object; calls: Record<string, unknown[][]> } = {
        logger: null as unknown as object,
        calls: { info: infoCalls },
      };
      const base = {
        level: 3,
        info: (...a: unknown[]) => {},
        debug: (...a: unknown[]) => {},
        trace: (...a: unknown[]) => {},
        warn: (...a: unknown[]) => {},
        error: (...a: unknown[]) => {},
        fatal: (...a: unknown[]) => {},
        log: (...a: unknown[]) => {},
        withTag: vi.fn(() => {
          const child = {
            level: 3,
            trace: (...a: unknown[]) => {},
            debug: (...a: unknown[]) => {},
            info: (...a: unknown[]) => infoCalls.push(a),
            warn: (...a: unknown[]) => {},
            error: (...a: unknown[]) => {},
            fatal: (...a: unknown[]) => {},
            log: (...a: unknown[]) => {},
            withTag: vi.fn(),
          };
          tagged.logger = child;
          return child;
        }),
      };
      const sampled = sampleLogger(base as unknown as Parameters<typeof sampleLogger>[0], 0.5);
      const child = sampled.withTag("db");
      for (let i = 0; i < 100; i++) child.info("q");
      // Child has its own counter; 100 calls at 0.5 → 50 forwarded.
      expect(infoCalls).toHaveLength(50);
      expect(base.withTag).toHaveBeenCalledWith("db");
    });
  });
});

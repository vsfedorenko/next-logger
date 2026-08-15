import { describe, expect, it } from "vitest";
import {
  createWinstonBackend,
  registerWinstonBackend,
  wrapWinston,
  consolaLevelToWinston,
  winstonLabelToConsola,
} from "./winston";
import { getBackend, hasBackend } from "../backend";
import type { Logger } from "../backend";

/**
 * Winston backend adapter tests.
 *
 * `winston` is an optional peer dependency and is NOT installed in this repo's
 * dev tree. We test:
 * - Pure level-mapping functions (no winston required).
 * - wrapWinston with a mock winston instance (no winston required).
 * - The adapter throws a clear error when winston is not installed.
 * - Registration works.
 *
 * The mock winston instance satisfies the internal WinstonLogger interface.
 */

/** The inner mock winston logger shape. */
interface MockWinstonInner {
  level: string;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  verbose(...args: unknown[]): void;
  child(options: Record<string, unknown>): MockWinstonInner;
}

/** Wrapper returned by makeMockWinston — carries the mock + captured calls. */
interface MockWinston {
  winston: MockWinstonInner;
  calls: { level: string; args: unknown[] }[];
}

/** A minimal mock winston logger for testing wrapWinston. */
function makeMockWinston(level: string = "info"): MockWinston {
  const calls: { level: string; args: unknown[] }[] = [];
  const winston: MockWinstonInner = {
    level,
    error(...args: unknown[]) {
      calls.push({ level: "error", args });
    },
    warn(...args: unknown[]) {
      calls.push({ level: "warn", args });
    },
    info(...args: unknown[]) {
      calls.push({ level: "info", args });
    },
    debug(...args: unknown[]) {
      calls.push({ level: "debug", args });
    },
    verbose(...args: unknown[]) {
      calls.push({ level: "verbose", args });
    },
    child(_options: Record<string, unknown>) {
      return makeMockWinston(level).winston;
    },
  };
  return { winston, calls };
}

describe("consolaLevelToWinston", () => {
  it("maps level 0 (error/fatal) → error", () => {
    expect(consolaLevelToWinston(0)).toBe("error");
  });

  it("maps level 1 (warn) → warn", () => {
    expect(consolaLevelToWinston(1)).toBe("warn");
  });

  it("maps level 2 (log) → info", () => {
    expect(consolaLevelToWinston(2)).toBe("info");
  });

  it("maps level 3 (info) → info", () => {
    expect(consolaLevelToWinston(3)).toBe("info");
  });

  it("maps level 4 (debug) → debug", () => {
    expect(consolaLevelToWinston(4)).toBe("debug");
  });

  it("maps level 5 (trace/verbose) → verbose", () => {
    expect(consolaLevelToWinston(5)).toBe("verbose");
  });

  it("clamps negative levels to 0 → error", () => {
    expect(consolaLevelToWinston(-5)).toBe("error");
  });

  it("clamps levels above 5 to verbose", () => {
    expect(consolaLevelToWinston(99)).toBe("verbose");
  });

  it("floors fractional levels", () => {
    expect(consolaLevelToWinston(3.9)).toBe("info");
    expect(consolaLevelToWinston(4.9)).toBe("debug");
  });
});

describe("winstonLabelToConsola", () => {
  it("maps winston error → 0", () => {
    expect(winstonLabelToConsola("error")).toBe(0);
  });

  it("maps winston warn → 1", () => {
    expect(winstonLabelToConsola("warn")).toBe(1);
  });

  it("maps winston info → 3", () => {
    expect(winstonLabelToConsola("info")).toBe(3);
  });

  it("maps winston debug → 4", () => {
    expect(winstonLabelToConsola("debug")).toBe(4);
  });

  it("maps winston verbose → 5", () => {
    expect(winstonLabelToConsola("verbose")).toBe(5);
  });

  it("defaults unknown labels to 3", () => {
    expect(winstonLabelToConsola("unknown")).toBe(3);
  });
});

describe("wrapWinston", () => {
  it("returns a Logger with all required methods", () => {
    const { winston } = makeMockWinston();
    const logger = wrapWinston(winston);
    expect(typeof logger.level).toBe("number");
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.fatal).toBe("function");
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.withTag).toBe("function");
  });

  it("exposes level as consola numeric (reverse-mapped from winston level label)", () => {
    const { winston: winstonInfo } = makeMockWinston("info");
    expect(wrapWinston(winstonInfo).level).toBe(3);

    const { winston: winstonDebug } = makeMockWinston("debug");
    expect(wrapWinston(winstonDebug).level).toBe(4);

    const { winston: winstonWarn } = makeMockWinston("warn");
    expect(wrapWinston(winstonWarn).level).toBe(1);

    const { winston: winstonVerbose } = makeMockWinston("verbose");
    expect(wrapWinston(winstonVerbose).level).toBe(5);
  });

  it("info() calls winston.info", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.info("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe("info");
    expect(calls[0].args).toContain("hello");
  });

  it("error() calls winston.error", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.error("boom");
    expect(calls[0].level).toBe("error");
  });

  it("warn() calls winston.warn", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.warn("careful");
    expect(calls[0].level).toBe("warn");
  });

  it("debug() calls winston.debug", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.debug("dbg");
    expect(calls[0].level).toBe("debug");
  });

  it("trace() calls winston.verbose", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.trace("tr");
    expect(calls[0].level).toBe("verbose");
  });

  it("fatal() calls winston.error", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.fatal("fatal");
    expect(calls[0].level).toBe("error");
  });

  it("log() maps to winston.info (winston has no 'log' level)", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.log("msg");
    expect(calls[0].level).toBe("info");
  });

  it("passes multiple args through verbatim to winston", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    logger.info("hello", "world", { key: "value" });
    expect(calls[0].args).toEqual(["hello", "world", { key: "value" }]);
  });

  it("passes object args through verbatim", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    const obj = { key: "value" };
    logger.info(obj);
    expect(calls[0].args).toEqual([obj]);
  });

  it("passes Error args through verbatim", () => {
    const { winston, calls } = makeMockWinston();
    const logger = wrapWinston(winston);
    const err = new Error("boom");
    logger.error(err);
    expect(calls[0].args).toEqual([err]);
  });

  it("withTag returns a child Logger", () => {
    const { winston } = makeMockWinston();
    const logger = wrapWinston(winston);
    const child = logger.withTag("my-tag");
    expect(typeof child.info).toBe("function");
    expect(child).not.toBe(logger);
  });

  it("withTag child is a valid Logger", () => {
    const { winston } = makeMockWinston();
    const logger = wrapWinston(winston);
    const child = logger.withTag("child");
    // Calling a method on the child should not throw and the child should be
    // a functional Logger (the child delegates to a winston.child() instance).
    expect(() => child.info("from child")).not.toThrow();
    expect(typeof child.error).toBe("function");
    expect(typeof child.withTag).toBe("function");
  });
});

describe("createWinstonBackend", () => {
  it("returns a factory function", () => {
    const factory = createWinstonBackend();
    expect(typeof factory).toBe("function");
  });
});

// "winston is not installed" behaviour lives in ./winston-missing.spec.ts:
// the monorepo root hoists winston (an e2e fixture dependency), so absence
// must be exercised against the built package in a sandbox.

describe("registerWinstonBackend", () => {
  it("registers the backend under name 'winston'", () => {
    registerWinstonBackend();
    expect(hasBackend("winston")).toBe(true);
    const adapter = getBackend("winston");
    expect(typeof adapter).toBe("function");
  });

  it("is idempotent", () => {
    registerWinstonBackend();
    registerWinstonBackend();
    expect(hasBackend("winston")).toBe(true);
  });
});

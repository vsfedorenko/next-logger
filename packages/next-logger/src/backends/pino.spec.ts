import { describe, expect, it, vi } from "vitest";
import {
  createPinoBackend,
  registerPinoBackend,
  wrapPino,
  pinoLabelToConsola,
} from "./pino.js";
import { getBackend, hasBackend } from "../core/backend.js";
import type { Logger } from "../core/backend.js";

/**
 * Pino backend adapter tests.
 *
 * `pino` is an optional peer dependency and is NOT installed in this repo's
 * dev tree. We test:
 * - Pure level-mapping functions (no pino required).
 * - wrapPino with a mock pino instance (no pino required).
 * - The adapter throws a clear error when pino is not installed.
 * - Registration works.
 *
 * The mock pino instance satisfies the internal PinoLogger interface.
 */

/** The inner mock pino logger shape. */
interface MockPinoInner {
  level: string;
  error(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  trace(obj: Record<string, unknown>, msg?: string): void;
  fatal(obj: Record<string, unknown>, msg?: string): void;
  child(bindings: Record<string, unknown>): MockPinoInner;
}

/** Wrapper returned by makeMockPino — carries the mock + captured calls. */
interface MockPino {
  pino: MockPinoInner;
  calls: { level: string; msg: string }[];
}

/** A minimal mock pino logger for testing wrapPino. */
function makeMockPino(level: string = "info"): MockPino {
  const calls: { level: string; msg: string }[] = [];
  const pino: MockPinoInner = {
    level,
    error(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "error", msg: msg ?? "" });
    },
    warn(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "warn", msg: msg ?? "" });
    },
    info(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "info", msg: msg ?? "" });
    },
    debug(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "debug", msg: msg ?? "" });
    },
    trace(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "trace", msg: msg ?? "" });
    },
    fatal(_obj: Record<string, unknown>, msg?: string) {
      calls.push({ level: "fatal", msg: msg ?? "" });
    },
    child(_bindings: Record<string, unknown>) {
      return makeMockPino(level).pino;
    },
  };
  return { pino, calls };
}

describe("pinoLabelToConsola", () => {
  it("maps pino fatal → 0", () => {
    expect(pinoLabelToConsola("fatal")).toBe(0);
  });

  it("maps pino error → 0", () => {
    expect(pinoLabelToConsola("error")).toBe(0);
  });

  it("maps pino warn → 1", () => {
    expect(pinoLabelToConsola("warn")).toBe(1);
  });

  it("maps pino info → 3", () => {
    expect(pinoLabelToConsola("info")).toBe(3);
  });

  it("maps pino debug → 4", () => {
    expect(pinoLabelToConsola("debug")).toBe(4);
  });

  it("maps pino trace → 5", () => {
    expect(pinoLabelToConsola("trace")).toBe(5);
  });

  it("defaults unknown labels to 3", () => {
    expect(pinoLabelToConsola("unknown")).toBe(3);
  });
});

describe("wrapPino", () => {
  it("returns a Logger with all required methods", () => {
    const { pino } = makeMockPino();
    const logger = wrapPino(pino);
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

  it("exposes level as consola numeric (reverse-mapped from pino level label)", () => {
    const { pino: pinoInfo } = makeMockPino("info");
    expect(wrapPino(pinoInfo).level).toBe(3);

    const { pino: pinoDebug } = makeMockPino("debug");
    expect(wrapPino(pinoDebug).level).toBe(4);

    const { pino: pinoWarn } = makeMockPino("warn");
    expect(wrapPino(pinoWarn).level).toBe(1);
  });

  it("info() calls pino.info", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.info("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe("info");
    expect(calls[0].msg).toContain("hello");
  });

  it("error() calls pino.error", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.error("boom");
    expect(calls[0].level).toBe("error");
  });

  it("warn() calls pino.warn", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.warn("careful");
    expect(calls[0].level).toBe("warn");
  });

  it("debug() calls pino.debug", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.debug("dbg");
    expect(calls[0].level).toBe("debug");
  });

  it("trace() calls pino.trace", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.trace("tr");
    expect(calls[0].level).toBe("trace");
  });

  it("fatal() calls pino.fatal", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.fatal("fatal");
    expect(calls[0].level).toBe("fatal");
  });

  it("log() maps to pino.info (pino has no 'log' level)", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.log("msg");
    expect(calls[0].level).toBe("info");
  });

  it("joins multiple string args into the message", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.info("hello", "world");
    expect(calls[0].msg).toBe("hello world");
  });

  it("serialises object args via JSON.stringify", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.info({ key: "value" });
    expect(calls[0].msg).toBe(JSON.stringify({ key: "value" }));
  });

  it("serialises Error args as message", () => {
    const { pino, calls } = makeMockPino();
    const logger = wrapPino(pino);
    logger.info(new Error("boom"));
    expect(calls[0].msg).toBe("boom");
  });

  it("withTag returns a child Logger", () => {
    const { pino } = makeMockPino();
    const logger = wrapPino(pino);
    const child = logger.withTag("my-tag");
    expect(typeof child.info).toBe("function");
    expect(child).not.toBe(logger);
  });

  it("withTag child is a valid Logger", () => {
    const { pino } = makeMockPino();
    const logger = wrapPino(pino);
    const child = logger.withTag("child");
    // Calling a method on the child should not throw and the child should be
    // a functional Logger (the child delegates to a pino.child() instance).
    expect(() => child.info("from child")).not.toThrow();
    expect(typeof child.error).toBe("function");
    expect(typeof child.withTag).toBe("function");
  });
});

describe("createPinoBackend", () => {
  it("returns a factory function", () => {
    const factory = createPinoBackend();
    expect(typeof factory).toBe("function");
  });
});

// "pino is not installed" behaviour lives in ./missing-peers.spec.ts: the
// monorepo root hoists pino (an e2e fixture dependency), so absence must be
// simulated with a module mock rather than the real dependency tree.

describe("registerPinoBackend", () => {
  it("registers the backend under name 'pino'", () => {
    registerPinoBackend();
    expect(hasBackend("pino")).toBe(true);
    const adapter = getBackend("pino");
    expect(typeof adapter).toBe("function");
  });

  it("is idempotent", () => {
    registerPinoBackend();
    registerPinoBackend();
    expect(hasBackend("pino")).toBe(true);
  });
});

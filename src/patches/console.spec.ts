import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConsola, type ConsolaInstance } from "consola";
import { routeConsoleMethod, patchConsole, CONSOLE_METHODS } from "./console";

/**
 * Console patch tests.
 *
 * We test the pure `routeConsoleMethod` function directly (it takes a consola
 * instance + tag and returns the bound method). This avoids fragility from
 * mutating the global `console` under vitest's module layer.
 */

describe("patches/console — routeConsoleMethod", () => {
  // A real consola instance with a mock reporter so we can capture output.
  function makeConsolaWithSpy(): {
    consola: ConsolaInstance;
    calls: { type: string; tag: string; args: unknown[] }[];
  } {
    const calls: { type: string; tag: string; args: unknown[] }[] = [];
    const consola = createConsola({
      level: 5,
      reporters: [
        {
          log(logObj) {
            calls.push({ type: logObj.type, tag: logObj.tag, args: logObj.args });
          },
        },
      ],
    });
    return { consola, calls };
  }

  it("routes console.log → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn("hello", "world");
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("info");
    expect(calls[0].args).toEqual(["hello", "world"]);
  });

  it("routes console.info → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("info", consola, "console");
    fn("info msg");
    expect(calls[0].type).toBe("info");
  });

  it("routes console.debug → consola debug", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("debug", consola, "console");
    fn("debug msg");
    expect(calls[0].type).toBe("debug");
  });

  it("routes console.warn → consola warn", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("warn", consola, "console");
    fn("warn msg");
    expect(calls[0].type).toBe("warn");
  });

  it("routes console.error → consola error", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("error", consola, "console");
    fn("error msg");
    expect(calls[0].type).toBe("error");
  });

  it("passes objects and errors through unchanged", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("error", consola, "console");
    const obj = { key: "value" };
    const err = new Error("boom");
    fn(obj, err);
    expect(calls[0].args).toEqual([obj, err]);
  });

  it("tags the child logger with the provided tag", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn("tagged");
    expect(calls[0].tag).toBe("console");
  });

  it("applies a custom tag when provided", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "my-custom-tag");
    fn("tagged");
    expect(calls[0].tag).toBe("my-custom-tag");
  });

  it("skips printing when called with no arguments", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn();
    expect(calls).toHaveLength(0);
  });

  it("skips printing when called with only undefined/null/empty-string", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn(undefined, null, "");
    expect(calls).toHaveLength(0);
  });

  it("prints when at least one argument is non-empty", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn("", "actual message", null);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["", "actual message", null]);
  });

  it("prints falsy-but-present values (0, false)", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeConsoleMethod("log", consola, "console");
    fn(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([0]);
    calls.length = 0;
    fn(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([false]);
  });

  it("default switch arm routes unknown methods to consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    // Pass an unrecognised method name to hit the default arm.
    const fn = routeConsoleMethod("trace", consola, "console");
    fn("unknown");
    expect(calls[0].type).toBe("info");
  });
});

/**
 * patchConsole integration tests — exercises the side-effectful mutation of the
 * global `console` object and the `isNextLog` classification (tagging).
 */
describe("patches/console — patchConsole (global mutation)", () => {
  const origConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  // A real consola instance with a mock reporter so we can capture output.
  function makeConsolaWithSpy(): {
    consola: ConsolaInstance;
    calls: { type: string; tag: string; args: unknown[] }[];
  } {
    const calls: { type: string; tag: string; args: unknown[] }[] = [];
    const consola = createConsola({
      level: 5,
      reporters: [
        {
          log(logObj) {
            calls.push({ type: logObj.type, tag: logObj.tag, args: logObj.args });
          },
        },
      ],
    });
    return { consola, calls };
  }

  beforeEach(() => {
    // Restore originals before each patch.
    console.log = origConsole.log;
    console.debug = origConsole.debug;
    console.info = origConsole.info;
    console.warn = origConsole.warn;
    console.error = origConsole.error;
  });

  afterEach(() => {
    console.log = origConsole.log;
    console.debug = origConsole.debug;
    console.info = origConsole.info;
    console.warn = origConsole.warn;
    console.error = origConsole.error;
  });

  it("wraps all CONSOLE_METHODS", () => {
    const { consola } = makeConsolaWithSpy();
    const originals = {
      log: console.log,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    patchConsole(consola);
    expect(console.log).not.toBe(originals.log);
    expect(console.debug).not.toBe(originals.debug);
    expect(console.info).not.toBe(originals.info);
    expect(console.warn).not.toBe(originals.warn);
    expect(console.error).not.toBe(originals.error);
  });

  it("routes console.log through consola as info with 'console' tag", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.log("app message");
    expect(calls).toHaveLength(1);
    expect(calls[0].type).toBe("info");
    expect(calls[0].tag).toBe("console");
    expect(calls[0].args).toEqual(["app message"]);
  });

  it("routes console.error through consola as error", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.error("something broke");
    expect(calls[0].type).toBe("error");
    expect(calls[0].tag).toBe("console");
  });

  it("routes console.warn through consola as warn", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.warn("be careful");
    expect(calls[0].type).toBe("warn");
  });

  it("routes console.debug through consola as debug", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.debug("debugging");
    expect(calls[0].type).toBe("debug");
  });

  it("routes console.info through consola as info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.info("informational");
    expect(calls[0].type).toBe("info");
  });

  it("tags Next.js log lines (▲ marker) as 'next.js'", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.log("▲ Next.js 14.0.0");
    expect(calls[0].tag).toBe("next.js");
  });

  it("tags Next.js log lines (✓ marker) as 'next.js'", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.log("✓ Ready in 1200ms");
    expect(calls[0].tag).toBe("next.js");
  });

  it("tags Next.js warning lines (⚠ marker) as 'next.js'", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.warn("⚠ deprecated API");
    expect(calls[0].tag).toBe("next.js");
  });

  it("skips empty console.log calls (no consola output)", () => {
    const { consola, calls } = makeConsolaWithSpy();
    patchConsole(consola);
    console.log();
    console.log(undefined, null, "");
    expect(calls).toHaveLength(0);
  });
});

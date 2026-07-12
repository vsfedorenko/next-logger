import { describe, expect, it } from "vitest";
import { createConsola, type ConsolaInstance } from "consola";
import { routeConsoleMethod } from "./console";

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
});

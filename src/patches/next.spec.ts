import { describe, expect, it, vi } from "vitest";
import { createConsola, type ConsolaInstance } from "consola";
import { routeNextMethod, patchNext, NEXT_PREFIXES } from "./next";

/**
 * Next.js logger patch tests.
 *
 * Like the console tests, we verify the pure `routeNextMethod` function
 * directly (takes consola + tag → returns bound method). The side-effect
 * `patchNext()` is tested for graceful no-op when `next` is absent.
 */

describe("patches/next — routeNextMethod", () => {
  function makeConsolaWithSpy(): {
    consola: ConsolaInstance;
    calls: { type: string; args: unknown[] }[];
  } {
    const calls: { type: string; args: unknown[] }[] = [];
    const consola = createConsola({
      level: 5,
      reporters: [
        {
          log(logObj) {
            calls.push({ type: logObj.type, args: logObj.args });
          },
        },
      ],
    });
    return { consola, calls };
  }

  it("routes next.info → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("info", consola, "next.js");
    fn("server ready");
    expect(calls[0].type).toBe("info");
    expect(calls[0].args).toEqual(["server ready"]);
  });

  it("routes next.ready → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("ready", consola, "next.js");
    fn("ready");
    expect(calls[0].type).toBe("info");
  });

  it("routes next.event → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("event", consola, "next.js");
    fn("compiled");
    expect(calls[0].type).toBe("info");
  });

  it("routes next.wait → consola info", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("wait", consola, "next.js");
    fn("waiting");
    expect(calls[0].type).toBe("info");
  });

  it("routes next.error → consola error", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("error", consola, "next.js");
    fn("failed");
    expect(calls[0].type).toBe("error");
  });

  it("routes next.warn → consola warn", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("warn", consola, "next.js");
    fn("deprecated");
    expect(calls[0].type).toBe("warn");
  });

  it("routes next.trace → consola trace (native, no debug fallback)", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("trace", consola, "next.js");
    fn("detail");
    expect(calls[0].type).toBe("trace");
  });

  it("tags the child logger with the provided tag", () => {
    const consola = createConsola({ level: 5 });
    const spy = vi.spyOn(consola, "withTag");
    routeNextMethod("info", consola, "custom-next");
    expect(spy).toHaveBeenCalledWith("custom-next");
    spy.mockRestore();
  });

  it("exposes all Next prefix method names", () => {
    expect(NEXT_PREFIXES).toEqual([
      "wait", "error", "warn", "ready", "info", "event", "trace",
    ]);
  });

  it("skips printing when called with no arguments", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("info", consola, "next.js");
    fn();
    expect(calls).toHaveLength(0);
  });

  it("skips printing when called with only undefined/null/empty-string", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("info", consola, "next.js");
    fn(undefined, null, "");
    expect(calls).toHaveLength(0);
  });

  it("prints when at least one argument is non-empty", () => {
    const { consola, calls } = makeConsolaWithSpy();
    const fn = routeNextMethod("info", consola, "next.js");
    fn("", "compiled", null);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["", "compiled", null]);
  });
});

describe("patches/next — patchNext()", () => {
  it("is a no-op when next is not installed (does not throw)", () => {
    expect(() => patchNext()).not.toThrow();
  });
});

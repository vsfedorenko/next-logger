import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser entry tests — verifies `next-log/browser` exports a working
 * consola instance built from defaults WITHOUT importing the server-side
 * patching machinery (no lilconfig, no require.cache).
 */

async function loadBrowser() {
  vi.resetModules();
  return await import("./browser");
}

describe("browser entry", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("exports a consola instance with standard methods", async () => {
    const { logger } = await loadBrowser();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.withTag).toBe("function");
  });

  it("respects LOG_LEVEL env var", async () => {
    process.env.LOG_LEVEL = "4";
    const { logger } = await loadBrowser();
    expect(logger.level).toBe(4);
  });

  it("defaults to level 3 (info) without env vars", async () => {
    const { logger } = await loadBrowser();
    expect(logger.level).toBe(3);
  });

  it("exports defaultConsolaOptions", async () => {
    const { defaultConsolaOptions } = await loadBrowser();
    expect(defaultConsolaOptions.level).toBe(3);
    expect(defaultConsolaOptions.formatOptions).toBeDefined();
  });

  it("exports pure utility functions", async () => {
    const { isEmptyMessage, skipEmpty } = await loadBrowser();
    expect(isEmptyMessage([])).toBe(true);
    expect(isEmptyMessage(["x"])).toBe(false);

    const fn = vi.fn();
    const wrapped = skipEmpty(fn);
    wrapped(); // empty → no-op
    wrapped("actual"); // non-empty → calls fn
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("actual");
  });

  it("does NOT import server-only modules (no patches, no config)", async () => {
    // Spy on require to verify the browser entry doesn't pull in lilconfig
    // or the patch modules.
    const seen: string[] = [];
    const Module = require("module");
    const origLoad = Module._load;
    Module._load = function (request: string, ...args: unknown[]) {
      seen.push(request);
      return origLoad.call(this, request, ...args);
    };

    try {
      vi.resetModules();
      await import("./browser");
    } finally {
      Module._load = origLoad;
    }

    // Must NOT load the server-side config or patches.
    const forbidden = seen.filter(
      (m) =>
        m.includes("lilconfig") ||
        m.includes("patches/next") ||
        m.includes("patches/console") ||
        m.includes("presets/all") ||
        m.includes("src/config"),
    );
    expect(forbidden).toEqual([]);
  });

  it("produces a tagged child logger via withTag", async () => {
    const { logger } = await loadBrowser();
    const child = logger.withTag("my-component");
    expect(typeof child.info).toBe("function");
    // Child should be a consola instance too.
    expect(typeof child.withTag).toBe("function");
  });
});

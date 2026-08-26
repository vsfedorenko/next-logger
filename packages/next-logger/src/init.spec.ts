import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * init() tests.
 *
 * `init` holds module-level state (`active`), so each test reloads the module
 * fresh via `vi.resetModules()` to start from a clean slate. We verify the
 * console-patching side effect by capturing the global `console` methods before
 * calling init, then asserting they were replaced.
 */

describe("init", () => {
  const origEnv = { ...process.env };
  const origConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
    delete process.env.NEXT_LOGGER_CONFIG;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    console.log = origConsole.log;
    console.debug = origConsole.debug;
    console.info = origConsole.info;
    console.warn = origConsole.warn;
    console.error = origConsole.error;
  });

  async function loadInit() {
    return await import("./init.js");
  }

  it("builds and returns a consola instance", async () => {
    const { init } = await loadInit();
    const instance = init();
    expect(instance).toBeDefined();
    expect(typeof instance.info).toBe("function");
    expect(typeof instance.error).toBe("function");
  });

  it("patches console.* by default", async () => {
    const { init } = await loadInit();
    const original = console.log;

    init();

    // init() should have replaced console.log with a wrapper.
    expect(console.log).not.toBe(original);
  });

  it("skips patching console when console:false", async () => {
    const { init } = await loadInit();
    const original = console.log;

    init({ console: false });

    // console.log should remain the original — unpatched.
    expect(console.log).toBe(original);
  });

  it("getLogger() returns the instance built by init()", async () => {
    const { init, getLogger } = await loadInit();
    const instance = init();
    expect(getLogger()).toBe(instance);
  });

  it("getLogger() throws before init() is called", async () => {
    const { getLogger } = await loadInit();
    expect(() => getLogger()).toThrow(
      "@vsfedorenko/next-logger: call init() before getLogger().",
    );
  });

  it("double-init is safe and returns the same instance", async () => {
    const { init } = await loadInit();
    const first = init();
    const second = init();
    expect(second).toBe(first);
  });

  it("console:false does not block getLogger()", async () => {
    const { init, getLogger } = await loadInit();
    const instance = init({ console: false });
    expect(getLogger()).toBe(instance);
  });

  it("patched console methods do not throw on valid calls", async () => {
    const { init } = await loadInit();
    init();
    expect(() => console.log("test")).not.toThrow();
    expect(() => console.info("test")).not.toThrow();
    expect(() => console.debug("test")).not.toThrow();
    expect(() => console.warn("test")).not.toThrow();
    expect(() => console.error("test")).not.toThrow();
  });
});

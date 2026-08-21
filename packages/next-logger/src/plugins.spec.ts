import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsola, type ConsolaReporter, type LogObject } from "consola";

/**
 * Plugin system tests — defineReporter / definePreset registries, config
 * preset expansion, and reporter attachment in buildLogger.
 *
 * Registries and `active` logger hold module-level state, so tests that touch
 * them reload the modules fresh via `vi.resetModules()`.
 */

/** Captures LogObjects passed to a reporter — the assertion substrate. */
function makeCapture(): {
  reporter: ConsolaReporter;
  entries: LogObject[];
} {
  const entries: LogObject[] = [];
  return {
    entries,
    reporter: {
      log(logObj: LogObject) {
        entries.push(logObj);
      },
    },
  };
}

describe("reporter registry", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  async function load() {
    return await import("./plugins");
  }

  it("registers and resolves a reporter factory by name", async () => {
    const { defineReporter, getReporter } = await load();
    const factory = vi.fn(() => makeCapture().reporter);
    defineReporter("custom", factory);
    expect(getReporter("custom")).toBe(factory);
  });

  it("passes options through to the factory", async () => {
    const { defineReporter, getReporter } = await load();
    const factory = vi.fn<(o: Record<string, unknown>) => ConsolaReporter>(
      () => makeCapture().reporter,
    );
    defineReporter("custom", factory);
    getReporter("custom")({ service: "x" });
    expect(factory).toHaveBeenCalledWith({ service: "x" });
  });

  it("re-registering a name replaces the factory", async () => {
    const { defineReporter, getReporter } = await load();
    const first = vi.fn(() => makeCapture().reporter);
    const second = vi.fn(() => makeCapture().reporter);
    defineReporter("custom", first);
    defineReporter("custom", second);
    expect(getReporter("custom")).toBe(second);
  });

  it("getReporter throws with available names for unknown reporter", async () => {
    const { getReporter } = await load();
    expect(() => getReporter("nope")).toThrow(
      /reporter "nope" is not registered/,
    );
    expect(() => getReporter("nope")).toThrow(/json/);
  });

  it("hasReporter / removeReporter round-trip", async () => {
    const { defineReporter, hasReporter, removeReporter } = await load();
    expect(hasReporter("tmp")).toBe(false);
    defineReporter("tmp", () => makeCapture().reporter);
    expect(hasReporter("tmp")).toBe(true);
    expect(removeReporter("tmp")).toBe(true);
    expect(hasReporter("tmp")).toBe(false);
    expect(removeReporter("tmp")).toBe(false);
  });

  it("ships a built-in json reporter factory", async () => {
    const { getReporter } = await load();
    expect(getReporter("json")).toBeTypeOf("function");
    const reporter = getReporter("json")({});
    expect(reporter.log).toBeTypeOf("function");
  });
});

describe("preset registry", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  async function load() {
    return await import("./plugins");
  }

  it("registers and reads back a preset", async () => {
    const { definePreset, getPreset } = await load();
    const preset = { reporters: [{ name: "json" }] };
    definePreset("production", preset);
    expect(getPreset("production")).toBe(preset);
  });

  it("re-registering a name replaces the preset", async () => {
    const { definePreset, getPreset } = await load();
    definePreset("x", {});
    const replacement = { backend: "pino" };
    definePreset("x", replacement);
    expect(getPreset("x")).toBe(replacement);
  });

  it("getPreset throws with available names for unknown preset", async () => {
    const { getPreset } = await load();
    expect(() => getPreset("nope")).toThrow(/preset "nope" is not registered/);
  });

  it("hasPreset / removePreset round-trip", async () => {
    const { definePreset, hasPreset, removePreset } = await load();
    expect(hasPreset("tmp")).toBe(false);
    definePreset("tmp", {});
    expect(hasPreset("tmp")).toBe(true);
    expect(removePreset("tmp")).toBe(true);
    expect(hasPreset("tmp")).toBe(false);
  });
});

describe("resolveReporters", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  async function load() {
    return await import("./plugins");
  }

  it("returns an empty array for undefined specs", async () => {
    const { resolveReporters } = await load();
    expect(resolveReporters(undefined)).toEqual([]);
  });

  it("accepts bare factory-name strings as shorthand", async () => {
    const { defineReporter, resolveReporters } = await load();
    const r = makeCapture().reporter;
    defineReporter("shorthand", () => r);

    expect(resolveReporters(["shorthand"])).toEqual([r]);
  });

  it("mixes strings and { name, options } specs", async () => {
    const { defineReporter, resolveReporters } = await load();
    const a = makeCapture().reporter;
    const b = makeCapture().reporter;
    defineReporter("str", () => a);
    defineReporter("obj", (options) =>
      (options as { flag?: boolean }).flag ? b : makeCapture().reporter,
    );

    const resolved = resolveReporters(["str", { name: "obj", options: { flag: true } }]);
    expect(resolved).toEqual([a, b]);
  });

  it("fails fast with a descriptive TypeError on invalid entries", async () => {
    const { resolveReporters } = await load();

    expect(() => resolveReporters([42 as unknown as string])).toThrow(TypeError);
    expect(() => resolveReporters([null as unknown as string])).toThrow(
      /invalid reporter entry/,
    );
  });

  it("builds reporters from name + options specs", async () => {
    const { defineReporter, resolveReporters } = await load();
    const a = makeCapture().reporter;
    const b = makeCapture().reporter;
    defineReporter("a", () => a);
    defineReporter("b", (options) =>
      options.flag ? b : makeCapture().reporter,
    );

    const built = resolveReporters([
      { name: "a" },
      { name: "b", options: { flag: true } },
    ]);
    expect(built).toHaveLength(2);
    expect(built[0]).toBe(a);
    expect(built[1]).toBe(b);
  });

  it("throws on unknown reporter name (fail fast, no silent drop)", async () => {
    const { resolveReporters } = await load();
    expect(() => resolveReporters([{ name: "ghost" }])).toThrow(
      /reporter "ghost" is not registered/,
    );
  });
});

describe("config preset expansion", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.resetModules());

  async function load() {
    return await import("./config");
  }

  it("expands a preset's consola options", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("quiet", { consola: { level: 0 } });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({ preset: "quiet" });
    expect(resolved.kind).toBe("options");
    if (resolved.kind !== "options") return;
    expect(resolved.options.level).toBe(0);
  });

  it("explicit config keys win over the preset", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("loud", { consola: { level: 5 } });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({
      preset: "loud",
      consola: { level: 1 },
    });
    expect(resolved.kind).toBe("options");
    if (resolved.kind !== "options") return;
    expect(resolved.options.level).toBe(1);
  });

  it("preset consola options fill gaps under the raw config's", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("base", {
      consola: { level: 4, formatOptions: { date: false } },
    });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({
      preset: "base",
      consola: { level: 2 },
    });
    expect(resolved.kind).toBe("options");
    if (resolved.kind !== "options") return;
    // raw level wins, preset formatOptions survives
    expect(resolved.options.level).toBe(2);
    expect(resolved.options.formatOptions?.date).toBe(false);
  });

  it("preset selects a backend and carries backendOptions", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("pino-stack", {
      backend: "pino",
      backendOptions: { name: "api" },
    });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({ preset: "pino-stack" });
    expect(resolved.kind).toBe("backend");
    if (resolved.kind !== "backend") return;
    expect(resolved.backend).toBe("pino");
    expect(resolved.options).toEqual({ name: "api" });
  });

  it("preset's reporters are carried into the resolved config", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("observability", {
      reporters: [{ name: "json" }, { name: "sentry" }],
    });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({ preset: "observability" });
    expect(resolved.reporters).toEqual([
      { name: "json" },
      { name: "sentry" },
    ]);
  });

  it("raw reporters override the preset's list", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("with-json", {
      reporters: [{ name: "json" }],
    });

    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({
      preset: "with-json",
      reporters: [{ name: "datadog", options: { service: "x" } }],
    });
    expect(resolved.reporters).toEqual([
      { name: "datadog", options: { service: "x" } },
    ]);
  });

  it("unknown preset name throws (typo must fail loudly)", async () => {
    const { resolveLoggerConfig } = await load();
    expect(() => resolveLoggerConfig({ preset: "prodution" })).toThrow(
      /preset "prodution" is not registered/,
    );
  });

  it("config without preset resolves exactly as before", async () => {
    const { resolveLoggerConfig } = await load();
    const resolved = resolveLoggerConfig({ consola: { level: 4 } });
    expect(resolved.kind).toBe("options");
    expect(resolved.reporters).toBeUndefined();
  });

  it("loadConfig reads preset config back from NEXT_LOGGER_CONFIG", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("json-only", { reporters: [{ name: "json" }] });

    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({ preset: "json-only" });
    try {
      const { loadConfig } = await load();
      const resolved = loadConfig();
      expect(resolved.reporters).toEqual([{ name: "json" }]);
    } finally {
      delete process.env.NEXT_LOGGER_CONFIG;
    }
  });
});

describe("buildLogger reporter attachment", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
    delete process.env.NEXT_LOGGER_CONFIG;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("attaches reporters referenced by name to the consola instance", async () => {
    const plugins = await import("./plugins");
    const capture = makeCapture();
    plugins.defineReporter("capture", () => capture.reporter);

    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({
      reporters: [{ name: "capture" }],
    });

    const { buildLogger } = await import("./logger");
    const logger = buildLogger();
    expect(logger).toBeTypeOf("object");

    logger.info("hello plugins");

    // The capture reporter received the entry (default reporters also fire —
    // we only assert OUR reporter saw it, not exclusivity).
    expect(capture.entries).toHaveLength(1);
    expect(capture.entries[0]?.args).toContain("hello plugins");
  });

  it("attaches reporters declared via a preset", async () => {
    const plugins = await import("./plugins");
    const capture = makeCapture();
    plugins.defineReporter("capture", () => capture.reporter);
    plugins.definePreset("captured", { reporters: [{ name: "capture" }] });

    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({ preset: "captured" });

    const { buildLogger } = await import("./logger");
    buildLogger().warn("via preset");
    expect(capture.entries).toHaveLength(1);
    expect(capture.entries[0]?.args).toContain("via preset");
  });

  it("passes reporter options from the config to the factory", async () => {
    const plugins = await import("./plugins");
    const factory = vi.fn<(o: Record<string, unknown>) => ConsolaReporter>(
      () => makeCapture().reporter,
    );
    plugins.defineReporter("configured", factory);

    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({
      reporters: [{ name: "configured", options: { service: "my-app" } }],
    });

    const { buildLogger } = await import("./logger");
    buildLogger();
    expect(factory).toHaveBeenCalledWith({ service: "my-app" });
  });

  it("unknown reporter name in config fails init loudly", async () => {
    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({
      reporters: [{ name: "ghost" }],
    });
    const { buildLogger } = await import("./logger");
    expect(() => buildLogger()).toThrow(/reporter "ghost" is not registered/);
  });

  it("no reporters key → instance unchanged (backward compat)", async () => {
    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({ consola: { level: 3 } });
    const { buildLogger } = await import("./logger");
    const logger = buildLogger();
    expect(() => logger.info("no reporters")).not.toThrow();
    expect(logger.level).toBe(3);
  });

  it("builds a working consola instance alongside custom reporters", async () => {
    const plugins = await import("./plugins");
    const capture = makeCapture();
    plugins.defineReporter("capture", () => capture.reporter);
    process.env.NEXT_LOGGER_CONFIG = JSON.stringify({
      reporters: [{ name: "capture" }],
    });
    const { buildLogger } = await import("./logger");
    const logger = buildLogger();
    // Instance is a real consola logger — withTag chains and levels work.
    const tagged = logger.withTag("test");
    tagged.error("tagged entry");
    expect(capture.entries).toHaveLength(1);
    expect(capture.entries[0]?.tag).toBe("test");
  });

  it("preset with live consola instance in raw config wins outright", async () => {
    const plugins = await import("./plugins");
    plugins.definePreset("base", { consola: { level: 0 } });

    const instance = createConsola({ level: 5 });
    const { resolveLoggerConfig } = await import("./config");
    const resolved = resolveLoggerConfig({
      preset: "base",
      consola: instance,
    });
    expect(resolved.kind).toBe("instance");
    if (resolved.kind !== "instance") return;
    expect(resolved.instance).toBe(instance);
  });
});

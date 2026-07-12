import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsola, type ConsolaInstance, type ConsolaOptions } from "consola";
import { resolveLoggerConfig, loadConfig, CONFIG_ENV_VAR } from "./config";

/**
 * Config resolution tests.
 *
 * `resolveLoggerConfig` is pure. `loadConfig` reads the `NEXT_LOGGER_CONFIG`
 * env var (injected at build time by `withLogger`) — fully unit-testable by
 * setting the env var directly, no mocks.
 */

describe("resolveLoggerConfig", () => {
  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
  });

  it("returns default options when raw is undefined", () => {
    const result = resolveLoggerConfig(undefined);
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(3);
  });

  it("uses a consola instance directly", () => {
    const instance = createConsola({ level: 4 });
    const result = resolveLoggerConfig({ consola: instance });
    expect(result.kind).toBe("instance");
    if (result.kind !== "instance") return;
    expect(result.instance).toBe(instance);
  });

  it("calls a factory with the library defaults", () => {
    const instance = createConsola({ level: 5 });
    const factory = vi.fn<(defaults: Partial<ConsolaOptions>) => ConsolaInstance>(
      () => instance,
    );
    const result = resolveLoggerConfig({ consola: factory });
    expect(result.kind).toBe("instance");
    if (result.kind !== "instance") return;
    expect(result.instance).toBe(instance);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0]?.[0]).toHaveProperty("level");
  });

  it("merges partial options over defaults", () => {
    const result = resolveLoggerConfig({ consola: { level: 2 } });
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(2);
    expect(result.options.formatOptions).toHaveProperty("date");
  });

  it("merges nested formatOptions with defaults", () => {
    const result = resolveLoggerConfig({
      consola: { formatOptions: { date: false } },
    });
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.formatOptions?.date).toBe(false);
  });
});

describe("loadConfig (NEXT_LOGGER_CONFIG env)", () => {
  const orig = process.env[CONFIG_ENV_VAR];

  afterEach(() => {
    if (orig === undefined) delete process.env[CONFIG_ENV_VAR];
    else process.env[CONFIG_ENV_VAR] = orig;
  });

  it("returns defaults when the env var is absent", () => {
    delete process.env[CONFIG_ENV_VAR];
    const result = loadConfig();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(3);
  });

  it("reads serialised options from the env var", () => {
    process.env[CONFIG_ENV_VAR] = JSON.stringify({ consola: { level: 1 } });
    const result = loadConfig();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(1);
  });

  it("merges nested formatOptions from the env var", () => {
    process.env[CONFIG_ENV_VAR] = JSON.stringify({
      consola: { level: 4, formatOptions: { date: false } },
    });
    const result = loadConfig();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(4);
    expect(result.options.formatOptions?.date).toBe(false);
  });

  it("falls back to defaults on invalid JSON", () => {
    process.env[CONFIG_ENV_VAR] = "{not json";
    const result = loadConfig();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(3);
  });
});

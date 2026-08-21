import { describe, expect, it } from "vitest";
import { withLogger } from "./withLogger";
import { CONFIG_ENV_VAR } from "./config";

/**
 * withLogger() tests.
 *
 * `withLogger` is a pure higher-order function: it takes options, returns a
 * function that takes a Next.js config and injects the `NEXT_LOGGER_CONFIG` env
 * var. No mocks needed — just verify the returned config shape.
 */

/** Minimal Next.js config shape with an `env` key. */
interface NextConfigLike {
  env?: Record<string, string>;
  [key: string]: unknown;
}

describe("withLogger", () => {
  it("returns a higher-order function", () => {
    const hof = withLogger();
    expect(typeof hof).toBe("function");
  });

  it("injects NEXT_LOGGER_CONFIG into the config's env", () => {
    const hof = withLogger({ consola: { level: 4 } });
    const result = hof({} as NextConfigLike);
    expect(result.env).toBeDefined();
    expect(result.env![CONFIG_ENV_VAR]).toBe(
      JSON.stringify({ consola: { level: 4 } }),
    );
  });

  it("preserves existing env keys", () => {
    const hof = withLogger({ consola: { level: 3 } });
    const result = hof({
      env: { MY_KEY: "my-value", OTHER: "x" },
    } as NextConfigLike);
    expect(result.env!.MY_KEY).toBe("my-value");
    expect(result.env!.OTHER).toBe("x");
    expect(result.env![CONFIG_ENV_VAR]).toBeDefined();
  });

  it("merges NEXT_LOGGER_CONFIG over existing env without clobbering siblings", () => {
    const hof = withLogger({ consola: { level: 2 } });
    const result = hof({ env: { EXISTING: "keep" } } as NextConfigLike);
    const env = result.env!;
    expect(Object.keys(env).sort()).toEqual(["EXISTING", CONFIG_ENV_VAR]);
    expect(env.EXISTING).toBe("keep");
  });

  it("serialises options as JSON", () => {
    const hof = withLogger({
      consola: { level: 1, formatOptions: { date: false } },
    });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.consola.level).toBe(1);
    expect(parsed.consola.formatOptions.date).toBe(false);
  });

  it("preserves other top-level config keys", () => {
    const hof = withLogger();
    const result = hof({
      reactStrictMode: true,
      webpack: (config: unknown) => config,
      env: { FOO: "bar" },
    } as NextConfigLike);
    expect(result.reactStrictMode).toBe(true);
    expect(typeof result.webpack).toBe("function");
    expect(result.env!.FOO).toBe("bar");
    expect(result.env![CONFIG_ENV_VAR]).toBeDefined();
  });

  it("handles empty options (default param)", () => {
    const hof = withLogger();
    const result = hof({} as NextConfigLike);
    expect(result.env![CONFIG_ENV_VAR]).toBe(JSON.stringify({}));
  });

  it("overwrites a previous NEXT_LOGGER_CONFIG value in env", () => {
    const hof = withLogger({ consola: { level: 5 } });
    const result = hof({
      env: { [CONFIG_ENV_VAR]: "old" },
    } as NextConfigLike);
    expect(result.env![CONFIG_ENV_VAR]).toBe(
      JSON.stringify({ consola: { level: 5 } }),
    );
  });

  it("serialises backend and backendOptions", () => {
    const hof = withLogger({ backend: "pino", backendOptions: { name: "api" } });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.backend).toBe("pino");
    expect(parsed.backendOptions).toEqual({ name: "api" });
  });

  it("serialises only backend when no backendOptions", () => {
    const hof = withLogger({ backend: "pino" });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.backend).toBe("pino");
    expect(parsed.backendOptions).toBeUndefined();
  });

  it("backward compat: consola-only options still serialise", () => {
    const hof = withLogger({ consola: { level: 4 } });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.consola.level).toBe(4);
    expect(parsed.backend).toBeUndefined();
  });

  it("serialises bare factory-name strings in reporters (type-level shorthand)", () => {
    // No casts: the LoggerPluginOptions.reporters type must accept strings —
    // a TS user following the README's shorthand note has to compile clean.
    const hof = withLogger({ reporters: ["json"] });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.reporters).toEqual(["json"]);
  });

  it("serialises mixed string and { name } reporters", () => {
    const hof = withLogger({
      reporters: ["json", { name: "json" }],
    });
    const result = hof({} as NextConfigLike);
    const parsed = JSON.parse(result.env![CONFIG_ENV_VAR]);
    expect(parsed.reporters).toEqual(["json", { name: "json" }]);
  });
});

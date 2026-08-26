import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withMetadata,
  resolveMetadataFromEnv,
  METADATA_ENV_VAR,
} from "./metadata.js";
import type { Logger } from "./backend.js";

/**
 * Minimal Logger stub that records every forwarded call.
 *
 * Mirrors the harness in `sampling.spec.ts` so the tests read the same way.
 * `withTag` returns a real recording child logger so `withMetadata` can
 * recurse into it.
 */
// NOTE: intentionally NOT typed via the `Logger` interface — that interface
// marks `level` as readonly, which would make the `logger.level = 5` mutation
// in tests a type error. We return a structural object that satisfies `Logger`
// at call sites (passed into `withMetadata`) while keeping `level` mutable.
function makeFakeLogger() {
  const calls: Record<string, unknown[][]> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
    log: [],
  };
  const logger = {
    level: 3,
    trace: (...a: unknown[]) => void calls.trace.push(a),
    debug: (...a: unknown[]) => void calls.debug.push(a),
    info: (...a: unknown[]) => void calls.info.push(a),
    warn: (...a: unknown[]) => void calls.warn.push(a),
    error: (...a: unknown[]) => void calls.error.push(a),
    fatal: (...a: unknown[]) => void calls.fatal.push(a),
    log: (...a: unknown[]) => void calls.log.push(a),
    withTag: vi.fn((_tag: string) => makeFakeLogger().logger),
  };
  return { logger, calls };
}

describe("withMetadata", () => {
  describe("basic forwarding", () => {
    it("wraps all standard log methods", () => {
      const { logger } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      for (const m of [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "log",
      ] as const) {
        expect(typeof wrapped[m]).toBe("function");
        wrapped[m]("hi");
      }
    });

    it("exposes the underlying logger's level", () => {
      const { logger } = makeFakeLogger();
      const wrapped = withMetadata(logger, {});
      expect(wrapped.level).toBe(logger.level);
    });

    it("level reflects updates on the underlying logger", () => {
      const { logger } = makeFakeLogger();
      const wrapped = withMetadata(logger, {});
      logger.level = 5;
      expect(wrapped.level).toBe(5);
    });
  });

  describe("string args — metadata appended as object", () => {
    it("appends metadata object to a bare string message", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("processing");
      expect(calls.info[0]).toEqual(["processing", { requestId: "abc" }]);
    });

    it("appends metadata object to multiple string args", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("hello", "world");
      expect(calls.info[0]).toEqual([
        "hello",
        "world",
        { requestId: "abc" },
      ]);
    });

    it("appends metadata when args are primitives", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("count", 42, true);
      expect(calls.info[0]).toEqual([
        "count",
        42,
        true,
        { requestId: "abc" },
      ]);
    });

    it("appends metadata object to a no-arg call", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info();
      expect(calls.info[0]).toEqual([{ requestId: "abc" }]);
    });
  });

  describe("object args — metadata merged in", () => {
    it("merges metadata into a single object arg", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("done", { ms: 12 });
      expect(calls.info[0]).toEqual([
        "done",
        { requestId: "abc", ms: 12 },
      ]);
    });

    it("merges metadata into an object arg that is the only arg", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { service: "api" });
      wrapped.info({ path: "/healthz" });
      expect(calls.info[0]).toEqual([{ service: "api", path: "/healthz" }]);
    });

    it("merges metadata into every plain object arg", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("msg", { a: 1 }, { b: 2 });
      // Metadata is merged into each plain object; no trailing object appended.
      expect(calls.info[0]).toEqual([
        "msg",
        { requestId: "abc", a: 1 },
        { requestId: "abc", b: 2 },
      ]);
    });

    it("per-call object keys override metadata keys on collision", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "base" });
      wrapped.info("override", { requestId: "per-call", ms: 5 });
      expect(calls.info[0]).toEqual([
        "override",
        { requestId: "per-call", ms: 5 },
      ]);
    });

    it("does not mutate the original argument object", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      const arg = { ms: 12 };
      wrapped.info("done", arg);
      expect(calls.info[0][1]).toEqual({ requestId: "abc", ms: 12 });
      // The caller's object is untouched.
      expect(arg).toEqual({ ms: 12 });
    });

    it("does not mutate the original metadata object", () => {
      const { logger } = makeFakeLogger();
      const metadata = { requestId: "abc" };
      const wrapped = withMetadata(logger, metadata);
      wrapped.info("done", { ms: 12 });
      expect(metadata).toEqual({ requestId: "abc" });
    });
  });

  describe("non-plain-object args — preserved verbatim", () => {
    it("forwards Error instances verbatim and appends metadata", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      const err = new Error("boom");
      wrapped.error("failed", err);
      expect(calls.error[0][0]).toBe("failed");
      expect(calls.error[0][1]).toBe(err);
      expect(calls.error[0][2]).toEqual({ requestId: "abc" });
    });

    it("forwards arrays verbatim and appends metadata", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.info("ids", [1, 2, 3]);
      expect(calls.info[0][0]).toBe("ids");
      expect(calls.info[0][1]).toEqual([1, 2, 3]);
      expect(calls.info[0][2]).toEqual({ requestId: "abc" });
    });

    it("forwards Date instances verbatim and appends metadata", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      const d = new Date("2026-01-01T00:00:00Z");
      wrapped.info("at", d);
      expect(calls.info[0][0]).toBe("at");
      expect(calls.info[0][1]).toBe(d);
      expect(calls.info[0][2]).toEqual({ requestId: "abc" });
    });
  });

  describe("empty metadata", () => {
    it("forwards args unchanged when metadata is empty", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {});
      wrapped.info("processing", { ms: 12 });
      // Same array identity — fast path returns args untouched.
      expect(calls.info[0]).toEqual(["processing", { ms: 12 }]);
    });

    it("does not append a trailing object when metadata is empty", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {});
      wrapped.info("just a string");
      expect(calls.info[0]).toEqual(["just a string"]);
    });
  });

  describe("withTag — child logger preserves metadata", () => {
    it("returns a Logger with all log methods", () => {
      const { logger } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      const child = wrapped.withTag("db");
      for (const m of [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "log",
      ] as const) {
        expect(typeof child[m]).toBe("function");
      }
    });

    it("delegates withTag to the underlying logger", () => {
      const { logger } = makeFakeLogger();
      const wrapped = withMetadata(logger, { requestId: "abc" });
      wrapped.withTag("api");
      expect(logger.withTag).toHaveBeenCalledWith("api");
    });

    it("child logger still applies metadata", () => {
      // Build a logger whose withTag returns a recorder we can inspect.
      const childCalls: Record<string, unknown[][]> = { info: [] };
      const underlyingChild: Logger = {
        level: 3,
        trace: () => {},
        debug: () => {},
        info: (...a: unknown[]) => void childCalls.info.push(a),
        warn: () => {},
        error: () => {},
        fatal: () => {},
        log: () => {},
        withTag: vi.fn(() => underlyingChild),
      };
      const base: Logger = {
        level: 3,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        log: () => {},
        withTag: vi.fn(() => underlyingChild),
      };
      const wrapped = withMetadata(base, { requestId: "abc" });
      const child = wrapped.withTag("db");
      child.info("query");
      child.info("done", { ms: 9 });
      expect(base.withTag).toHaveBeenCalledWith("db");
      expect(childCalls.info[0]).toEqual(["query", { requestId: "abc" }]);
      expect(childCalls.info[1]).toEqual([
        "done",
        { requestId: "abc", ms: 9 },
      ]);
    });

    it("stacked withTag calls preserve metadata through every level", () => {
      const leafCalls: unknown[][] = [];
      const leaf: Logger = {
        level: 3,
        trace: () => {},
        debug: () => {},
        info: (...a: unknown[]) => void leafCalls.push(a),
        warn: () => {},
        error: () => {},
        fatal: () => {},
        log: () => {},
        withTag: vi.fn(() => leaf),
      };
      const mid: Logger = {
        level: 3,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        log: () => {},
        withTag: vi.fn(() => leaf),
      };
      const base: Logger = {
        level: 3,
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        log: () => {},
        withTag: vi.fn(() => mid),
      };
      const wrapped = withMetadata(base, { requestId: "abc" });
      const deep = wrapped.withTag("a").withTag("b");
      deep.info("deep");
      expect(leafCalls[0]).toEqual(["deep", { requestId: "abc" }]);
      expect(base.withTag).toHaveBeenCalledWith("a");
      expect(mid.withTag).toHaveBeenCalledWith("b");
    });
  });

  describe("multiple metadata keys", () => {
    it("appends all metadata keys for string args", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {
        service: "api",
        version: "1.0",
        region: "eu",
      });
      wrapped.info("boot");
      expect(calls.info[0]).toEqual([
        "boot",
        { service: "api", version: "1.0", region: "eu" },
      ]);
    });

    it("merges all metadata keys into object args", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {
        service: "api",
        version: "1.0",
      });
      wrapped.info("ready", { port: 3000 });
      expect(calls.info[0]).toEqual([
        "ready",
        { service: "api", version: "1.0", port: 3000 },
      ]);
    });
  });

  describe("nested metadata values", () => {
    it("preserves nested object values in metadata", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {
        user: { id: 42, name: "alice" },
      });
      wrapped.info("auth");
      expect(calls.info[0]).toEqual([
        "auth",
        { user: { id: 42, name: "alice" } },
      ]);
    });

    it("merges metadata with nested object into object arg", () => {
      const { logger, calls } = makeFakeLogger();
      const wrapped = withMetadata(logger, {
        user: { id: 42 },
      });
      wrapped.info("req", { path: "/" });
      expect(calls.info[0]).toEqual([
        "req",
        { user: { id: 42 }, path: "/" },
      ]);
    });
  });
});

describe("resolveMetadataFromEnv", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[METADATA_ENV_VAR];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns {} when the var is absent", () => {
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} when the var is empty string", () => {
    process.env[METADATA_ENV_VAR] = "";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} when the var is whitespace-only", () => {
    process.env[METADATA_ENV_VAR] = "   ";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("parses a flat JSON object", () => {
    process.env[METADATA_ENV_VAR] = '{"service":"api","version":"1.0"}';
    expect(resolveMetadataFromEnv()).toEqual({
      service: "api",
      version: "1.0",
    });
  });

  it("parses an object with numeric and boolean values", () => {
    process.env[METADATA_ENV_VAR] =
      '{"port":3000,"enabled":true,"ratio":0.5}';
    expect(resolveMetadataFromEnv()).toEqual({
      port: 3000,
      enabled: true,
      ratio: 0.5,
    });
  });

  it("parses an object with nested object values", () => {
    process.env[METADATA_ENV_VAR] =
      '{"user":{"id":42,"name":"alice"}}';
    expect(resolveMetadataFromEnv()).toEqual({
      user: { id: 42, name: "alice" },
    });
  });

  it("parses an empty JSON object", () => {
    process.env[METADATA_ENV_VAR] = "{}";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for malformed JSON", () => {
    process.env[METADATA_ENV_VAR] = "{not valid json";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for a JSON array", () => {
    process.env[METADATA_ENV_VAR] = "[1,2,3]";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for a JSON primitive", () => {
    process.env[METADATA_ENV_VAR] = '"just a string"';
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for a JSON number", () => {
    process.env[METADATA_ENV_VAR] = "42";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for JSON null", () => {
    process.env[METADATA_ENV_VAR] = "null";
    expect(resolveMetadataFromEnv()).toEqual({});
  });

  it("returns {} for JSON true", () => {
    process.env[METADATA_ENV_VAR] = "true";
    expect(resolveMetadataFromEnv()).toEqual({});
  });
});

describe("integration: withMetadata + resolveMetadataFromEnv", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env[METADATA_ENV_VAR];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("applies env-driven metadata to log calls", () => {
    process.env[METADATA_ENV_VAR] =
      '{"service":"api","version":"1.0"}';
    const { logger, calls } = makeFakeLogger();
    const wrapped = withMetadata(logger, resolveMetadataFromEnv());
    wrapped.info("boot");
    expect(calls.info[0]).toEqual([
      "boot",
      { service: "api", version: "1.0" },
    ]);
  });

  it("no-op when env var is absent (empty metadata)", () => {
    const { logger, calls } = makeFakeLogger();
    const wrapped = withMetadata(logger, resolveMetadataFromEnv());
    wrapped.info("boot");
    expect(calls.info[0]).toEqual(["boot"]);
  });
});

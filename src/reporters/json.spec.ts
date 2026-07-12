import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConsola } from "consola";
import { createJsonReporter } from "./json";

/**
 * JSON reporter tests.
 *
 * Uses a mock stream to capture output and verify the JSON structure.
 */

describe("reporters/json", () => {
  let output: string[];

  beforeEach(() => {
    output = [];
  });

  function makeLoggerWithJson() {
    const stream = {
      write: (s: string) => {
        output.push(s);
        return true;
      },
    };
    const consola = createConsola({ level: 5 });
    consola.setReporters([createJsonReporter(stream)]);
    return consola;
  }

  it("emits a single JSON line per log call", () => {
    const c = makeLoggerWithJson();
    c.info("hello");
    expect(output).toHaveLength(1);
    expect(output[0]!.endsWith("\n")).toBe(true);
  });

  it("includes level, type, tag, msg, date", () => {
    const c = makeLoggerWithJson();
    c.info("hello");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.level).toBe("info");
    expect(parsed.type).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(parsed.tag).toBe("");
    expect(typeof parsed.date).toBe("string");
    expect(parsed.args).toBeUndefined(); // no extra args
  });

  it("serializes error level correctly", () => {
    const c = makeLoggerWithJson();
    c.error("something broke");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.level).toBe("error");
    expect(parsed.type).toBe("error");
    expect(parsed.msg).toBe("something broke");
  });

  it("serializes warn level correctly", () => {
    const c = makeLoggerWithJson();
    c.warn("careful");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.level).toBe("warn");
  });

  it("serializes debug level correctly", () => {
    const c = makeLoggerWithJson();
    c.debug("detail");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.level).toBe("debug");
  });

  it("serializes trace level correctly", () => {
    const c = makeLoggerWithJson();
    c.trace("very detailed");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.level).toBe("trace");
  });

  it("joins multiple string args with space", () => {
    const c = makeLoggerWithJson();
    c.error("Error adding", "module:", "foo");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.msg).toBe("Error adding module: foo");
  });

  it("puts object args into 'args' field, not msg", () => {
    const c = makeLoggerWithJson();
    c.info("request completed", { status: 200, duration: 42 });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.msg).toBe("request completed");
    expect(parsed.args).toEqual([{ status: 200, duration: 42 }]);
  });

  it("serializes Error objects in args with name + message + stack", () => {
    const c = makeLoggerWithJson();
    const err = new Error("boom");
    c.error("caught", err);
    const parsed = JSON.parse(output[0]!);
    expect(parsed.msg).toBe("caught boom");
    expect(parsed.args).toHaveLength(1);
    expect(parsed.args[0].name).toBe("Error");
    expect(parsed.args[0].message).toBe("boom");
    expect(typeof parsed.args[0].stack).toBe("string");
  });

  it("includes the tag when withTag is used", () => {
    const c = makeLoggerWithJson();
    c.withTag("next.js").info("compiled");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.tag).toBe("next.js");
  });

  it("handles circular references without throwing", () => {
    const c = makeLoggerWithJson();
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    c.info("circular", obj);
    const parsed = JSON.parse(output[0]!);
    expect(parsed.msg).toBe("circular");
    expect(parsed.args[0].self).toBe("[Circular]");
  });

  it("serializes BigInt as string", () => {
    const c = makeLoggerWithJson();
    c.info("big", { n: 9007199254740993n });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.args[0].n).toBe("9007199254740993");
  });

  it("serializes Dates as ISO strings", () => {
    const c = makeLoggerWithJson();
    const d = new Date("2026-01-15T10:30:00.000Z");
    c.info("dated", { at: d });
    const parsed = JSON.parse(output[0]!);
    expect(parsed.args[0].at).toBe("2026-01-15T10:30:00.000Z");
  });

  it("produces valid JSON for empty-string messages", () => {
    const c = makeLoggerWithJson();
    c.info("");
    const parsed = JSON.parse(output[0]!);
    expect(parsed.msg).toBe("");
  });
});

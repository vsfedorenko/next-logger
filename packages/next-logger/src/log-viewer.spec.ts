import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLogViewerReporter,
  getLogViewerEntries,
  logViewerHandler,
  resetLogViewer,
} from "./log-viewer";
import type { LogObject } from "consola";

/**
 * Log viewer unit tests — the handler is exercised as a plain async
 * function with real `Request`/`Response` objects, no Next runtime.
 */

function logObj(partial: Partial<LogObject>): LogObject {
  return {
    level: 3,
    tag: "test",
    args: [],
    date: new Date(),
    ...partial,
  } as LogObject;
}

beforeEach(() => {
  resetLogViewer();
});

afterEach(() => {
  resetLogViewer();
  vi.restoreAllMocks();
});

describe("ring buffer (createLogViewerReporter)", () => {
  it("captures entries with level, tag and joined message", () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ level: 1, tag: "app", message: "hello", args: ["world", 42] }));
    const entries = getLogViewerEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 1,
      levelName: "WARN",
      tag: "app",
      message: "hello world 42",
    });
    expect(entries[0].time).toBeGreaterThan(0);
  });

  it("structures Error args into extras", () => {
    const reporter = createLogViewerReporter();
    const err = new Error("boom");
    reporter.log(logObj({ args: [err] }));
    const [entry] = getLogViewerEntries();
    expect(entry.extras["arg_0"]).toMatchObject({ name: "Error", message: "boom" });
    expect((entry.extras["arg_0"] as { stack?: string }).stack).toBeTypeOf("string");
  });

  it("keeps plain objects as extras", () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ args: [{ userId: 7 }] }));
    expect(getLogViewerEntries()[0].extras["arg_0"]).toEqual({ userId: 7 });
  });

  it("empty message with no args renders a placeholder", () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({}));
    expect(getLogViewerEntries()[0].message).toBe("(empty)");
  });

  it("bounds memory: drops the oldest beyond capacity", () => {
    const reporter = createLogViewerReporter({ capacity: 3 });
    for (let i = 0; i < 5; i++) reporter.log(logObj({ message: `m${i}` }));
    const entries = getLogViewerEntries();
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("clamps out-of-range levels", () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ level: 99 }));
    reporter.log(logObj({ level: -5 }));
    const entries = getLogViewerEntries();
    expect(entries[0].level).toBe(5);
    expect(entries[0].levelName).toBe("TRACE");
    expect(entries[1].level).toBe(0);
    expect(entries[1].levelName).toBe("ERROR");
  });

  it("shares one store across module-instance boundaries (globalThis)", () => {
    // Two reporter instances — e.g. instrumentation bundle and a route
    // bundle — must land in the same ring.
    const a = createLogViewerReporter();
    const b = createLogViewerReporter();
    a.log(logObj({ message: "from-a" }));
    b.log(logObj({ message: "from-b" }));
    expect(getLogViewerEntries().map((e) => e.message)).toEqual(["from-a", "from-b"]);
  });

  it("returned entries are copies — mutating them cannot corrupt the ring", () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ message: "x" }));
    const first = getLogViewerEntries()[0];
    first.message = "hacked";
    first.extras["injected"] = true;
    expect(getLogViewerEntries()[0].message).toBe("x");
    expect(getLogViewerEntries()[0].extras).toEqual({});
  });
});

describe("logViewerHandler", () => {
  it("serves HTML with the captured entries", async () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ level: 0, tag: "app", message: "viewer <test>" }));

    const res = await logViewerHandler(new Request("http://localhost/__logs"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("viewer &lt;test&gt;"); // escaped
    expect(html).toContain("ERROR");
    expect(html).toContain("app");
  });

  it("?format=json returns the raw entries", async () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ message: "j1" }));
    reporter.log(logObj({ message: "j2" }));

    const res = await logViewerHandler(new Request("http://localhost/__logs?format=json"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; entries: Array<{ message: string }> };
    expect(body.count).toBe(2);
    expect(body.entries.map((e) => e.message)).toEqual(["j1", "j2"]);
  });

  it("escapes extras content in the HTML (no XSS)", async () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ args: [{ evil: '<script>alert("x")</script>' }] }));

    const res = await logViewerHandler(new Request("http://localhost/__logs"));
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("circular extras do not break the HTML renderer", async () => {
    const reporter = createLogViewerReporter();
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    reporter.log(logObj({ args: [circular] }));

    const res = await logViewerHandler(new Request("http://localhost/__logs"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("[Circular]");
  });

  it("returns 404 in production regardless of captured entries", async () => {
    const reporter = createLogViewerReporter();
    reporter.log(logObj({ message: "should-not-leak" }));
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await logViewerHandler(new Request("http://localhost/__logs"));
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("should-not-leak");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

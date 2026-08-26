import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatadogLogsReporter, logObjectToDatadogEntry } from "./datadog.js";
import type { LogObject } from "consola/core";

/**
 * Datadog reporter unit tests — all network via a stubbed fetch; zero real
 * HTTP. Time-based flushing uses fake timers.
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

describe("logObjectToDatadogEntry (pure)", () => {
  it("maps consola levels to datadog statuses", () => {
    expect(logObjectToDatadogEntry(logObj({ level: 0 })).status).toBe("error");
    expect(logObjectToDatadogEntry(logObj({ level: 1 })).status).toBe("warning");
    expect(logObjectToDatadogEntry(logObj({ level: 3 })).status).toBe("info");
    expect(logObjectToDatadogEntry(logObj({ level: 5 })).status).toBe("debug");
    // out-of-range levels clamp
    expect(logObjectToDatadogEntry(logObj({ level: 99 })).status).toBe("debug");
    expect(logObjectToDatadogEntry(logObj({ level: -5 })).status).toBe("error");
  });

  it("joins string args and message into one string", () => {
    const entry = logObjectToDatadogEntry(
      logObj({ message: "hello", args: ["world", 42] }),
    );
    expect(entry.message).toBe("hello world 42");
  });

  it("structures Error args with name/message/stack", () => {
    const err = new Error("boom");
    const entry = logObjectToDatadogEntry(logObj({ args: [err] }));
    expect(entry.arg_0).toMatchObject({ name: "Error", message: "boom" });
    expect((entry.arg_0 as { stack?: string }).stack).toBeTypeOf("string");
  });

  it("spreads plain objects as extra attributes", () => {
    const entry = logObjectToDatadogEntry(logObj({ args: [{ userId: 7 }] }));
    expect(entry.arg_0).toEqual({ userId: 7 });
  });

  it("attaches service and env/tags", () => {
    const entry = logObjectToDatadogEntry(
      logObj({}),
      { service: "web", env: "prod", ddtags: "team:core" },
    );
    expect(entry.service).toBe("web");
    expect(entry.ddtags).toBe("env:prod,team:core");
    expect(entry.ddsource).toBe("next-logger");
  });

  it("empty message with no args renders a placeholder", () => {
    expect(logObjectToDatadogEntry(logObj({})).message).toBe("(empty)");
  });
});

describe("createDatadogLogsReporter (network-stubbed)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    process.env.DATADOG_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.DATADOG_API_KEY;
  });

  it("no API key → warns once and becomes a no-op (no fetch)", () => {
    delete process.env.DATADOG_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createDatadogLogsReporter({ intakeUrl: "http://x" });
    reporter.log(logObj({}));
    reporter.log(logObj({}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("flushes a batch when batchSize is reached", async () => {
    const reporter = createDatadogLogsReporter({
      intakeUrl: "http://intake.test",
      batchSize: 2,
      flushIntervalMs: 60_000,
    });
    reporter.log(logObj({ message: "a" }));
    expect(fetchMock).not.toHaveBeenCalled(); // 1/2 — still buffered
    reporter.log(logObj({ message: "b" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://intake.test");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["DD-API-KEY"]).toBe("test-key");
    const body = JSON.parse(String(init.body)) as Array<{ message: string }>;
    expect(body.map((e) => e.message)).toEqual(["a", "b"]);
  });

  it("flushes on the interval when the batch is not full", async () => {
    const reporter = createDatadogLogsReporter({
      intakeUrl: "http://intake.test",
      batchSize: 10,
      flushIntervalMs: 1_000,
    });
    reporter.log(logObj({ message: "timed" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("one timer for many entries — flushed together on interval", async () => {
    const reporter = createDatadogLogsReporter({
      intakeUrl: "http://intake.test",
      batchSize: 100,
      flushIntervalMs: 1_000,
    });
    for (let i = 0; i < 5; i++) reporter.log(logObj({ message: `m${i}` }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as Array<{ message: string }>;
    expect(body).toHaveLength(5);
  });

  it("HTTP failure does not throw from log()", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createDatadogLogsReporter({
      intakeUrl: "http://intake.test",
      batchSize: 1,
    });
    expect(() => reporter.log(logObj({ message: "x" }))).not.toThrow();
    await vi.runAllTimersAsync();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("flush() ships entries buffered below the batch threshold", async () => {
    const reporter = createDatadogLogsReporter({
      intakeUrl: "http://intake.test",
      batchSize: 100,
      flushIntervalMs: 60_000,
    });
    reporter.log(logObj({ message: "tail-entry" }));
    expect(fetchMock).not.toHaveBeenCalled(); // buffered, neither trigger fired
    reporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as Array<{ message: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe("tail-entry");
  });

  it("flush() on the no-key reporter is a safe no-op", () => {
    delete process.env.DATADOG_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createDatadogLogsReporter({ intakeUrl: "http://x" });
    expect(() => reporter.flush()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("default intake URL derives from site", async () => {
    const reporter = createDatadogLogsReporter({
      site: "datadoghq.eu",
      batchSize: 1,
    });
    reporter.log(logObj({ message: "x" }));
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://http-intake.logs.datadoghq.eu/api/v2/logs");
  });
});

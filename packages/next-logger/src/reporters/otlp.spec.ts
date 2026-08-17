import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consolaLevelToSeverityNumber,
  createOtlpLogsReporter,
  logObjectToOtlpRecord,
  resolveOtlpEndpoint,
} from "./otlp";
import type { LogObject } from "consola";

/**
 * OTLP reporter unit tests — all network via a stubbed fetch; zero real
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

/** Parse the OTLP JSON body sent by a fetch call. */
function parseBody(init: RequestInit): {
  resourceLogs: Array<{
    resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
    scopeLogs: Array<{
      scope: { name: string };
      logRecords: Array<{ body: string; severityNumber: number; severityText: string; attributes?: Record<string, unknown> }>;
    }>;
  }>;
} {
  return JSON.parse(String(init.body));
}

describe("consolaLevelToSeverityNumber (pure)", () => {
  it("maps consola levels into the OTLP severity band", () => {
    expect(consolaLevelToSeverityNumber(0)).toBe(9); // error → INFO band start? no: 9 is INFO
    expect(consolaLevelToSeverityNumber(5)).toBe(19);
  });

  it("clamps out-of-range levels", () => {
    expect(consolaLevelToSeverityNumber(99)).toBe(19);
    expect(consolaLevelToSeverityNumber(-5)).toBe(9);
  });
});

describe("logObjectToOtlpRecord (pure)", () => {
  it("joins string args and message into the body", () => {
    const rec = logObjectToOtlpRecord(logObj({ message: "hello", args: ["world", 42] }));
    expect(rec.body).toBe("hello world 42");
  });

  it("structures Error args with type/message/stack", () => {
    const err = new Error("boom");
    const rec = logObjectToOtlpRecord(logObj({ args: [err] }));
    expect(rec.attributes?.["arg_0.exception"]).toMatchObject({ type: "Error", message: "boom" });
    expect((rec.attributes?.["arg_0.exception"] as { stack?: string }).stack).toBeTypeOf("string");
  });

  it("spreads plain objects as attributes", () => {
    const rec = logObjectToOtlpRecord(logObj({ args: [{ userId: 7 }] }));
    expect(rec.attributes?.["arg_0"]).toEqual({ userId: 7 });
  });

  it("empty message with no args renders a placeholder body", () => {
    expect(logObjectToOtlpRecord(logObj({})).body).toBe("(empty)");
  });

  it("formats timeUnixNano as ns-since-epoch without exponent", () => {
    const rec = logObjectToOtlpRecord(logObj({ date: new Date(1700000000123) }));
    expect(rec.timeUnixNano).toBe("1700000000123000000");
    expect(rec.timeUnixNano).not.toMatch(/[eE]/);
  });

  it("severityText follows the level", () => {
    expect(logObjectToOtlpRecord(logObj({ level: 0 })).severityText).toBe("ERROR");
    expect(logObjectToOtlpRecord(logObj({ level: 1 })).severityText).toBe("WARN");
    expect(logObjectToOtlpRecord(logObj({ level: 3 })).severityText).toBe("INFO");
    expect(logObjectToOtlpRecord(logObj({ level: 4 })).severityText).toBe("DEBUG");
    expect(logObjectToOtlpRecord(logObj({ level: 5 })).severityText).toBe("TRACE");
  });
});

describe("resolveOtlpEndpoint (env)", () => {
  afterEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  it("signal-specific variable wins", () => {
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = "http://logs:4318/v1/logs";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://generic:4318";
    expect(resolveOtlpEndpoint()).toBe("http://logs:4318/v1/logs");
  });

  it("generic base gets /v1/logs appended per spec", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://generic:4318/";
    expect(resolveOtlpEndpoint()).toBe("http://generic:4318/v1/logs");
  });

  it("undefined when nothing is configured", () => {
    expect(resolveOtlpEndpoint()).toBeUndefined();
  });
});

describe("createOtlpLogsReporter (network-stubbed)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = "http://collector.test/v1/logs";
    process.env.OTEL_SERVICE_NAME = "test-service";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    delete process.env.OTEL_SERVICE_NAME;
  });

  it("no endpoint → warns once and becomes a no-op (no fetch)", () => {
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createOtlpLogsReporter({});
    reporter.log(logObj({}));
    reporter.log(logObj({}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("flushes a batch when batchSize is reached", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 2, flushIntervalMs: 60_000 });
    reporter.log(logObj({ message: "a" }));
    expect(fetchMock).not.toHaveBeenCalled(); // 1/2 — still buffered
    reporter.log(logObj({ message: "b" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://collector.test/v1/logs");
    expect(init.method).toBe("POST");
    const body = parseBody(init);
    const records = body.resourceLogs[0].scopeLogs[0].logRecords;
    expect(records.map((r) => r.body)).toEqual(["a", "b"]);
  });

  it("wraps records into a single resourceLog with scope and service.name", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 1, resourceAttributes: { deployment: "eu" } });
    reporter.log(logObj({ message: "x" }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = parseBody(init);
    expect(body.resourceLogs).toHaveLength(1);

    const attrs = Object.fromEntries(
      body.resourceLogs[0].resource.attributes.map((a) => [a.key, a.value.stringValue]),
    );
    expect(attrs["service.name"]).toBe("test-service");
    expect(attrs["deployment"]).toBe("eu");

    expect(body.resourceLogs[0].scopeLogs[0].scope.name).toBe("@vsfedorenko/next-logger");
  });

  it("options.serviceName overrides OTEL_SERVICE_NAME", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 1, serviceName: "explicit" });
    reporter.log(logObj({ message: "x" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = parseBody(init);
    const attrs = Object.fromEntries(
      body.resourceLogs[0].resource.attributes.map((a) => [a.key, a.value.stringValue]),
    );
    expect(attrs["service.name"]).toBe("explicit");
  });

  it("merges custom headers into the request", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 1, headers: { Authorization: "Bearer tok" } });
    reporter.log(logObj({ message: "x" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("flushes on the interval when the batch is not full", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 10, flushIntervalMs: 1_000 });
    reporter.log(logObj({ message: "timed" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("one timer for many entries — flushed together on interval", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 100, flushIntervalMs: 1_000 });
    for (let i = 0; i < 5; i++) reporter.log(logObj({ message: `m${i}` }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = parseBody((fetchMock.mock.calls[0] as [string, RequestInit])[1]);
    expect(body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(5);
  });

  it("HTTP failure does not throw from log()", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createOtlpLogsReporter({ batchSize: 1 });
    expect(() => reporter.log(logObj({ message: "x" }))).not.toThrow();
    await vi.runAllTimersAsync();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("flush() ships records buffered below the batch threshold", async () => {
    const reporter = createOtlpLogsReporter({ batchSize: 100, flushIntervalMs: 60_000 });
    reporter.log(logObj({ message: "tail-entry" }));
    expect(fetchMock).not.toHaveBeenCalled(); // buffered, neither trigger fired
    reporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = parseBody((fetchMock.mock.calls[0] as [string, RequestInit])[1]);
    expect(body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(1);
    expect(body.resourceLogs[0].scopeLogs[0].logRecords[0].body).toBe("tail-entry");
  });

  it("flush() on the no-endpoint reporter is a safe no-op", () => {
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reporter = createOtlpLogsReporter({});
    expect(() => reporter.flush()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("generic OTEL_EXPORTER_OTLP_ENDPOINT base is used with the signal path", async () => {
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://generic:4318";
    const reporter = createOtlpLogsReporter({ batchSize: 1 });
    reporter.log(logObj({ message: "x" }));
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://generic:4318/v1/logs");
  });
});

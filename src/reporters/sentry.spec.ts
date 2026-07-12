import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogObject } from "consola";

import {
  createSentryBreadcrumbReporter,
  logObjectToBreadcrumb,
} from "./sentry";

/**
 * Sentry breadcrumb reporter tests.
 *
 * Two concerns:
 *   1. `logObjectToBreadcrumb` — pure consola→breadcrumb mapping (level,
 *      message, data, category). No Sentry dependency.
 *   2. `createSentryBreadcrumbReporter` — the consola reporter factory that
 *      lazily resolves `@sentry/nextjs` via dynamic import.
 */

// --- helpers ---------------------------------------------------------------

function makeLog(
  level: number,
  args: unknown[],
  opts: { tag?: string; message?: string } = {},
): LogObject {
  return {
    level,
    type: "info",
    tag: opts.tag ?? "app",
    args,
    date: new Date(),
    message: opts.message,
  };
}

// --- logObjectToBreadcrumb -------------------------------------------------

describe("logObjectToBreadcrumb — level mapping", () => {
  it.each([
    [0, "error"],
    [1, "warning"],
    [2, "log"],
    [3, "info"],
    [4, "debug"],
    [5, "debug"],
  ])("maps consola level %i → Sentry %s", (level, expected) => {
    expect(logObjectToBreadcrumb(makeLog(level, ["msg"])).level).toBe(expected);
  });

  it("clamps out-of-range levels to the nearest severity", () => {
    expect(logObjectToBreadcrumb(makeLog(-5, ["msg"])).level).toBe("error");
    expect(logObjectToBreadcrumb(makeLog(99, ["msg"])).level).toBe("debug");
  });
});

describe("logObjectToBreadcrumb — message", () => {
  it("joins string arguments into the message", () => {
    expect(logObjectToBreadcrumb(makeLog(3, ["hello", "world"])).message).toBe(
      "hello world",
    );
  });

  it("prepends the message field when present", () => {
    const crumb = logObjectToBreadcrumb(
      makeLog(3, ["extra"], { message: "main" }),
    );
    expect(crumb.message).toBe("main extra");
  });

  it("is undefined when there are no string args", () => {
    expect(
      logObjectToBreadcrumb(makeLog(3, [{ key: "val" }])).message,
    ).toBeUndefined();
  });
});

describe("logObjectToBreadcrumb — data", () => {
  it("puts Error objects into data with name + message (no stack)", () => {
    const crumb = logObjectToBreadcrumb(makeLog(0, [new TypeError("bad")]));
    expect(crumb.data).toEqual({
      arg_0: { name: "TypeError", message: "bad" },
    });
  });

  it("puts plain objects into data", () => {
    const obj = { userId: 42 };
    expect(logObjectToBreadcrumb(makeLog(3, [obj])).data).toEqual({
      arg_0: obj,
    });
  });

  it("is undefined when there are no object args", () => {
    expect(
      logObjectToBreadcrumb(makeLog(3, ["just a string"])).data,
    ).toBeUndefined();
  });
});

describe("logObjectToBreadcrumb — category", () => {
  it("uses the consola tag", () => {
    expect(logObjectToBreadcrumb(makeLog(3, ["msg"], { tag: "app" })).category).toBe(
      "app",
    );
  });

  it("falls back to 'console' when tag is empty", () => {
    expect(
      logObjectToBreadcrumb(makeLog(3, ["msg"], { tag: "" })).category,
    ).toBe("console");
  });
});

// --- createSentryBreadcrumbReporter ----------------------------------------

describe("createSentryBreadcrumbReporter", () => {
  const addBreadcrumb = vi.fn();

  beforeEach(() => {
    addBreadcrumb.mockClear();
    // Stub the dynamic import so the reporter resolves our mock immediately.
    vi.doMock("@sentry/nextjs", () => ({ addBreadcrumb }));
  });

  afterEach(() => {
    vi.doUnmock("@sentry/nextjs");
  });

  it("forwards each log entry as a breadcrumb once Sentry resolves", async () => {
    const reporter = createSentryBreadcrumbReporter();
    reporter.log(makeLog(0, ["boom"]), { options: {} } as never);

    // The dynamic import is async — wait for the microtask queue to flush.
    await vi.waitFor(() => expect(addBreadcrumb).toHaveBeenCalledTimes(1));

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "boom",
        category: "app",
      }),
    );
  });

  it("does not throw when @sentry/nextjs is unavailable", async () => {
    // Force the lazy import to reject — simulates Sentry not installed.
    vi.doMock("@sentry/nextjs", () => {
      throw new Error("Cannot find module");
    });

    const reporter = createSentryBreadcrumbReporter();
    // Must not throw — the reporter catches and caches the failure.
    expect(() => reporter.log(makeLog(3, ["msg"]), { options: {} } as never)).not.toThrow();
  });
});

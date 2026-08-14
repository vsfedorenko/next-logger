import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogObject } from "consola";

import {
  createPinoReporter,
  logObjectToPinoContext,
} from "./pino";

/**
 * Minimal pino logger shape for test doubles — mirrors the level methods the
 * reporter calls. Defined locally so the test has no static import on `pino`.
 */
interface PinoLoggerLike {
  error: (obj: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
  warn: (obj: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
  info: (obj: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
  debug: (obj: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
  trace: (obj: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
}

/**
 * Pino reporter tests.
 *
 * Two concerns:
 *   1. `logObjectToPinoContext` — pure consola→pino mapping (level, msg,
 *      structured args, tag). No pino dependency.
 *   2. `createPinoReporter` — the consola reporter factory that lazily
 *      resolves `pino` via dynamic import and forwards each log entry.
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

// --- logObjectToPinoContext ------------------------------------------------

describe("logObjectToPinoContext — level mapping", () => {
  it.each([
    [0, "error"],
    [1, "warn"],
    [2, "info"],
    [3, "info"],
    [4, "debug"],
    [5, "trace"],
  ])("maps consola level %i → pino %s", (level, expected) => {
    expect(logObjectToPinoContext(makeLog(level, ["msg"])).level).toBe(expected);
  });

  it("clamps out-of-range levels to the nearest pino level", () => {
    expect(logObjectToPinoContext(makeLog(-5, ["msg"])).level).toBe("error");
    expect(logObjectToPinoContext(makeLog(99, ["msg"])).level).toBe("trace");
  });
});

describe("logObjectToPinoContext — msg", () => {
  it("joins string arguments into the message", () => {
    expect(logObjectToPinoContext(makeLog(3, ["hello", "world"])).msg).toBe(
      "hello world",
    );
  });

  it("prepends the message field when present", () => {
    const ctx = logObjectToPinoContext(
      makeLog(3, ["extra"], { message: "main" }),
    );
    expect(ctx.msg).toBe("main extra");
  });

  it("is empty when there are no string args", () => {
    expect(logObjectToPinoContext(makeLog(3, [{ key: "val" }])).msg).toBe("");
  });
});

describe("logObjectToPinoContext — structured args", () => {
  it("puts Error objects into args with name + message + stack", () => {
    const err = new TypeError("bad");
    const ctx = logObjectToPinoContext(makeLog(0, [err]));
    expect(ctx.args).toEqual({
      arg_0: {
        name: "TypeError",
        message: "bad",
        stack: err.stack,
      },
    });
  });

  it("puts plain objects into args keyed by position", () => {
    const obj = { userId: 42 };
    expect(logObjectToPinoContext(makeLog(3, [obj])).args).toEqual({
      arg_0: obj,
    });
  });

  it("is empty when there are no object args", () => {
    expect(logObjectToPinoContext(makeLog(3, ["just a string"])).args).toEqual(
      {},
    );
  });
});

describe("logObjectToPinoContext — tag", () => {
  it("passes the consola tag through", () => {
    expect(logObjectToPinoContext(makeLog(3, ["msg"], { tag: "api" })).tag).toBe(
      "api",
    );
  });

  it("falls back to empty string when tag is absent", () => {
    const log = makeLog(3, ["msg"]);
    log.tag = undefined;
    expect(logObjectToPinoContext(log).tag).toBe("");
  });
});

// --- createPinoReporter ----------------------------------------------------

describe("createPinoReporter", () => {
  describe("with a pre-built logger instance", () => {
    function mockPino(): PinoLoggerLike {
      return {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      };
    }

    it("forwards each log entry to the matching pino level method", () => {
      const pino = mockPino();
      const reporter = createPinoReporter({ logger: pino });

      reporter.log(makeLog(0, ["boom"]), { options: {} } as never);
      expect(pino.error).toHaveBeenCalledTimes(1);
      expect(pino.error).toHaveBeenCalledWith(
        expect.objectContaining({ tag: "app" }),
        "boom",
      );
    });

    it("maps every consola level to the correct pino method", () => {
      const pino = mockPino();
      const reporter = createPinoReporter({ logger: pino });

      reporter.log(makeLog(0, ["e"]), { options: {} } as never);
      reporter.log(makeLog(1, ["w"]), { options: {} } as never);
      reporter.log(makeLog(2, ["l"]), { options: {} } as never);
      reporter.log(makeLog(3, ["i"]), { options: {} } as never);
      reporter.log(makeLog(4, ["d"]), { options: {} } as never);
      reporter.log(makeLog(5, ["t"]), { options: {} } as never);

      expect(pino.error).toHaveBeenCalledTimes(1);
      expect(pino.warn).toHaveBeenCalledTimes(1);
      expect(pino.info).toHaveBeenCalledTimes(2); // log(2) + info(3)
      expect(pino.debug).toHaveBeenCalledTimes(1);
      expect(pino.trace).toHaveBeenCalledTimes(1);
    });

    it("merges structured args into the pino context", () => {
      const pino = mockPino();
      const reporter = createPinoReporter({ logger: pino });

      reporter.log(
        makeLog(3, [{ userId: 7 }]),
        { options: {} } as never,
      );

      expect(pino.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: "app",
          arg_0: { userId: 7 },
        }),
        "",
      );
    });

    it("omits the tag field when the log has no tag", () => {
      const pino = mockPino();
      const reporter = createPinoReporter({ logger: pino });

      const log = makeLog(3, ["msg"]);
      log.tag = "";
      reporter.log(log, { options: {} } as never);

      expect(pino.info).toHaveBeenCalledWith(
        expect.not.objectContaining({ tag: expect.anything() }),
        "msg",
      );
    });
  });

  describe("lazy dynamic import", () => {
    const pinoMock = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    };

    beforeEach(() => {
      Object.values(pinoMock).forEach((fn) => fn.mockClear());
      // Stub the dynamic import: `import("pino")` → { default: factory }.
      vi.doMock("pino", () => ({
        default: vi.fn(() => pinoMock),
      }));
    });

    afterEach(() => {
      vi.doUnmock("pino");
    });

    it("builds a logger once and forwards each entry", async () => {
      const reporter = createPinoReporter({ options: { name: "api" } });
      reporter.log(makeLog(3, ["hello"]), { options: {} } as never);

      await vi.waitFor(() => expect(pinoMock.info).toHaveBeenCalledTimes(1));
      expect(pinoMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ tag: "app" }),
        "hello",
      );
    });

    it("does not throw when pino is unavailable", async () => {
      // Force the lazy import to reject — simulates pino not installed.
      vi.doMock("pino", () => {
        throw new Error("Cannot find module");
      });

      const reporter = createPinoReporter();
      // Must not throw — the reporter catches and caches the failure.
      expect(() =>
        reporter.log(makeLog(3, ["msg"]), { options: {} } as never),
      ).not.toThrow();
    });
  });
});

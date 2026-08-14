import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWithLogContext,
  getCurrentLogContext,
  createRequestLogger,
  type LogContext,
} from "./request-scoped";

/**
 * Tests for request-scoped logging via AsyncLocalStorage.
 */
describe("request-scoped logging", () => {
  describe("runWithLogContext", () => {
    it("makes context available inside the callback", () => {
      const ctx: LogContext = { requestId: "req-1", userId: "user-42" };
      runWithLogContext(ctx, () => {
        expect(getCurrentLogContext()).toEqual(ctx);
      });
    });

    it("returns the callback's return value", () => {
      const result = runWithLogContext({ requestId: "r" }, () => 42);
      expect(result).toBe(42);
    });

    it("cleans up context after the callback returns", () => {
      runWithLogContext({ requestId: "temp" }, () => {});
      expect(getCurrentLogContext()).toBeNull();
    });

    it("cleans up context even when the callback throws", () => {
      expect(() => {
        runWithLogContext({ requestId: "throw" }, () => {
          throw new Error("boom");
        });
      }).toThrow("boom");

      expect(getCurrentLogContext()).toBeNull();
    });

    it("supports nested contexts (inner wins)", () => {
      runWithLogContext({ requestId: "outer" }, () => {
        expect(getCurrentLogContext()?.requestId).toBe("outer");

        runWithLogContext({ requestId: "inner" }, () => {
          expect(getCurrentLogContext()?.requestId).toBe("inner");
        });

        expect(getCurrentLogContext()?.requestId).toBe("outer");
      });
    });

    it("preserves context across async boundaries", async () => {
      const ctx: LogContext = { requestId: "async-1" };
      await runWithLogContext(ctx, async () => {
        await new Promise((r) => setTimeout(r, 10));
        expect(getCurrentLogContext()).toEqual(ctx);
      });
    });

    it("supports arbitrary extra fields", () => {
      runWithLogContext(
        { requestId: "r", custom: "data", count: 5 },
        () => {
          const c = getCurrentLogContext();
          expect(c?.custom).toBe("data");
          expect(c?.count).toBe(5);
        },
      );
    });
  });

  describe("getCurrentLogContext", () => {
    it("returns null outside any scope", () => {
      expect(getCurrentLogContext()).toBeNull();
    });

    it("returns null when context is empty object", () => {
      // Empty context is valid but getCurrentLogContext returns null outside scope
      expect(getCurrentLogContext()).toBeNull();
    });
  });

  describe("createRequestLogger", () => {
    const origEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.LOG_LEVEL;
      delete process.env.NEXT_PUBLIC_LOG_LEVEL;
    });

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it("appends active context to log entries", () => {
      const calls: unknown[][] = [];
      const logger = createRequestLogger({ level: 5, reporters: [
        { log(logObj) {
          calls.push(logObj.args);
        } },
      ] });

      runWithLogContext({ requestId: "r-1" }, () => {
        logger.info("hello", "world");
      });

      expect(calls).toHaveLength(1);
      // Last arg should be the context object.
      expect(calls[0]).toContainEqual({ requestId: "r-1" });
    });

    it("passes through unchanged when no context is active", () => {
      const calls: unknown[][] = [];
      const logger = createRequestLogger({ level: 5 });

      logger.info = (...args: unknown[]) => {
        calls.push(args);
      };

      logger.info("no context");

      expect(calls).toHaveLength(1);
      // No context appended.
      const hasCtx = calls[0]?.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          "requestId" in (a as Record<string, unknown>),
      );
      expect(hasCtx).toBe(false);
    });

    it("creates a working consola instance", () => {
      const logger = createRequestLogger({ level: 4 });
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.withTag).toBe("function");
      expect(logger.level).toBe(4);
    });

    it("does not append empty context", () => {
      const calls: unknown[][] = [];
      const logger = createRequestLogger({ level: 5 });

      logger.info = (...args: unknown[]) => {
        calls.push(args);
      };

      runWithLogContext({}, () => {
        logger.info("empty ctx");
      });

      // Empty context should NOT be appended.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(["empty ctx"]);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  CORRELATION_CONTEXT_KEY,
  CORRELATION_HEADER,
  correlationMiddleware,
  getCorrelationId,
  getOrCreateCorrelationId,
  setCorrelationId,
} from "./correlation.js";
import {
  getCurrentLogContext,
  runWithLogContext,
} from "./request-scoped.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal request shape matching the middleware's structural interface. */
function makeRequest(headers: Record<string, string> = {}) {
  // Normalize to lowercase keys to mirror the case-insensitive Headers API.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: {
      get: vi.fn((name: string) => lower[name.toLowerCase()] ?? null),
    },
  };
}

describe("correlation IDs", () => {
  describe("getCorrelationId", () => {
    it("returns null outside any scope", () => {
      expect(getCorrelationId()).toBeNull();
    });

    it("returns null inside a scope that has no correlation ID", () => {
      runWithLogContext({ userId: "u-1" }, () => {
        expect(getCorrelationId()).toBeNull();
      });
    });
  });

  describe("setCorrelationId + getCorrelationId round-trip", () => {
    it("stores and reads back an explicit ID", () => {
      runWithLogContext({}, () => {
        setCorrelationId("abc-123");
        expect(getCorrelationId()).toBe("abc-123");
      });
    });

    it("writes into the active LogContext under the requestId key", () => {
      runWithLogContext({}, () => {
        setCorrelationId("xyz");
        const ctx = getCurrentLogContext();
        expect(ctx?.[CORRELATION_CONTEXT_KEY]).toBe("xyz");
      });
    });

    it("throws when called outside a scope", () => {
      expect(() => setCorrelationId("nope")).toThrow();
    });

    it("overwrites a previously set ID", () => {
      runWithLogContext({}, () => {
        setCorrelationId("first");
        expect(getCorrelationId()).toBe("first");
        setCorrelationId("second");
        expect(getCorrelationId()).toBe("second");
      });
    });
  });

  describe("getOrCreateCorrelationId", () => {
    it("generates a UUID when none is set", () => {
      runWithLogContext({}, () => {
        const id = getOrCreateCorrelationId();
        expect(id).toMatch(UUID_RE);
      });
    });

    it("caches the generated ID within the same scope", () => {
      runWithLogContext({}, () => {
        const first = getOrCreateCorrelationId();
        const second = getOrCreateCorrelationId();
        expect(second).toBe(first);
        expect(getCorrelationId()).toBe(first);
      });
    });

    it("returns a pre-existing explicit ID without regenerating", () => {
      runWithLogContext({}, () => {
        setCorrelationId("explicit");
        expect(getOrCreateCorrelationId()).toBe("explicit");
      });
    });

    it("does not overwrite an inherited correlation ID", () => {
      runWithLogContext({ requestId: "incoming" }, () => {
        expect(getOrCreateCorrelationId()).toBe("incoming");
      });
    });
  });

  describe("uniqueness across requests (separate ALS scopes)", () => {
    it("generates distinct IDs for independent requests", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        runWithLogContext({}, () => {
          ids.add(getOrCreateCorrelationId());
        });
      }
      expect(ids.size).toBe(50);
    });

    it("each scope only sees its own ID", () => {
      const seen: string[] = [];
      runWithLogContext({}, () => {
        seen.push(getOrCreateCorrelationId());
      });
      runWithLogContext({}, () => {
        seen.push(getOrCreateCorrelationId());
      });
      expect(seen).toHaveLength(2);
      expect(seen[0]).not.toBe(seen[1]);
      expect(getCorrelationId()).toBeNull();
    });
  });

  describe("correlationMiddleware", () => {
    it("reads the X-Request-ID header and stores it", () => {
      const middleware = correlationMiddleware();
      const request = makeRequest({ [CORRELATION_HEADER]: "req-from-client" });

      let captured: string | null = null;
      const result = middleware(request, () => {
        captured = getCorrelationId();
        return "downstream";
      });

      expect(result).toBe("downstream");
      expect(captured).toBe("req-from-client");
      expect(request.headers.get).toHaveBeenCalledWith(CORRELATION_HEADER);
    });

    it("generates a UUID when the header is missing", () => {
      const middleware = correlationMiddleware();
      const request = makeRequest({});

      let captured: string | null = null;
      middleware(request, () => {
        captured = getOrCreateCorrelationId();
        return undefined;
      });

      expect(captured).toMatch(UUID_RE);
    });

    it("generates a UUID when the header is empty", () => {
      const middleware = correlationMiddleware();
      const request = makeRequest({ [CORRELATION_HEADER]: "" });

      let captured: string | null = null;
      middleware(request, () => {
        captured = getCorrelationId();
        return undefined;
      });

      // Empty header value yields null from .get(), so middleware generates.
      expect(captured).toMatch(UUID_RE);
    });

    it("returns the value produced by next()", () => {
      const middleware = correlationMiddleware();
      expect(middleware(makeRequest(), () => 42)).toBe(42);
      expect(middleware(makeRequest(), () => "ok")).toBe("ok");
    });

    it("makes the correlation ID available to downstream handlers", () => {
      const middleware = correlationMiddleware();
      const request = makeRequest({ [CORRELATION_HEADER]: "trace-1" });

      middleware(request, () => {
        const id = getOrCreateCorrelationId();
        expect(id).toBe("trace-1");
      });
    });

    it("cleans up the scope after next() returns", () => {
      const middleware = correlationMiddleware();
      middleware(makeRequest({ [CORRELATION_HEADER]: "temp" }), () => {});

      expect(getCorrelationId()).toBeNull();
    });

    it("merges into a pre-existing active context", () => {
      const middleware = correlationMiddleware();
      const request = makeRequest({ [CORRELATION_HEADER]: "merged-id" });

      runWithLogContext({ userId: "u-9", route: "/api" }, () => {
        middleware(request, () => {
          const ctx = getCurrentLogContext();
          // Correlation ID added.
          expect(ctx?.requestId).toBe("merged-id");
          // Sibling fields preserved.
          expect(ctx?.userId).toBe("u-9");
          expect(ctx?.route).toBe("/api");
          // Outer context untouched (merge happens into a new object).
          return undefined;
        });
        // Outer scope still has its original context.
        expect(getCurrentLogContext()?.requestId).toBeUndefined();
        expect(getCurrentLogContext()?.userId).toBe("u-9");
      });
    });
  });
});

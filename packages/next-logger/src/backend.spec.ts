import { describe, expect, it, beforeEach } from "vitest";
import {
  defineBackend,
  getBackend,
  hasBackend,
  removeBackend,
  type BackendAdapter,
  type Logger,
} from "./backend";

/**
 * Backend registry tests.
 *
 * The registry is module-level (a `Map`). We test the public API:
 * defineBackend, getBackend, hasBackend, removeBackend, and error behaviour.
 */

describe("backend registry", () => {
  const SENTINEL = "__test_sentinel_backend__";

  beforeEach(() => {
    // Clean up any leftover test backend.
    removeBackend(SENTINEL);
  });

  function makeStubLogger(): Logger {
    const noop = (): void => undefined;
    return {
      level: 3,
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
      log: noop,
      withTag: () => makeStubLogger(),
    };
  }

  describe("defineBackend", () => {
    it("registers a backend adapter that getBackend returns", () => {
      const adapter: BackendAdapter = () => makeStubLogger();
      defineBackend(SENTINEL, adapter);
      expect(getBackend(SENTINEL)).toBe(adapter);
    });

    it("can overwrite a previously registered adapter", () => {
      const first: BackendAdapter = () => makeStubLogger();
      const second: BackendAdapter = () => makeStubLogger();
      defineBackend(SENTINEL, first);
      defineBackend(SENTINEL, second);
      expect(getBackend(SENTINEL)).toBe(second);
    });
  });

  describe("hasBackend", () => {
    it("returns true for a registered backend", () => {
      defineBackend(SENTINEL, () => makeStubLogger());
      expect(hasBackend(SENTINEL)).toBe(true);
    });

    it("returns false for an unregistered backend", () => {
      expect(hasBackend("__definitely_not_registered__")).toBe(false);
    });

    it("returns false after removeBackend", () => {
      defineBackend(SENTINEL, () => makeStubLogger());
      removeBackend(SENTINEL);
      expect(hasBackend(SENTINEL)).toBe(false);
    });
  });

  describe("getBackend", () => {
    it("returns the registered adapter", () => {
      const adapter: BackendAdapter = () => makeStubLogger();
      defineBackend(SENTINEL, adapter);
      expect(getBackend(SENTINEL)).toBe(adapter);
    });

    it("throws for an unknown backend with available names listed", () => {
      // The consola backend is always registered (auto-loaded), so it should
      // appear in the error message.
      expect(() => getBackend("__totally_unknown__")).toThrow(
        /backend "__totally_unknown__" is not registered/,
      );
      expect(() => getBackend("__totally_unknown__")).toThrow(
        /Use defineBackend\(\) to register a custom backend/,
      );
    });
  });

  describe("removeBackend", () => {
    it("returns true when a backend was removed", () => {
      defineBackend(SENTINEL, () => makeStubLogger());
      expect(removeBackend(SENTINEL)).toBe(true);
    });

    it("returns false when the backend was not registered", () => {
      expect(removeBackend("__not_there__")).toBe(false);
    });
  });

  describe("built-in backends auto-register", () => {
    it("consola backend is registered on import", async () => {
      // Importing the consola backend module triggers self-registration.
      await import("./backends/consola");
      expect(hasBackend("consola")).toBe(true);
    });

    it("pino backend is registered on import", async () => {
      await import("./backends/pino");
      expect(hasBackend("pino")).toBe(true);
    });
  });
});

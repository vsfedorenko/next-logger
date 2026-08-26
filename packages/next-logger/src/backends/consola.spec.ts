import { describe, expect, it, vi } from "vitest";
import consolaBase from "consola";
import { createConsolaBackend, registerConsolaBackend } from "./consola.js";
import { getBackend, hasBackend } from "../backend.js";
import type { Logger } from "../backend.js";

/**
 * Consola backend adapter tests.
 *
 * The consola backend wraps `consola.create()` and returns a Logger-compatible
 * instance. We test:
 * - The factory produces a working Logger.
 * - Options are forwarded to createConsola.
 * - withTag produces a child logger.
 * - The consola backend is auto-registered under "consola".
 */

describe("consola backend", () => {
  describe("createConsolaBackend", () => {
    it("returns a factory function", () => {
      const factory = createConsolaBackend();
      expect(typeof factory).toBe("function");
    });

    it("factory returns a Logger with all required methods", () => {
      const factory = createConsolaBackend();
      const logger = factory({});
      expect(typeof logger.level).toBe("number");
      expect(typeof logger.trace).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.fatal).toBe("function");
      expect(typeof logger.log).toBe("function");
      expect(typeof logger.withTag).toBe("function");
    });

    it("forwards options to createConsola (level)", () => {
      const factory = createConsolaBackend();
      const logger = factory({ level: 4 });
      expect(logger.level).toBe(4);
    });

    it("defaults to a numeric level", () => {
      const factory = createConsolaBackend();
      const logger = factory({});
      expect(logger.level).toBeGreaterThanOrEqual(0);
      expect(logger.level).toBeLessThanOrEqual(5);
    });

    it("withTag returns a child Logger", () => {
      const factory = createConsolaBackend();
      const logger = factory({});
      const child = logger.withTag("test");
      expect(typeof child.info).toBe("function");
      expect(typeof child.withTag).toBe("function");
      // Child should be a distinct instance.
      expect(child).not.toBe(logger);
    });

    it("produces a logger that actually logs (integration)", () => {
      const captured: string[] = [];
      const factory = createConsolaBackend();
      const logger = factory({
        level: 5,
        reporters: [
          {
            log(logObj: { type: string }) {
              captured.push(logObj.type);
            },
          },
        ],
      });
      logger.info("hello");
      expect(captured).toContain("info");
    });
  });

  describe("registerConsolaBackend", () => {
    it("registers the backend under name 'consola'", () => {
      registerConsolaBackend();
      expect(hasBackend("consola")).toBe(true);
      const adapter = getBackend("consola");
      expect(typeof adapter).toBe("function");
    });

    it("is idempotent (can be called multiple times)", () => {
      registerConsolaBackend();
      registerConsolaBackend();
      expect(hasBackend("consola")).toBe(true);
    });

    it("the registered adapter produces a working Logger", () => {
      registerConsolaBackend();
      const adapter = getBackend("consola");
      const logger: Logger = adapter({ level: 2 });
      expect(logger.level).toBe(2);
    });
  });

  describe("consola backend satisfies Logger interface", () => {
    it("a createConsola instance is structurally compatible with Logger", () => {
      const instance = consolaBase.create({ level: 3 });
      const asLogger = instance as unknown as Logger;
      // Structural check — these are all present on ConsolaInstance.
      expect(typeof asLogger.info).toBe("function");
      expect(typeof asLogger.withTag).toBe("function");
      expect(typeof asLogger.level).toBe("number");
    });
  });
});

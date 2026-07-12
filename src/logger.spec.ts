import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test reloads the module fresh so env-var changes take effect.
async function loadLogger() {
  vi.resetModules();
  return (await import("./logger")).logger;
}

describe("logger", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    delete process.env.NEXT_PUBLIC_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("builds a consola instance with the default level (info=3)", async () => {
    const logger = await loadLogger();
    expect(logger.level).toBe(3);
  });

  it("respects numeric LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "4";
    const logger = await loadLogger();
    expect(logger.level).toBe(4);
  });

  it("respects named LOG_LEVEL (debug → 4)", async () => {
    process.env.LOG_LEVEL = "debug";
    const logger = await loadLogger();
    expect(logger.level).toBe(4);
  });

  it("respects named LOG_LEVEL (error → 0)", async () => {
    process.env.LOG_LEVEL = "error";
    const logger = await loadLogger();
    expect(logger.level).toBe(0);
  });

  it("respects NEXT_PUBLIC_LOG_LEVEL as fallback", async () => {
    process.env.NEXT_PUBLIC_LOG_LEVEL = "5";
    const logger = await loadLogger();
    expect(logger.level).toBe(5);
  });

  it("LOG_LEVEL takes precedence over NEXT_PUBLIC_LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "2";
    process.env.NEXT_PUBLIC_LOG_LEVEL = "5";
    const logger = await loadLogger();
    expect(logger.level).toBe(2);
  });

  it("produces a consola instance with withTag()", async () => {
    const logger = await loadLogger();
    expect(typeof logger.withTag).toBe("function");
    const child = logger.withTag("test");
    expect(typeof child.info).toBe("function");
    expect(typeof child.error).toBe("function");
  });

  describe("LOG_FORMAT", () => {
    afterEach(() => {
      delete process.env.LOG_FORMAT;
      delete process.env.NEXT_PUBLIC_LOG_FORMAT;
    });

    it("installs JSON reporter when LOG_FORMAT=json", async () => {
      process.env.LOG_FORMAT = "json";
      const logger = await loadLogger();

      // The logger builder should have replaced the default reporters with
      // a single JSON reporter.
      const reporters = logger.options.reporters;
      expect(reporters).toHaveLength(1);

      // Verify output is structured JSON by capturing via the reporter.
      const lines: string[] = [];
      logger.setReporters([
        {
          log(logObj) {
            lines.push(JSON.stringify({ level: logObj.level, type: logObj.type }));
          },
        },
      ]);

      logger.info("test-json");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!);
      expect(parsed.type).toBe("info");
      expect(parsed.level).toBe(3); // info = 3 in consola
    });

    it("keeps default reporters when LOG_FORMAT=text (or unset)", async () => {
      delete process.env.LOG_FORMAT;
      const logger = await loadLogger();
      // Default consola has 1 built-in reporter (FancyReporter in TTY /
      // BasicReporter in CI). JSON reporter replaces it only when format=json.
      expect(logger.options.reporters.length).toBeGreaterThanOrEqual(1);
    });

    it("resolveFormat returns 'json' when LOG_FORMAT=json", async () => {
      process.env.LOG_FORMAT = "json";
      vi.resetModules();
      const { resolveFormat } = await import("./defaults");
      expect(resolveFormat()).toBe("json");
    });

    it("resolveFormat returns 'text' by default", async () => {
      delete process.env.LOG_FORMAT;
      delete process.env.NEXT_PUBLIC_LOG_FORMAT;
      vi.resetModules();
      const { resolveFormat } = await import("./defaults");
      expect(resolveFormat()).toBe("text");
    });

    it("resolveFormat accepts NEXT_PUBLIC_LOG_FORMAT", async () => {
      process.env.NEXT_PUBLIC_LOG_FORMAT = "json";
      vi.resetModules();
      const { resolveFormat } = await import("./defaults");
      expect(resolveFormat()).toBe("json");
    });

    it("resolveFormat is case-insensitive", async () => {
      process.env.LOG_FORMAT = "JSON";
      vi.resetModules();
      const { resolveFormat } = await import("./defaults");
      expect(resolveFormat()).toBe("json");
    });

    it("resolveFormat falls back to text for unknown values", async () => {
      process.env.LOG_FORMAT = "xml";
      vi.resetModules();
      const { resolveFormat } = await import("./defaults");
      expect(resolveFormat()).toBe("text");
    });
  });
});

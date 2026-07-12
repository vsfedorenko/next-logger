import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Config discovery tests — verifies lilconfig finds and loads config files in
 * each supported format, including `.ts` via jiti.
 *
 * Strategy: create a temp dir, chdir into it, write a config file, then import
 * `loadConfig` fresh (vi.resetModules) so it re-runs discovery against the new
 * cwd.
 */

async function loadConfigFresh() {
  vi.resetModules();
  return (await import("./config")).loadConfig();
}

describe("config", () => {
  let tmpDir: string;
  const origCwd = process.cwd();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "next-logger-cfg-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns bare defaults when no config file is present", async () => {
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return; // narrow for TS
    expect(result.options.level).toBe(3);
  });

  it("loads next-logger.config.js (partial options)", async () => {
    writeFileSync(
      join(tmpDir, "next-logger.config.js"),
      "module.exports = { consola: { level: 4 } };",
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(4);
  });

  it("loads next-logger.config.cjs (partial options)", async () => {
    writeFileSync(
      join(tmpDir, "next-logger.config.cjs"),
      "module.exports = { consola: { level: 2 } };",
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(2);
  });

  it("loads .next-loggerrc.json", async () => {
    writeFileSync(
      join(tmpDir, ".next-loggerrc.json"),
      JSON.stringify({ consola: { level: 5 } }),
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(5);
  });

  it("loads next-logger.config.ts via jiti (factory)", async () => {
    // Use a factory that returns a duck-typed consola-like object — avoids
    // requiring the real `consola` import from the isolated temp dir (which
    // has no node_modules). Verifies jiti transpiles + executes TS and the
    // factory result is used as the instance.
    writeFileSync(
      join(tmpDir, "next-logger.config.ts"),
      `
        interface FakeConsola { level: number; log: () => void; withTag: () => unknown }
        export default {
          consola: (): FakeConsola => ({ level: 4, log: () => {}, withTag: () => ({}) }),
        };
      `,
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("instance");
    if (result.kind !== "instance") return;
    expect(result.instance.level).toBe(4);
  });

  it("loads next-logger.config.ts via jiti (partial options)", async () => {
    writeFileSync(
      join(tmpDir, "next-logger.config.ts"),
      `
        import type { ConsolaOptions } from "consola";
        const opts: Partial<ConsolaOptions> = { level: 2 };
        export default { consola: opts };
      `,
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(2);
  });

  it("merges formatOptions from a .ts config with defaults", async () => {
    writeFileSync(
      join(tmpDir, "next-logger.config.ts"),
      `export default { consola: { level: 4, formatOptions: { date: false } } };`,
    );
    const result = await loadConfigFresh();
    expect(result.kind).toBe("options");
    if (result.kind !== "options") return;
    expect(result.options.level).toBe(4);
    expect(result.options.formatOptions?.date).toBe(false);
  });
});

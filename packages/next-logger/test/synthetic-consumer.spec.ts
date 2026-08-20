/**
 * Synthetic consumer suite: exercise the PUBLISHED package surface the way
 * a real consumer does — every subpath export, the plugin registry flow,
 * correlation scope semantics, redaction guarantees, console patching.
 *
 * Unlike ./e2e.spec.ts (a full Next.js app), this suite runs against the
 * built package in isolation: no Next.js, no optional peers installed —
 * pinning the "zero-deps core + optional peer subpaths" contract.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const pkg = "@vsfedorenko/next-logger";

// The suite runs from the package root; resolve against the built dist.
const distRequire = createRequire(
  path.join(import.meta.dirname, "..", "dist", "index.js"),
);
const nl = distRequire(pkg);

describe("synthetic consumer: subpath exports", () => {
  // The published exports map, read from the built package.json. Each
  // entry must point at a dist file that exists and imports cleanly.
  const subpaths = [
    ".",
    "./browser",
    "./backends/consola",
    "./backends/pino",
    "./backends/winston",
    "./reporters/sentry",
    "./reporters/pino",
    "./reporters/datadog",
    "./reporters/otlp",
    "./log-viewer",
  ];

  for (const sp of subpaths) {
    it(`resolves ${sp}`, async () => {
      const manifest = JSON.parse(
        await import("node:fs").then((fs) =>
          fs.readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
        ),
      );
      type ExportEntry = { default?: string; import?: string; require?: string };
      const entry = (manifest.exports as Record<string, ExportEntry>)[sp];
      const target = entry?.default ?? entry?.require ?? entry?.import;
      expect(target, `exports[${JSON.stringify(sp)}] target`).toBeDefined();
      // the mapped file must exist on disk
      const file = path.join(import.meta.dirname, "..", target!.replace(/^\.\//, ""));
      expect(() => require.resolve(file)).not.toThrow();
    });
  }

  it("imports every backend without its peer installed", () => {
    // pino/winston/consola are NOT installed in this suite's environment
    // by design — importing the adapter module must not require the peer.
    for (const sp of ["backends/consola", "backends/pino", "backends/winston"]) {
      const mod = distRequire(`${pkg}/${sp}`);
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
  });
});

describe("synthetic consumer: plugin registry", () => {
  it("defineReporter/hasReporter/removeReporter round-trip", () => {
    const factory = () => ({ log() {} });
    nl.defineReporter("synthetic-probe", factory);
    expect(nl.hasReporter("synthetic-probe")).toBe(true);
    const resolved = nl.resolveReporters([{ name: "synthetic-probe" }]);
    expect(resolved).toHaveLength(1);
    expect(nl.removeReporter("synthetic-probe")).toBe(true);
    expect(nl.hasReporter("synthetic-probe")).toBe(false);
  });

  it("unknown reporter throws with available names listed", () => {
    expect(() => nl.resolveReporters([{ name: "nope" }])).toThrow(/not registered.*Available:/);
  });

  it("built-in json reporter resolves", () => {
    expect(nl.resolveReporters([{ name: "json" }])).toHaveLength(1);
  });

  it("definePreset round-trip", () => {
    nl.definePreset("synthetic-preset", { reporters: [{ name: "json" }] });
    expect(nl.hasPreset("synthetic-preset")).toBe(true);
    nl.removePreset("synthetic-preset");
    expect(nl.hasPreset("synthetic-preset")).toBe(false);
  });
});

describe("synthetic consumer: correlation scope semantics", () => {
  it("inside runWithLogContext the id is generated once and stable", () => {
    const result = nl.runWithLogContext({}, () => {
      const c1 = nl.getOrCreateCorrelationId();
      const c2 = nl.getCorrelationId();
      const c3 = nl.getOrCreateCorrelationId();
      return { c1, c2, c3 };
    });
    expect(result.c2).toBe(result.c1);
    expect(result.c3).toBe(result.c1);
  });

  it("outside a scope getOrCreateCorrelationId returns ephemeral ids (documented)", () => {
    const a = nl.getOrCreateCorrelationId();
    const b = nl.getOrCreateCorrelationId();
    // throw-free ephemeral UUIDs; NOT necessarily distinct forever —
    // contract only requires: string, UUID-shaped, no throw.
    expect(a).toMatch(/[0-9a-f-]{36}/);
    expect(b).toMatch(/[0-9a-f-]{36}/);
  });

  it("setCorrelationId outside a scope throws with an actionable message", () => {
    expect(() => nl.setCorrelationId("x")).toThrow(/runWithLogContext/);
  });
});

describe("synthetic consumer: redaction guarantees", () => {
  const capture = () => {
    const chunks: string[] = [];
    return {
      chunks,
      reporter: { log: (m: unknown) => chunks.push(JSON.stringify(m)) },
    };
  };

  it("masks password/token/apiKey including nested objects", () => {
    const { chunks, reporter } = capture();
    const red = nl.createRedactionReporter({ reporter });
    red.log({
      level: 1,
      args: [{
        password: "super-secret-123",
        token: "ghp_abcdef123456", // gitleaks:allow - synthetic fixture for the redaction test
        nested: { apiKey: "sk-999" }, // gitleaks:allow - synthetic fixture for the redaction test
        safe: "ok-value",
      }],
    });
    const dumped = chunks.join("");
    expect(dumped).not.toContain("super-secret-123");
    expect(dumped).not.toContain("ghp_abcdef123456");
    expect(dumped).not.toContain("sk-999");
    expect(dumped).toContain("ok-value");
    expect(dumped).toContain("[REDACTED]");
  });
});

describe("synthetic consumer: console patching", () => {
  it("patchConsole routes console methods through the logger (void return)", () => {
    const routed: string[] = [];
    const fakeLogger = {
      log: (...a: unknown[]) => routed.push("log:" + String(a[0])),
      info: (...a: unknown[]) => routed.push("info:" + String(a[0])),
      warn: (...a: unknown[]) => routed.push("warn:" + String(a[0])),
      error: (...a: unknown[]) => routed.push("error:" + String(a[0])),
      debug: (...a: unknown[]) => routed.push("debug:" + String(a[0])),
      success: (...a: unknown[]) => routed.push("success:" + String(a[0])),
      fail: (...a: unknown[]) => routed.push("fail:" + String(a[0])),
      ready: (...a: unknown[]) => routed.push("ready:" + String(a[0])),
      box: (...a: unknown[]) => routed.push("box:" + String(a[0])),
      begin: (...a: unknown[]) => routed.push("begin:" + String(a[0])),
      end: (...a: unknown[]) => routed.push("end:" + String(a[0])),
      withTag: () => fakeLogger,
    } as never;
    const originals = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
    try {
      nl.patchConsole(fakeLogger);
      console.log("route-me");
      expect(routed.join(" ")).toContain("route-me");
    } finally {
      Object.assign(console, originals);
    }
    // console restored and functional
    expect(() => console.log("synthetic-ok")).not.toThrow();
  });
});

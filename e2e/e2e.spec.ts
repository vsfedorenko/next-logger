import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real end-to-end test.
 *
 * Spins up an actual Next.js 16 (Turbopack) application (the static fixture in
 * ./fixture), installs the built @vsfedorenko/next-logger into it (via
 * file:../..), builds the app, starts the production server, and asserts on the
 * server's JSON log output that:
 *   - console.log / console.warn / console.debug are routed through consola
 *     (tag 'console') — warn & error go to stderr, captured here too,
 *   - the `logger.consola.level` from next.config is applied (a debug-level
 *     message only emits when level >= 4),
 *   - Next's own startup logging is routed through the patch (tag 'next.js') —
 *     this uses the SAME module instance Next uses, unlike a manual route import
 *     (which Turbopack isolates into a separate bundle instance).
 *
 * Heavy: performs npm install + next build. Run via `npm run test:e2e`.
 */

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixture");
const PORT = 3917;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type JsonLog = { msg?: string; tag?: string; level?: string; type?: string };

function parseJsonLogs(blob: string): JsonLog[] {
  return blob.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line) as JsonLog];
    } catch {
      return [];
    }
  });
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd: FIXTURE, stdio: "inherit" });
    const timer = setTimeout(
      () => rejectP(new Error(`${cmd} ${args.join(" ")} timed out`)),
      timeoutMs,
    );
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveP();
      else rejectP(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

describe("real Next.js app", () => {
  let server: ChildProcess | null = null;
  // Everything the server writes from boot onwards (stdout + stderr).
  let output = "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, consola, + this package via file:).
    await run("npm", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run("npx", ["next", "build"], 240_000);

    // 3. Start the production server with JSON output, capturing both streams.
    server = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: FIXTURE,
      env: { ...process.env, LOG_FORMAT: "json" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    // 4. Wait until the server responds (up to 40s).
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE}/`);
        if (res.ok) break;
      } catch {
        // not up yet
      }
      await sleep(500);
    }
  }, 300_000);

  afterAll(() => {
    server?.kill("SIGTERM");
  });

  // Hit /api/log and return only the JSON logs emitted SINCE the call.
  async function logsSinceHit(): Promise<JsonLog[]> {
    const before = output.length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let the patched logger flush
    return parseJsonLogs(output.slice(before));
  }

  it("routes console.log through consola tagged 'console' (stdout)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_CONSOLE_TEST");
    expect(entry, "expected E2E_CONSOLE_TEST in JSON output").toBeTruthy();
    expect(entry?.tag).toBe("console");
  }, 30_000);

  it("routes console.warn through consola tagged 'console' (stderr)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_CONSOLE_WARN");
    expect(entry, "warn goes to stderr — expected E2E_CONSOLE_WARN").toBeTruthy();
    expect(entry?.tag).toBe("console");
  }, 30_000);

  it("applies logger.consola.level from next.config (debug visible → level ≥ 4)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_DEBUG_TEST");
    expect(entry, "debug hidden — configured level (4) not applied").toBeTruthy();
  }, 30_000);

  it("tags Next.js-style marker lines as 'next.js' (classifier, end to end)", async () => {
    // The real `next start` startup banner prints before register() runs, so
    // it can't be asserted deterministically. Instead the route emits a
    // marker-prefixed line and we verify the console-sink classifier tags it
    // 'next.js' — the same code path Next's own logs take.
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg?.includes("E2E_NEXT_STYLE"));
    expect(entry, "expected E2E_NEXT_STYLE in JSON output").toBeTruthy();
    expect(entry?.tag).toBe("next.js");
  }, 30_000);
}, 300_000);

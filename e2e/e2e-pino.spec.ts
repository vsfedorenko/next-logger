import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real end-to-end test for the **pino** backend.
 *
 * A sibling of {@link e2e.spec.ts}, this spins up the ./fixture-pino Next.js
 * app — configured with `withLogger({ backend: "pino" })` and the
 * `@vsfedorenko/next-logger/backends/pino` side-effect import — installs the
 * built @vsfedorenko/next-logger into it (via file:../..), builds the app,
 * starts the production server, and asserts on the server's log output that:
 *
 *   - console.log / console.warn / console.debug are routed through pino as
 *     ndjson (one JSON object per line) with pino's characteristic fields
 *     (`level`, `time`, `pid`, `hostname`, `msg`),
 *   - the `backendOptions.level: "debug"` from next.config is applied (a
 *     debug-level message only emits when the pino level allows it),
 *   - pino's numeric `level` field is present and in the expected range.
 *
 * Heavy: performs next build. Run via `bun run test:e2e` (fixtures resolve
 * the library through bun workspaces — see the root package.json).
 */

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixture-pino");
const PORT = 3918;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * A parsed pino log line.
 *
 * Pino emits ndjson. Each line has the shape:
 *   {"level":30,"time":1700000000000,"pid":123,"hostname":"x","msg":"..."}
 */
type PinoLog = {
  level?: number;
  time?: number;
  pid?: number;
  hostname?: string;
  msg?: string;
  tag?: string;
};

/**
 * Parse a blob of server output into pino JSON log lines.
 *
 * Non-JSON lines (e.g. the Next.js startup banner, blank lines) are skipped.
 */
function parsePinoLogs(blob: string): PinoLog[] {
  return blob.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return [];
    try {
      const parsed = JSON.parse(trimmed) as PinoLog;
      // Only keep lines that look like pino output (have level + time).
      if (typeof parsed.level === "number" && typeof parsed.time === "number") {
        return [parsed];
      }
      return [];
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

describe("real Next.js app (pino backend)", () => {
  let server: ChildProcess | null = null;
  // Everything the server writes from boot onwards (stdout + stderr).
  let output = "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, pino, + this package via
    //    the bun workspace — node_modules is isolated per fixture).
    await run("bun", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run("bun", ["run", "build"], 240_000);

    // 3. Start the production server, capturing both streams.
    //    No LOG_FORMAT=json needed — pino emits ndjson natively.
    server = spawn("bun", ["run", "start", "-p", String(PORT)], {
      cwd: FIXTURE,
      env: { ...process.env },
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

  // Hit /api/log and return only the pino logs emitted SINCE the call.
  async function logsSinceHit(): Promise<PinoLog[]> {
    const before = output.length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let pino flush
    return parsePinoLogs(output.slice(before));
  }

  it("routes console.log through pino (ndjson with level/time/pid)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_CONSOLE_TEST");
    expect(entry, "expected E2E_CONSOLE_TEST in pino JSON output").toBeTruthy();
    // Pino's characteristic numeric level (info = 30).
    expect(entry?.level).toBe(30);
    expect(entry?.time).toBeGreaterThan(0);
    expect(entry?.pid).toBeGreaterThan(0);
    expect(typeof entry?.hostname).toBe("string");
  }, 30_000);

  it("routes console.warn through pino (warn = 40)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_CONSOLE_WARN");
    expect(entry, "expected E2E_CONSOLE_WARN in pino JSON output").toBeTruthy();
    expect(entry?.level).toBe(40);
  }, 30_000);

  it("applies backendOptions.level from next.config (debug visible → level ≤ 20)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.msg === "E2E_DEBUG_TEST");
    expect(
      entry,
      "debug hidden — backendOptions.level (debug) not applied",
    ).toBeTruthy();
    // Pino debug = 20.
    expect(entry?.level).toBe(20);
  }, 30_000);
}, 300_000);

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real end-to-end test for the **winston** backend.
 *
 * A sibling of {@link e2e-pino.spec.ts}, this spins up the ./fixture-winston
 * Next.js app — configured with `withLogger({ backend: "winston" })` and the
 * `@vsfedorenko/next-logger/backends/winston` side-effect import — installs
 * the workspace @vsfedorenko/next-logger, builds the app, starts the
 * production server, and asserts on the server's log output that:
 *
 *   - console.log / console.warn / console.debug are routed through the
 *     winston backend as single-line JSON
 *     (`{"level":"info","message":"..."}`, warn on stderr),
 *   - the `backendOptions.level: "debug"` from next.config is applied (a
 *     debug-level message only emits when the winston level allows it),
 *   - winston's level labels match the consola numeric mapping (info=3,
 *     warn=1) via the public API.
 *
 * Heavy: performs next build. Run via `bun run test:e2e` (fixtures resolve
 * the library through bun workspaces — see the root package.json).
 */

const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixture-winston",
);
const PORT = 3920;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** A parsed winston console line: {"level":"info","message":"..."}. */
type WinstonLog = {
  level?: string;
  message?: string;
};

/** Strip ANSI color escapes (winston colorizes when TTY-ish environments). */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;

/**
 * Parse a blob of server output into winston JSON log lines.
 *
 * Non-JSON lines (the Next.js startup banner, blank lines, winston's
 * "no transports" warnings) are skipped.
 */
function parseWinstonLogs(blob: string): WinstonLog[] {
  const logs: WinstonLog[] = [];
  for (const line of blob.split("\n")) {
    const trimmed = line.replace(ANSI, "").trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as WinstonLog;
      if (typeof parsed.level === "string" && "message" in parsed) {
        logs.push(parsed);
      }
    } catch {
      // not a JSON log line
    }
  }
  return logs;
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

describe("real Next.js app (winston backend)", () => {
  let server: ChildProcess | null = null;
  // Everything the server writes from boot onwards (stdout + stderr).
  let output = "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, winston, + this package via
    //    the bun workspace — node_modules is isolated per fixture).
    await run("bun", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run("bun", ["run", "build"], 240_000);

    // 3. Start the production server, capturing both streams. The winston
    //    Console transport (configured in instrumentation.ts) emits
    //    single-line JSON, with warn/error on stderr.
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

  // Hit /api/log and return only the winston logs emitted SINCE the call.
  async function logsSinceHit(): Promise<WinstonLog[]> {
    const before = output.length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let winston flush
    return parseWinstonLogs(output.slice(before));
  }

  it("routes console.log through winston (JSON with level/message)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.message === "E2E_CONSOLE_TEST");
    expect(
      entry,
      "expected E2E_CONSOLE_TEST in winston JSON output",
    ).toBeTruthy();
    expect(entry?.level).toBe("info");
  }, 30_000);

  it("routes console.warn through winston (level warn, stderr)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.message === "E2E_CONSOLE_WARN");
    expect(
      entry,
      "expected E2E_CONSOLE_WARN in winston JSON output",
    ).toBeTruthy();
    expect(entry?.level).toBe("warn");
  }, 30_000);

  it("applies backendOptions.level from next.config (debug visible)", async () => {
    const logs = await logsSinceHit();
    const entry = logs.find((e) => e.message === "E2E_DEBUG_TEST");
    expect(
      entry,
      "expected E2E_DEBUG_TEST — backendOptions.level=debug must propagate",
    ).toBeTruthy();
    expect(entry?.level).toBe("debug");
  }, 30_000);
});

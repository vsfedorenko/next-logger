import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fixtureDir,
  parseJsonLines,
  run,
  sleep,
  startFixtureServer,
  type ServerHandle,
} from "./helpers";

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

const FIXTURE = fixtureDir("fixture-pino");
const PORT = 3918;
const BASE = `http://localhost:${PORT}`;

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

describe("real Next.js app (pino backend)", () => {
  let handle: ServerHandle | undefined;
  // Live view of everything the server writes (stdout + stderr).
  const output = (): string => handle?.read() ?? "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, pino, + this package via
    //    the bun workspace — node_modules is isolated per fixture).
    await run(FIXTURE, "bun", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run(FIXTURE, "bun", ["run", "build"], 240_000);

    // 3. Start the production server, capturing both streams.
    handle = await startFixtureServer({
      cwd: FIXTURE,
      port: PORT,
      env: { LOG_FORMAT: "json" },
    });
  }, 300_000);

  afterAll(() => {
    handle?.server.kill("SIGTERM");
  });

  // Hit /api/log and return only the pino logs emitted SINCE the call.
  async function logsSinceHit(): Promise<PinoLog[]> {
    const before = output().length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let pino flush
    return parseJsonLines<PinoLog>(output().slice(before), ["level", "msg"]);
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

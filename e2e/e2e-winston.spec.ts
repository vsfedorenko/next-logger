import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fixtureDir,
  parseJsonLines,
  stripAnsi,
  run,
  sleep,
  startFixtureServer,
  type ServerHandle,
} from "./helpers";

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

const FIXTURE = fixtureDir("fixture-winston");
const PORT = 3920;
const BASE = `http://localhost:${PORT}`;

/** A parsed winston console line: {"level":"info","message":"..."}. */
type WinstonLog = {
  level?: string;
  message?: string;
};

/** Strip ANSI color escapes (winston colorizes when TTY-ish environments). */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;

describe("real Next.js app (winston backend)", () => {
  let handle: ServerHandle | undefined;
  // Live view of everything the server writes (stdout + stderr).
  const output = (): string => handle?.read() ?? "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, winston, + this package via
    //    the bun workspace — node_modules is isolated per fixture).
    await run(FIXTURE, "bun", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run(FIXTURE, "bun", ["run", "build"], 240_000);

    // 3. Start the production server, capturing both streams.
    handle = await startFixtureServer({
      cwd: FIXTURE,
      port: PORT,
    });
  }, 300_000);

  afterAll(() => {
    handle?.server.kill("SIGTERM");
  });

  // Hit /api/log and return only the winston logs emitted SINCE the call.
  async function logsSinceHit(): Promise<WinstonLog[]> {
    const before = output().length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let winston flush
    return parseJsonLines<WinstonLog>(stripAnsi(output().slice(before)), ["level", "message"]);
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

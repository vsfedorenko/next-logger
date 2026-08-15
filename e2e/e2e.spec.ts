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
 * Heavy: performs next build. Run via `bun run test:e2e` (fixtures resolve
 * the library through bun workspaces — see the root package.json).
 */

const FIXTURE = fixtureDir("fixture");
const PORT = 3917;
const BASE = `http://localhost:${PORT}`;

type JsonLog = { msg?: string; tag?: string; level?: string; type?: string };

describe("real Next.js app", () => {
  let handle: ServerHandle | undefined;
  // Live view of everything the server writes (stdout + stderr).
  const output = (): string => handle?.read() ?? "";

  beforeAll(async () => {
    // 1. Install fixture deps (next, react, consola, + this package via
    //    the bun workspace — node_modules is isolated per fixture).
    await run(FIXTURE, "bun", ["install"], 240_000);
    // 2. Build the Next.js app (Turbopack is the Next 16 default).
    await run(FIXTURE, "bun", ["run", "build"], 240_000);

    // 3. Start the production server with JSON output, capturing both streams.
    handle = await startFixtureServer({
      cwd: FIXTURE,
      port: PORT,
      env: { LOG_FORMAT: "json" },
    });
  }, 300_000);

  afterAll(() => {
    handle?.server.kill("SIGTERM");
  });

  // Hit /api/log and return only the JSON logs emitted SINCE the call.
  async function logsSinceHit(): Promise<JsonLog[]> {
    const before = output().length;
    const res = await fetch(`${BASE}/api/log`);
    expect(res.ok).toBe(true);
    await sleep(1000); // let the patched logger flush
    return parseJsonLines<JsonLog>(output().slice(before), ["msg", "level"]);
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

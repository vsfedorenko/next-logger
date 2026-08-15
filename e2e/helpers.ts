import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Shared helpers for the real-Next.js e2e suites (e2e/*.spec.ts).
 *
 * Every spec spins up a fixture app the same way: bun install → next build →
 * next start on a dedicated port, while capturing everything the server
 * writes. These helpers centralise that lifecycle so the specs only declare
 * their fixture, port and log-parsing shape.
 */

/** Resolve a fixture directory relative to this e2e/ folder. */
export function fixtureDir(name: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), name);
}

/** Await `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Run a command in `cwd`, inheriting stdio (build/install output belongs in
 * the test log). Rejects on non-zero exit or timeout.
 */
export function run(
  cwd: string,
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
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

/** Everything captured from a running fixture server (stdout + stderr). */
export type ServerHandle = {
  server: ChildProcess;
  /** Read the full output captured so far (stdout + stderr, live). */
  read(): string;
};

/**
 * Start the fixture's production server (`bun run start -p PORT`) and wait
 * until its index page responds. Both streams are captured into a growing
 * buffer the specs slice for assertions.
 *
 * Fails fast (with the captured output in the error) when the server dies or
 * never becomes ready — silent 40s hangs waste a full hook timeout.
 *
 * @returns the handle; the caller owns killing the server in `afterAll`.
 */
export async function startFixtureServer(opts: {
  cwd: string;
  port: number;
  env?: Record<string, string>;
}): Promise<ServerHandle> {
  const { cwd, port, env } = opts;

  const server = spawn("bun", ["run", "start", "-p", String(port)], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
  });

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 40_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `fixture server exited with code ${server.exitCode} before becoming ready. Output:\n${buffer}`,
      );
    }
    try {
      const res = await fetch(`${base}/`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  if (!ready) {
    throw new Error(
      `fixture server did not become ready within 40s. Output:\n${buffer}`,
    );
  }

  return {
    server,
    read: (): string => buffer,
  };
}

/**
 * Parse captured server output into per-line JSON objects, skipping
 * non-JSON lines (Next.js banners, blank lines, plain-text warnings).
 * Returns only lines that parse AND contain all `requiredKeys`.
 */
export function parseJsonLines<T extends object>(
  blob: string,
  requiredKeys: readonly string[],
): T[] {
  const out: T[] = [];
  for (const line of blob.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (requiredKeys.every((k) => k in parsed)) {
        out.push(parsed as T);
      }
    } catch {
      // not a JSON log line
    }
  }
  return out;
}

/** Strip ANSI color escapes from a chunk of captured output. */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001B\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * "Optional peer dependency is not installed" behaviour — black-box, against
 * the built package, for every optional backend peer (pino, winston).
 *
 * Inside the monorepo, bun hoists the e2e fixtures' backend dependencies to
 * the root node_modules, so the libraries' "peer is missing" error paths
 * cannot be exercised through the real dependency tree. Instead, this spec
 * reproduces exactly what a user of the published package sees: a pristine
 * install with only `@vsfedorenko/next-logger` and `consola` (its
 * non-optional peer) — and none of the optional peers.
 *
 * For each peer it copies dist/ into an isolated sandbox with its own
 * package.json (the peer is nowhere on the resolution path), then runs `node`
 * against the built backend and asserts the clear install-instructions error.
 */

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(PKG_ROOT, "dist");

/** The optional backend peers exercised by this spec. */
const PEERS = [
  { backend: "pino", subpath: "./backends/pino" },
  { backend: "winston", subpath: "./backends/winston" },
] as const;

// Outside the package dir: a sandbox inside PKG_ROOT would hit Node's
// self-reference resolution (trySelf) and resolve @vsfedorenko/next-logger
// back to the workspace source instead of the sandbox copy.
const SANDBOXES: Record<string, string> = {};

/**
 * Build a sandbox: dist + a stub package.json allowing deep dist imports
 * (the real exports map forbids them — correct for users, but the sandbox
 * needs direct access) + consola (the mandatory peer) + an entry script.
 */
function buildSandbox(peer: (typeof PEERS)[number]): string {
  const sandbox = join(tmpdir(), `next-logger-${peer.backend}-missing-sandbox`);
  const entry = join(sandbox, "entry.js");

  mkdirSync(join(sandbox, "node_modules", "@vsfedorenko"), {
    recursive: true,
  });
  cpSync(
    DIST,
    join(sandbox, "node_modules", "@vsfedorenko", "next-logger", "dist"),
    { recursive: true },
  );
  writeFileSync(
    join(
      sandbox,
      "node_modules",
      "@vsfedorenko",
      "next-logger",
      "package.json",
    ),
    `{"name":"@vsfedorenko/next-logger","version":"0.0.0","main":"./dist/index.js",` +
      `"exports":{".":"./dist/index.js","./backend":"./dist/core/backend.js",` +
      `"./logger":"./dist/config/logger.js","${peer.subpath}":"./dist/${peer.subpath.replace("./", "")}.js"}}`,
  );

  // consola is required by dist/config/logger.js — copy the hoisted workspace copy.
  // Walk up from the resolved entry to the package root (exports forbid
  // resolving "consola/package.json" directly).
  const consolaEntry = require.resolve("consola");
  const consolaDir = consolaEntry.slice(
    0,
    consolaEntry.lastIndexOf("node_modules/consola/") +
      "node_modules/consola/".length,
  );
  cpSync(consolaDir, join(sandbox, "node_modules", "consola"), {
    recursive: true,
  });

  writeFileSync(
    entry,
    `// Register the backend via its public subpath (side-effect import),
// exactly as a user would, WITHOUT "${peer.backend}" installed.
require("@vsfedorenko/next-logger/${peer.subpath.replace("./", "")}");
const { getBackend } = require("@vsfedorenko/next-logger/backend");

// Selecting the backend must fail with a clear, actionable error.
const factory = getBackend("${peer.backend}");
try {
  factory({});
  console.error("UNEXPECTED: backend built without ${peer.backend} installed");
  process.exit(3);
} catch (err) {
  console.log(String(err.message));
}
`,
  );
  return entry;
}

beforeAll(() => {
  for (const peer of PEERS) {
    SANDBOXES[peer.backend] = buildSandbox(peer);
  }
});

afterAll(() => {
  for (const dir of Object.values(SANDBOXES)) {
    rmSync(dirname(dir), { recursive: true, force: true });
  }
});

describe.each(PEERS)("built package without %s installed", ({ backend }) => {
  const runEntry = (): string =>
    execFileSync("node", [SANDBOXES[backend]], { encoding: "utf8" });

  it(`backend factory throws a clear error mentioning ${backend}`, () => {
    expect(runEntry()).toMatch(
      new RegExp(`backend "${backend}" requires the "${backend}" package`),
    );
  });

  it("error message includes install instructions", () => {
    expect(runEntry()).toMatch(new RegExp(`npm install ${backend}`));
  });
});

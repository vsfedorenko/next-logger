import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * "Winston is not installed" behaviour — black-box, against the built package.
 *
 * Inside the monorepo, bun hoists the e2e fixture's winston dependency to the
 * root node_modules, so the library's "winston is missing" error path cannot be
 * exercised through the real dependency tree. Instead, this spec reproduces
 * exactly what a user of the published package sees: a pristine install with
 * only `@vsfedorenko/next-logger` and `consola` (its non-optional peer) —
 * and no winston.
 *
 * It copies dist/ into an isolated sandbox with its own package.json (no
 * winston anywhere on the resolution path), then runs `node` against the built
 * `dist/backends/winston.js` and asserts the clear install-instructions error.
 */

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(PKG_ROOT, "dist");
// Outside the package dir: a sandbox inside PKG_ROOT would hit Node's
// self-reference resolution (trySelf) and resolve @vsfedorenko/next-logger
// back to the workspace source instead of the sandbox copy.
const SANDBOX = join(tmpdir(), "next-logger-winston-missing-sandbox");

/** Entrypoint executed inside the sandbox (no winston on the resolution path). */
const SANDBOX_ENTRY = `// Register the winston backend via its public subpath (side-effect import),
// exactly as a user would, WITHOUT winston installed.
require("@vsfedorenko/next-logger/backends/winston");
const { getBackend } = require("@vsfedorenko/next-logger/backend");

// Selecting the winston backend must fail with a clear, actionable error.
const factory = getBackend("winston");
try {
  factory({});
  console.error("UNEXPECTED: winston backend built without winston installed");
  process.exit(3);
} catch (err) {
  console.log(String(err.message));
}
`;
// The sandbox's package.json stub allows deep dist imports (the real exports
// map forbids them — correct for users, but the sandbox needs direct access).
const SANDBOX_PKG = `{"name":"@vsfedorenko/next-logger","version":"0.0.0","main":"./dist/index.js","exports":{".":"./dist/index.js","./backend":"./dist/backend.js","./logger":"./dist/logger.js","./backends/winston":"./dist/backends/winston.js"}}`;

let entry: string;

beforeAll(() => {
  // A pristine user install: the library + its only mandatory peer (consola).
  mkdirSync(join(SANDBOX, "node_modules", "@vsfedorenko"), { recursive: true });
  cpSync(DIST, join(SANDBOX, "node_modules", "@vsfedorenko/next-logger", "dist"), {
    recursive: true,
  });
  // Stub package.json: deep dist imports allowed (see SANDBOX_PKG note).
  writeFileSync(
    join(SANDBOX, "node_modules", "@vsfedorenko", "next-logger", "package.json"),
    SANDBOX_PKG,
  );
  // consola is required by dist/logger.js — copy the hoisted workspace copy.
  // Walk up from the resolved entry to the package root (exports forbid
  // resolving "consola/package.json" directly).
  const consolaEntry = require.resolve("consola");
  const consolaDir = consolaEntry.slice(
    0,
    consolaEntry.lastIndexOf("node_modules/consola/") +
      "node_modules/consola/".length,
  );
  cpSync(consolaDir, join(SANDBOX, "node_modules", "consola"), {
    recursive: true,
  });
  entry = join(SANDBOX, "entry.js");
  writeFileSync(entry, SANDBOX_ENTRY);
});

afterAll(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
});

describe("built package without winston installed", () => {
  it("backend factory throws a clear error mentioning winston", () => {
    const out = execFileSync("node", [entry], { encoding: "utf8" });
    expect(out).toMatch(/backend "winston" requires the "winston" package/);
  });

  it("error message includes install instructions", () => {
    const out = execFileSync("node", [entry], { encoding: "utf8" });
    expect(out).toMatch(/npm install winston/);
  });
});

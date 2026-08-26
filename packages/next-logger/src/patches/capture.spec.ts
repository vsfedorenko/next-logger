import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../backend.js";
import { OWN_OUTPUT, captureStreams, parseLine } from "./capture.js";

/**
 * Tests for the stream capture. The contract under test:
 * - every complete line on stdout/stderr reaches the logger — coverage is
 *   total, the parser only assigns level/tag;
 * - original bytes are mirrored to the real stream;
 * - the logger's own writes never re-enter the capture;
 * - idempotent installs collapse into one hook.
 */

function fakeLogger(): Logger & {
  calls: Array<[string, string, string]>;
} {
  // calls: [level, tag, message] — the tag must ride the STRUCTURED channel
  // (withTag), never be glued into the message text.
  const calls: Array<[string, string, string]> = [];
  const mk = (level: string, tag: string) => (m: string) =>
    calls.push([level, tag, m]);
  const make = (tag: string): Logger =>
    ({
      debug: mk("debug", tag),
      info: mk("info", tag),
      warn: mk("warn", tag),
      error: mk("error", tag),
      withTag: (t: string) => make(t),
    }) as unknown as Logger;
  const root = make("");
  return Object.assign(root, { calls });
}

describe("patches/capture — parseLine", () => {
  it("tags Next markers as next.js info", () => {
    expect(parseLine("▲ Next.js 16.3.2 (Turbopack)", "stdout").tag).toBe("next.js");
    expect(parseLine("✓ Ready in 770ms", "stdout").level).toBe("info");
    expect(parseLine("ℹ ✓ Compiled in 270ms", "stdout").tag).toBe("next.js");
  });

  it("maps ⚠ to warn and ✗ to error", () => {
    expect(parseLine("⚠ Invalid next.config", "stdout").level).toBe("warn");
    expect(parseLine("✗ build failed", "stdout").level).toBe("error");
  });

  it("derives level from the HTTP status", () => {
    expect(parseLine("GET / 200 in 716ms (next.js: 330ms)", "stdout").level).toBe("info");
    expect(parseLine("GET /api/x 404 in 5ms", "stdout").level).toBe("warn");
    expect(parseLine("POST /api/hook 500 in 12ms", "stdout").level).toBe("error");
  });

  it("bracketed plugin and browser-bridge lines flow with bumped levels", () => {
    const mdx = parseLine("[MDX] generated files in 10.07ms", "stdout");
    expect(mdx.tag).toBe("stdout");
    const bridge = parseLine(
      "[console 6:12:32 PM]  ERROR  [browser] useEffect changed size",
      "stdout",
    );
    expect(bridge.level).toBe("error");
  });

  it("unknown shapes still flow — never gated", () => {
    const unknown = parseLine("some brand new next 17 shape", "stdout");
    expect(unknown.tag).toBe("stdout");
    expect(unknown.level).toBe("info");
  });

  it("recognises the pipeline's own output in every backend format", () => {
    // consola 3.x basic: "[tag] LEVEL msg"
    expect(OWN_OUTPUT.test("[console] \u2139 hello")).toBe(true);
    expect(OWN_OUTPUT.test("[stdout] \u2a2f boom")).toBe(true);
    expect(OWN_OUTPUT.test("[next.js] \u2714 done")).toBe(true);
    // consola 2.x fancy: "7:12:32 PM [tag] msg"
    expect(OWN_OUTPUT.test("7:12:32 PM [next.js] x")).toBe(true);
    // level-word prefixes
    expect(OWN_OUTPUT.test("ERROR  [next.js] x")).toBe(true);
    // structured reporters: pure JSON
    expect(OWN_OUTPUT.test('{"level":30,"time":1,"msg":"ndjson"}')).toBe(true);
    // and NOT the shapes the capture must handle:
    expect(OWN_OUTPUT.test("GET / 200 in 716ms")).toBe(false);
    expect(OWN_OUTPUT.test("[MDX] generated files in 10ms")).toBe(false);
    expect(OWN_OUTPUT.test("\u25b2 Next.js 16.3.2")).toBe(false);
  });

  it("stderr defaults to error level", () => {
    expect(parseLine("raw failure text", "stderr").level).toBe("error");
    expect(parseLine("raw failure text", "stderr").tag).toBe("stderr");
  });
});

describe("patches/capture — captureStreams", () => {
  let dispose: (() => void) | undefined;
  let logger: ReturnType<typeof fakeLogger>;

  const write = (s: string): boolean => process.stdout.write(s);

  beforeEach(() => {
    logger = fakeLogger();
    dispose = captureStreams(logger);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it("captures every complete line, mirroring the original output", () => {
    const spy = vi.spyOn(process.stdout.write, "apply").mockReturnValue(true);
    try {
      write("GET / 200 in 716ms\n");
      write("hello from app\n");
      expect(logger.calls).toContainEqual(["info", "next.js", "GET / 200 in 716ms"]);
      expect(logger.calls).toContainEqual(["info", "stdout", "hello from app"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("buffers partial lines until the newline arrives", () => {
    write("partial without newline");
    expect(logger.calls).toHaveLength(0);
    write(" continued\n");
    expect(logger.calls).toContainEqual([
      "info",
      "stdout",
      "partial without newline continued",
    ]);
  });

  it("is idempotent: a second install returns the same disposer", () => {
    const second = captureStreams(logger);
    expect(second).toBe(dispose);
    second();
  });
});

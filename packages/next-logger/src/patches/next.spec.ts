import { describe, expect, it } from "vitest";
import { isNextLog } from "./next.js";

/**
 * Tests for the Next.js log-line classifier. The console sink uses this to tag
 * Next's marker-prefixed output (`▲`/`✓`/`⚠`) as `next.js` and everything else
 * as `console`.
 */

describe("patches/next — isNextLog", () => {
  it("returns false when there are no args", () => {
    expect(isNextLog([])).toBe(false);
  });

  it("returns false when no arg is a string", () => {
    expect(isNextLog([42, { a: 1 }, null])).toBe(false);
  });

  it.each(["▲ Next.js 16.2.10", "✓ Ready in 111ms", "⚠ Invalid next.config"])(
    "detects a Next marker at the start (%s)",
    (msg) => {
      expect(isNextLog([msg])).toBe(true);
    },
  );

  it("detects the marker after a leading non-string arg", () => {
    expect(isNextLog([42, "▲ wait - something"])).toBe(true);
  });

  it("detects the marker when wrapped in ANSI colour codes", () => {
    expect(isNextLog(["\u001b[36m▲\u001b[39m Next.js 16.2.10"])).toBe(true);
  });

  it.each([
    "GET / 200 in 716ms (next.js: 330ms, application-code: 386ms)",
    "GET /services/ai-integrations 200 in 738ms (next.js: 55ms, generate-params: 614ms, application-code: 70ms)",
    "POST /api/hook 500 in 12ms",
    "ℹ ✓ Compiled in 270ms",
    "[MDX] generated files in 10.07ms",
    "[MDX] started dev server",
    "[console 6:12:32 PM]  ERROR  [browser] useEffect changed size between renders",
  ])("detects markerless dev-server shapes (%s)", (msg) => {
    expect(isNextLog([msg])).toBe(true);
  });

  it("returns false for plain application logs", () => {
    expect(isNextLog(["hello world"])).toBe(false);
    expect(isNextLog(["- Local: http://localhost:3000"])).toBe(false);
  });

  it("returns false for falsy-but-present values", () => {
    expect(isNextLog([0])).toBe(false);
    expect(isNextLog([false])).toBe(false);
  });
});

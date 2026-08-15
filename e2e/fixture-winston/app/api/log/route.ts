import { NextResponse } from "next/server";

/**
 * Emits deterministic console lines that the e2e driver looks for in the
 * server's JSON output (LOG_FORMAT=json is set by the driver).
 *
 * - `E2E_CONSOLE_TEST` (log)   → proves console.* is patched (stdout).
 * - `E2E_CONSOLE_WARN` (warn)  → proves console.* is patched (stderr; level ≤ 1).
 * - `E2E_DEBUG_TEST` (debug)   → only visible at level ≥ 4, proving the
 *                                configured level from next.config is applied.
 *
 * Next's OWN logger patch is verified separately via the server's startup
 * output (it shares Next's real module instance, unlike a manual import here,
 * which Turbopack isolates into a separate bundle instance).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  console.log("E2E_CONSOLE_TEST");
  console.warn("E2E_CONSOLE_WARN");
  console.debug("E2E_DEBUG_TEST");
  // A Next.js-style marker-prefixed line — verifies the classifier tags these
  // as 'next.js' (the real startup banner prints before register() runs, so it
  // can't be asserted deterministically; this exercises the same code path).
  console.log("▲ E2E_NEXT_STYLE");
  return NextResponse.json({ ok: true });
}


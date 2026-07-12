import { NextResponse } from "next/server";

/**
 * API route — same console patch applies. Every `console.*` call flows through
 * the single consola sink.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("API /api/hello hit");
  console.info("returning JSON response");
  return NextResponse.json({ message: "hello", time: Date.now() });
}

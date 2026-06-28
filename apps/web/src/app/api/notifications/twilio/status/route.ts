/**
 * Milestone 3: Twilio status webhook (stub).
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  void request;
  if (!process.env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 501 });
  }
  return NextResponse.json({ ok: true, status: "not_implemented" });
}

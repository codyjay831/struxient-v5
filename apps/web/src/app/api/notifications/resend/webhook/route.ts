/**
 * Milestone 2: Resend webhook ingestion (stub — implement after Standard Acceptance is live).
 */
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 501 });
  }

  // Verify Svix/Resend signature, dedupe by provider event ID, map to QuoteSignatureEvent.
  void request;
  return NextResponse.json({ ok: true, status: "not_implemented" });
}

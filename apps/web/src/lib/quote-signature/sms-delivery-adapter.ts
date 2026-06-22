/**
 * Milestone 3: Twilio SMS delivery adapter shell.
 */
import type { SignatureEmailDeliveryInput, SignatureEmailDeliveryResult } from "../delivery-service";

export type SmsDeliveryInput = SignatureEmailDeliveryInput & {
  recipientPhone: string;
  smsConsentAt: Date;
};

export type SmsDeliveryResult =
  | { ok: true; providerMessageId: string | null; status: "queued" | "sent" }
  | { ok: false; reason: "not_configured" | "opted_out" | "send_failed"; errorMessage: string };

export async function sendSignatureSms(_input: SmsDeliveryInput): Promise<SmsDeliveryResult> {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    return { ok: false, reason: "not_configured", errorMessage: "SMS is not configured." };
  }
  return { ok: false, reason: "not_configured", errorMessage: "SMS delivery is not enabled yet." };
}

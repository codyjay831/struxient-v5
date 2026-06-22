import { sendStandardAcceptanceQuote, type StandardAcceptanceSendOptions } from "@/lib/quote-signature/request-service";
import { buildSignerUrl } from "@/lib/quote-signature/recipient-token-service";

export interface QuoteSendOptions {
  expiresInDays?: number | null;
  recipients?: { email: string; name?: string }[];
  customMessage?: string;
}

export type QuoteSendOutcome = "sent" | "delivery_failed" | "ready_to_send" | "not_ready";

export interface QuoteSendResult {
  ok: boolean;
  error?: string;
  outcome?: QuoteSendOutcome;
  message?: string;
  signatureRequestId?: string;
  deliveryWarnings?: string[];
  signerUrls?: string[];
}

/**
 * Main use case for sending a quote via Standard Acceptance.
 */
export async function sendQuote(
  quoteId: string,
  options: QuoteSendOptions = {},
): Promise<QuoteSendResult> {
  const result = await sendStandardAcceptanceQuote(quoteId, options as StandardAcceptanceSendOptions);
  return {
    ok: result.ok,
    error: result.error,
    outcome: result.outcome,
    message: result.message,
    signatureRequestId: result.signatureRequestId,
    deliveryWarnings: result.deliveryWarnings,
    signerUrls: result.recipientTokens?.map((r) => buildSignerUrl(r.rawToken)),
  };
}

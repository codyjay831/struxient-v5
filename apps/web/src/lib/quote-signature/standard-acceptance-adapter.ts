import { QuoteSignatureMode, SignatureProvider } from "@prisma/client";
import type {
  CreateSignatureRequestInput,
  SignatureProviderAdapter,
  SignatureRequestResult,
  SignatureStatus,
} from "./provider-adapter";
import { sendStandardAcceptanceQuote } from "./request-service";

export class StruxientStandardAdapter implements SignatureProviderAdapter {
  async createSignatureRequest(
    input: CreateSignatureRequestInput,
  ): Promise<SignatureRequestResult> {
    const result = await sendStandardAcceptanceQuote(input.quoteId, {
      recipients: input.recipients.map((r) => ({ email: r.email, name: r.name })),
      customMessage: input.customMessage,
      expiresInDays: input.expiresInDays,
      resendExisting: input.resendExisting,
    });
    if (!result.ok || !result.signatureRequestId) {
      throw new Error(result.error ?? "Failed to create signature request.");
    }
    return {
      signatureRequestId: result.signatureRequestId,
      recipientTokens: result.recipientTokens ?? [],
    };
  }

  async resend(requestId: string): Promise<void> {
    const { resendSignatureRequest } = await import("./request-service");
    const result = await resendSignatureRequest(requestId);
    if (!result.ok) throw new Error(result.error ?? "Resend failed.");
  }

  async void(requestId: string, reason?: string): Promise<void> {
    const { revokeSignatureRequest } = await import("./request-service");
    const result = await revokeSignatureRequest(requestId, reason);
    if (!result.ok) throw new Error(result.error ?? "Revoke failed.");
  }

  async getStatus(requestId: string): Promise<SignatureStatus> {
    const { db } = await import("@/lib/db");
    const request = await db.quoteSignatureRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!request) throw new Error("Signature request not found.");
    return { requestId: request.id, status: request.status };
  }
}

export function getSignatureProviderAdapter(
  mode: QuoteSignatureMode,
): SignatureProviderAdapter {
  if (mode === QuoteSignatureMode.VERIFIED_ESIGN) {
    throw new Error("Verified E-Sign is not enabled yet.");
  }
  return new StruxientStandardAdapter();
}

export function defaultSignatureMode(): QuoteSignatureMode {
  return QuoteSignatureMode.STANDARD_ACCEPTANCE;
}

export function defaultSignatureProvider(): SignatureProvider {
  return SignatureProvider.STRUXIENT;
}

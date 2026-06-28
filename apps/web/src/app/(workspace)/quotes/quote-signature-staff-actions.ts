"use server";

import { revalidatePath } from "next/cache";
import {
  getCommercialMutationContextOrThrow as getCommercialRequestContextOrThrow,
} from "@/lib/auth-context";
import {
  recordManualSignerLinkDelivery,
  recordSignerLinkCopied,
  resendSignatureRequest,
  revokeSignatureRequest,
} from "@/lib/quote-signature/request-service";
import { buildSignerUrl } from "@/lib/quote-signature/recipient-token-service";
import {
  denyUnlessCanCopySignerLink,
  denyUnlessCanResendQuoteSignature,
  denyUnlessCanRevokeQuoteSignature,
} from "@/lib/quote-signature/permissions";

export type SignatureStaffActionState = {
  ok?: boolean;
  error?: string;
  signerUrl?: string;
};

export async function resendSignatureRequestAction(
  signatureRequestId: string,
): Promise<SignatureStaffActionState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const denied = denyUnlessCanResendQuoteSignature(ctx.role);
  if (denied) return { error: denied };

  const result = await resendSignatureRequest(signatureRequestId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/quotes");
  revalidatePath("/workstation");
  return { ok: true };
}

export async function revokeSignatureRequestAction(
  signatureRequestId: string,
  reason?: string,
): Promise<SignatureStaffActionState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const denied = denyUnlessCanRevokeQuoteSignature(ctx.role);
  if (denied) return { error: denied };

  const result = await revokeSignatureRequest(signatureRequestId, reason);
  if (!result.ok) return { error: result.error };
  revalidatePath("/quotes");
  revalidatePath("/workstation");
  return { ok: true };
}

export async function copySignerLinkAction(
  signatureRequestId: string,
  recipientId: string,
): Promise<SignatureStaffActionState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const denied = denyUnlessCanCopySignerLink(ctx.role);
  if (denied) return { error: denied };

  const result = await recordSignerLinkCopied(signatureRequestId, recipientId);
  if (!result.ok || !result.rawToken) return { error: result.error ?? "Failed to copy link." };
  return { ok: true, signerUrl: buildSignerUrl(result.rawToken) };
}

export async function confirmManualSignerDeliveryAction(
  signatureRequestId: string,
  recipientId: string,
): Promise<SignatureStaffActionState> {
  const ctx = await getCommercialRequestContextOrThrow();
  const denied = denyUnlessCanCopySignerLink(ctx.role);
  if (denied) return { error: denied };

  const result = await recordManualSignerLinkDelivery(signatureRequestId, recipientId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/quotes");
  revalidatePath("/workstation");
  return { ok: true };
}

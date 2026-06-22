import { db } from "@/lib/db";
import {
  createPublicAccessToken,
  hashPublicAccessToken,
} from "@/lib/public-access/public-token-crypto";
import type { QuoteSignatureRecipient } from "@prisma/client";

export function createSignerTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = createPublicAccessToken();
  return { rawToken, tokenHash: hashPublicAccessToken(rawToken) };
}

export function hashSignerToken(rawToken: string): string {
  return hashPublicAccessToken(rawToken);
}

export async function resolveQuoteSignatureRecipient(
  rawToken: string,
): Promise<(QuoteSignatureRecipient & { signatureRequest: { id: string; quoteId: string; organizationId: string; status: string; expiresAt: Date | null; revokedAt: Date | null; acceptedAt: Date | null } }) | null> {
  const tokenHash = hashPublicAccessToken(rawToken);
  return db.quoteSignatureRecipient.findFirst({
    where: {
      OR: [{ tokenHash }, { tokenHash: rawToken }],
    },
    include: {
      signatureRequest: {
        select: {
          id: true,
          quoteId: true,
          organizationId: true,
          status: true,
          expiresAt: true,
          revokedAt: true,
          acceptedAt: true,
        },
      },
    },
  });
}

export function buildSignerUrl(rawToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/q/sign/${rawToken}`;
}

export function isRecipientTokenValid(recipient: {
  status?: string;
  tokenExpiresAt: Date | null;
  tokenRevokedAt: Date | null;
  signatureRequest: { expiresAt: Date | null; revokedAt: Date | null; acceptedAt: Date | null };
}): { ok: true } | { ok: false; reason: "expired" | "revoked" | "accepted" } {
  const now = new Date();
  // Post-accept tokens are revoked intentionally; treat as idempotent accept, not invalid link.
  if (recipient.signatureRequest.acceptedAt || recipient.status === "ACCEPTED") {
    return { ok: false, reason: "accepted" };
  }
  if (recipient.tokenRevokedAt || recipient.signatureRequest.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  const expiresAt = recipient.tokenExpiresAt ?? recipient.signatureRequest.expiresAt;
  if (expiresAt && expiresAt < now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

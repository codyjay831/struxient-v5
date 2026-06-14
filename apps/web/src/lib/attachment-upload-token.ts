import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV !== "production") {
    return "dev-attachment-upload-token-secret-min-32-chars";
  }
  throw new Error("AUTH_SECRET is required for attachment upload tokens.");
}

function signPayload(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

/**
 * Binds a public-intake PENDING attachment to the uploader's IP so other
 * submitters cannot claim orphan attachment rows from the same org.
 */
export function createPublicAttachmentUploadToken(params: {
  attachmentId: string;
  organizationId: string;
  clientIp: string;
}): string {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = [
    params.attachmentId,
    params.organizationId,
    params.clientIp,
    String(expiresAt),
    nonce,
  ].join("|");
  return `${payload}.${signPayload(payload)}`;
}

export function verifyPublicAttachmentUploadToken(params: {
  token: string;
  attachmentId: string;
  organizationId: string;
  clientIp: string;
}): boolean {
  const dot = params.token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = params.token.slice(0, dot);
  const signature = params.token.slice(dot + 1);
  const expected = signPayload(payload);

  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }
  } catch {
    return false;
  }

  const [attachmentId, organizationId, clientIp, expiresAtRaw] = payload.split("|");
  if (
    attachmentId !== params.attachmentId ||
    organizationId !== params.organizationId ||
    clientIp !== params.clientIp
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  return true;
}

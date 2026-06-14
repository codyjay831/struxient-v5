import { createHash, randomBytes } from "crypto";

export function createPublicAccessToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPublicAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}


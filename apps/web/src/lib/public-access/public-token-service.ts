import { db } from "@/lib/db";
import { hashPublicAccessToken } from "./public-token-crypto";

export async function resolveQuoteShareToken(token: string) {
  const tokenHash = hashPublicAccessToken(token);
  return db.quoteShareToken.findFirst({
    where: {
      OR: [{ token: tokenHash }, { token }],
    },
  });
}

export async function resolveChangeOrderShareToken(token: string) {
  const tokenHash = hashPublicAccessToken(token);
  return db.changeOrderShareToken.findFirst({
    where: {
      OR: [{ token: tokenHash }, { token }],
    },
  });
}


import type { PlatformAccess, PlatformRole } from "@prisma/client";
import { db } from "@/lib/db";

export type ActivePlatformAccess = {
  id: string;
  userId: string;
  role: PlatformRole;
};

export async function evaluatePlatformAccess(
  userId: string,
): Promise<ActivePlatformAccess | null> {
  const access = await db.platformAccess.findFirst({
    where: {
      userId,
      revokedAt: null,
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  return access;
}

export function isRevokedAccess(access: Pick<PlatformAccess, "revokedAt"> | null): boolean {
  return !access || access.revokedAt != null;
}

import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { evaluatePlatformAccess } from "./platform-auth";
import { logPlatformAccessDenial } from "./platform-audit";
import type { PlatformContext } from "./platform-types";

export { PlatformAccessDeniedError } from "./platform-errors";

function resolveRequestId(headerList: Headers): string {
  return headerList.get("x-request-id")?.trim() || crypto.randomUUID();
}

async function resolvePlatformContextUncached(): Promise<PlatformContext> {
  const headerList = await headers();
  const requestId = resolveRequestId(headerList);
  const path = headerList.get("x-pathname") ?? headerList.get("next-url") ?? undefined;

  const session = await auth();

  if (!session?.user?.id) {
    logPlatformAccessDenial({
      cause: "missing_session",
      path,
      requestId,
    });
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });

  if (!user) {
    logPlatformAccessDenial({
      cause: "missing_session",
      userId: session.user.id,
      path,
      requestId,
    });
    redirect("/login");
  }

  const access = await evaluatePlatformAccess(user.id);

  if (!access) {
    const revoked = await db.platformAccess.findUnique({
      where: { userId: user.id },
      select: { revokedAt: true },
    });

    logPlatformAccessDenial({
      cause: revoked?.revokedAt ? "revoked_grant" : "missing_grant",
      userId: user.id,
      path,
      requestId,
    });
    forbidden();
  }

  return {
    userId: user.id,
    userEmail: user.email,
    platformAccessId: access.id,
    role: access.role,
    authSource: "session",
    requestId,
  };
}

export const getPlatformContext = cache(resolvePlatformContextUncached);

export async function requirePlatformContext(): Promise<PlatformContext> {
  return getPlatformContext();
}

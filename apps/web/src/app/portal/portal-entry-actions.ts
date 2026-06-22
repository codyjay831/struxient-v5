"use server";

import { redirect } from "next/navigation";
import { verifyPortalMagicLinkAndStartSession } from "@/lib/customer-portal/verify-service";

export async function openPortalFromMagicLinkAction(token: string) {
  const result = await verifyPortalMagicLinkAndStartSession(token);
  if (!result.ok) {
    redirect(`/portal/${token}?error=invalid`);
  }
  redirect(`/portal/project/${result.accessId}`);
}

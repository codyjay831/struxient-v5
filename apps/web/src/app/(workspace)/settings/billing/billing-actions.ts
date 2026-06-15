"use server";

import { redirect } from "next/navigation";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { createBillingPortalSession } from "@/lib/billing/billing-portal";
import { isStripeBillingEnabled } from "@/lib/billing/billing-config";

export type BillingSettingsActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function openBillingPortalAction(): Promise<BillingSettingsActionResult> {
  if (!isStripeBillingEnabled()) {
    return { ok: false, error: "Billing is not configured in this environment." };
  }

  const ctx = await getSettingsRequestContextOrThrow();

  try {
    const { url } = await createBillingPortalSession({
      organizationId: ctx.organizationId,
      returnPath: "/settings/billing",
    });
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not open billing portal.",
    };
  }
}

export async function redirectToBillingPortalAction() {
  const result = await openBillingPortalAction();
  if (!result.ok) {
    redirect(`/settings/billing?error=${encodeURIComponent(result.error)}`);
  }
  redirect(result.url);
}

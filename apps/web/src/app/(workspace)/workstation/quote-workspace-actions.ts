"use server";

/**
 * Workstation-safe quote actions: same commercial rules as `quote-form-actions`
 * send/approve flows, but return `{ success: true }` instead of `redirect()` so
 * the Workstation drawer can stay open. Full quote pages keep using
 * `recordQuoteSendCheckpointAction` / `markQuoteApprovedAction`.
 */

import { revalidatePath } from "next/cache";
import {
  performQuoteMarkApproved,
  performQuoteSendCheckpoint,
} from "@/app/(workspace)/quotes/quote-form-actions";

export type QuoteWorkspaceActionState = {
  error?: string;
  success?: boolean;
};

function revalidateQuoteCommercialSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
  revalidatePath("/leads");
}

/**
 * Records SEND checkpoint and sets quote → SENT. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function sendQuoteWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const result = await performQuoteSendCheckpoint(quoteId);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

/**
 * Records APPROVAL checkpoint and sets quote → APPROVED. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function approveQuoteWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const result = await performQuoteMarkApproved(quoteId);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

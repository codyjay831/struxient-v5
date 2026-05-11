"use server";

/**
 * Workstation-safe quote actions: same commercial rules as `quote-form-actions`
 * send/approve/line-item flows, but return structured `{ success } | { error }`
 * state instead of `redirect()` so the Quotes popup, Workstation drawer, and
 * Sales Intake Quote tab can stay open after a mutation. Full quote pages still use
 * the redirecting form variants when convenient.
 */

import { revalidatePath } from "next/cache";
import {
  performAddQuoteLineItem,
  performApplyLineItemTemplateToQuote,
  performDeleteQuoteLineItem,
  performQuoteMarkApproved,
  performQuoteSendCheckpoint,
  performUpdateQuoteLineItem,
} from "@/app/(workspace)/quotes/quote-form-actions";
import { parseQuoteLineFormDataInput } from "@/lib/quote-line-form-input";

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
  revalidatePath("/sales");
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

/**
 * Adds a draft-quote line item. Org-scoped, validated, no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function addQuoteLineItemWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const id = quoteId.trim();
  if (!id) {
    return { success: false, error: "Missing quote record id." };
  }
  const parsed = parseQuoteLineFormDataInput(formData);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }
  const result = await performAddQuoteLineItem(id, parsed.input);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(id);
  return { success: true };
}

/**
 * Updates a draft-quote line item. Org-scoped, validated, no redirect.
 * Bind `quoteId, lineItemId` before passing to `useActionState`.
 */
export async function updateQuoteLineItemWorkspaceAction(
  quoteId: string,
  lineItemId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { success: false, error: "Missing quote or line item id." };
  }
  const parsed = parseQuoteLineFormDataInput(formData);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }
  const result = await performUpdateQuoteLineItem(qid, lid, parsed.input);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(qid);
  return { success: true };
}

/**
 * Deletes a draft-quote line item. Org-scoped, no redirect.
 * Bind `quoteId, lineItemId` before passing to `useActionState`.
 */
export async function deleteQuoteLineItemWorkspaceAction(
  quoteId: string,
  lineItemId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { success: false, error: "Missing quote or line item id." };
  }
  const result = await performDeleteQuoteLineItem(qid, lid);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(qid);
  return { success: true };
}

/**
 * Applies a Scope Library template to a draft quote — copies commercial
 * fields onto a new line item plus any default execution tasks. Org-scoped,
 * no redirect.
 *
 * Bind `quoteId, templateId` before passing to `useActionState`.
 */
export async function applyLineItemTemplateToQuoteWorkspaceAction(
  quoteId: string,
  templateId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const qid = quoteId.trim();
  const tid = templateId.trim();
  if (!qid || !tid) {
    return { success: false, error: "Missing quote or template id." };
  }
  const result = await performApplyLineItemTemplateToQuote(qid, tid);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(qid);
  return { success: true };
}

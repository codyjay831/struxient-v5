"use server";

/**
 * Workstation-safe quote actions: same commercial rules as `quote-form-actions`
 * send/approve/line-item flows, but return structured `{ success } | { error }`
 * state instead of `redirect()` so the Quotes popup, Workstation drawer, and
 * Lead Quote tab can stay open after a mutation. Full quote pages still use
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
  performUpdateDraftQuoteDetails,
  performCopyLeadToQuoteNotes,
  performReviseQuoteByClone,
} from "@/app/(workspace)/quotes/quote-form-actions";
import {
  addPaymentScheduleItemAction,
  updatePaymentScheduleItemAction,
  deletePaymentScheduleItemAction,
  reorderPaymentScheduleItemsAction,
} from "@/app/(workspace)/quotes/quote-payment-schedule-actions";
import { parseQuoteLineFormDataInput } from "@/lib/quote-line-form-input";
import {
  QUOTE_FIELD_LIMITS,
} from "@/app/(workspace)/quotes/quote-field-limits";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { randomBytes } from "crypto";
import { addDays } from "date-fns";
import { notifyQuoteSent } from "@/lib/notifications";

export type QuoteWorkspaceActionState = {
  error?: string;
  success?: boolean;
  revisedQuoteId?: string;
  sendOutcome?: "sent" | "delivery_failed" | "ready_to_send" | "not_ready";
  sendMessage?: string;
  deliveryWarnings?: string[];
  signerUrls?: string[];
};

function revalidateQuoteCommercialSurfaces(quoteId: string) {
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
  revalidatePath("/leads");
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): QuoteWorkspaceActionState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/**
 * Updates draft quote details. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function updateDraftQuoteDetailsWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const id = quoteId.trim();
  if (!id) {
    return { success: false, error: "Missing quote record id." };
  }

  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { success: false, error: "Workspace title is required." };
  }
  const titleErr = enforceMaxLength("Workspace title", title, QUOTE_FIELD_LIMITS.title);
  if (titleErr) {
    return { success: false, error: titleErr.error };
  }

  const internalNotes = trimOrNull(formData.get("internalNotes"));
  if (internalNotes) {
    const notesErr = enforceMaxLength(
      "Internal notes",
      internalNotes,
      QUOTE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return { success: false, error: notesErr.error };
    }
  }

  const customerDocumentTitle = trimOrNull(formData.get("customerDocumentTitle"));
  if (customerDocumentTitle) {
    const docTitleErr = enforceMaxLength(
      "Customer proposal document title",
      customerDocumentTitle,
      QUOTE_FIELD_LIMITS.customerDocumentTitle,
    );
    if (docTitleErr) {
      return { success: false, error: docTitleErr.error };
    }
  }

  const result = await performUpdateDraftQuoteDetails(id, {
    title,
    internalNotes,
    customerDocumentTitle,
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidateQuoteCommercialSurfaces(id);
  return { success: true };
}

/**
 * Copies lead notes to quote notes. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function copyLeadToQuoteNotesWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const id = quoteId.trim();
  if (!id) {
    return { success: false, error: "Missing quote record id." };
  }

  const result = await performCopyLeadToQuoteNotes(id);
  if (!result.ok) {
    return { success: false, error: result.error };
  }

  revalidateQuoteCommercialSurfaces(id);
  return { success: true };
}

/**
 * Records SEND checkpoint and sets quote → SENT. Emails the customer with proposal link.
 * Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function sendQuoteWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const expiresInDaysStr = formData.get("expiresInDays") as string | null;
  let expiresInDays: number | null = null;

  if (expiresInDaysStr && expiresInDaysStr !== "never") {
    const parsed = parseInt(expiresInDaysStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      expiresInDays = parsed;
    }
  }

  const recipientsJson = formData.get("recipients") as string | null;
  let recipients: { email: string; name?: string }[] | undefined = undefined;
  if (recipientsJson) {
    try {
      recipients = JSON.parse(recipientsJson);
    } catch {
      return { success: false, error: "Invalid recipients format." };
    }
  }

  if (recipients && recipients.length === 0) {
    return { success: false, error: "At least one recipient is required." };
  }

  // Server-side email validation
  if (recipients) {
    for (const r of recipients) {
      if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        return { success: false, error: `Invalid email address: ${r.email}` };
      }
    }
  }

  const customMessage = trimOrNull(formData.get("customMessage")) ?? undefined;

  const result = await performQuoteSendCheckpoint(quoteId, {
    expiresInDays,
    recipients,
    customMessage,
  });
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return {
    success: true,
    sendOutcome: result.outcome,
    sendMessage: result.message,
    deliveryWarnings: result.deliveryWarnings,
    signerUrls: result.signerUrls,
  };
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
 * Creates a new DRAFT revision from a pre-activation SENT/APPROVED quote.
 */
export async function reviseQuoteByCloneWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState & { revisedQuoteId?: string }> {
  void _formData;
  const result = await performReviseQuoteByClone(quoteId);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  revalidateQuoteCommercialSurfaces(result.revisedQuoteId);
  return { success: true, revisedQuoteId: result.revisedQuoteId };
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

/**
 * Revokes a quote share token. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function revokeQuoteShareTokenAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  void _formData;
  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const updated = await db.quoteShareToken.updateMany({
      where: {
        quoteId,
        organizationId: ctx.organizationId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return { success: false, error: "No share token found for this quote." };
    }

    revalidateQuoteCommercialSurfaces(quoteId);
    return { success: true };
  } catch (error) {
    console.error("[revokeQuoteShareTokenAction] Error:", error);
    return { success: false, error: "Failed to revoke token." };
  }
}

/**
 * Extends or rotates a quote share token. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function extendQuoteShareTokenAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const ctx = await getCommercialRequestContextOrThrow();
  
  const expiresInDaysStr = formData.get("expiresInDays") as string | null;
  const rotateToken = formData.get("rotateToken") === "true";
  
  let expiresInDays: number | null = null;
  if (expiresInDaysStr && expiresInDaysStr !== "never") {
    const parsed = parseInt(expiresInDaysStr, 10);
    if (!isNaN(parsed) && parsed > 0) {
      expiresInDays = parsed;
    }
  }

  try {
    const existingToken = await db.quoteShareToken.findFirst({
      where: {
        quoteId,
        organizationId: ctx.organizationId,
      },
      include: {
        quote: {
          select: {
            customer: { select: { displayName: true, email: true } },
            lead: { select: { contactName: true, email: true } },
          },
        },
      },
    });

    if (!existingToken) {
      return { success: false, error: "No share token found for this quote." };
    }

    const now = new Date();
    const expiresAt = expiresInDays ? addDays(now, expiresInDays) : null;
    const newToken = rotateToken ? randomBytes(32).toString("hex") : existingToken.token;

    await db.quoteShareToken.update({
      where: { id: existingToken.id },
      data: {
        token: newToken,
        expiresAt,
        revokedAt: null,
      },
    });

    // Send email if rotating token
    if (rotateToken) {
      const customerEmail = existingToken.quote.customer?.email || existingToken.quote.lead?.email;
      const customerName = existingToken.quote.customer?.displayName || existingToken.quote.lead?.contactName || "Customer";

      if (customerEmail) {
        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/q/${newToken}`;
        void notifyQuoteSent({
          organizationId: ctx.organizationId,
          quoteId,
          recipients: [{ email: customerEmail, name: customerName }],
          organizationDisplayName: ctx.organizationName,
          shareUrl,
          expiresAt,
        });
      }
    }

    revalidateQuoteCommercialSurfaces(quoteId);
    return { success: true };
  } catch (error) {
    console.error("[extendQuoteShareTokenAction] Error:", error);
    return { success: false, error: "Failed to extend token." };
  }
}

/**
 * Adds a payment schedule item. Org-scoped; no redirect.
 * Bind `quoteId` before passing to `useActionState`.
 */
export async function addPaymentScheduleItemWorkspaceAction(
  quoteId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const result = await addPaymentScheduleItemAction(quoteId, {}, formData);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

/**
 * Updates a payment schedule item. Org-scoped; no redirect.
 * Bind `quoteId, itemId` before passing to `useActionState`.
 */
export async function updatePaymentScheduleItemWorkspaceAction(
  quoteId: string,
  itemId: string,
  _prevState: QuoteWorkspaceActionState,
  formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const result = await updatePaymentScheduleItemAction(quoteId, itemId, {}, formData);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

/**
 * Deletes a payment schedule item. Org-scoped; no redirect.
 * Bind `quoteId, itemId` before passing to `useActionState`.
 */
export async function deletePaymentScheduleItemWorkspaceAction(
  quoteId: string,
  itemId: string,
  _prevState: QuoteWorkspaceActionState,
  _formData: FormData,
): Promise<QuoteWorkspaceActionState> {
  const result = await deletePaymentScheduleItemAction(quoteId, itemId, {}, _formData);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

/**
 * Reorders payment schedule items. Org-scoped; no redirect.
 */
export async function reorderPaymentScheduleItemsWorkspaceAction(
  quoteId: string,
  itemIds: string[],
): Promise<QuoteWorkspaceActionState> {
  const result = await reorderPaymentScheduleItemsAction(quoteId, itemIds);
  if (result.error) {
    return { success: false, error: result.error };
  }
  revalidateQuoteCommercialSurfaces(quoteId);
  return { success: true };
}

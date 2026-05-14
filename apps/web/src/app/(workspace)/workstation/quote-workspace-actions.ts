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
} from "@/app/(workspace)/quotes/quote-form-actions";
import { parseQuoteLineFormDataInput } from "@/lib/quote-line-form-input";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { randomBytes } from "crypto";
import { addDays } from "date-fns";
import { notifyQuoteSent } from "@/lib/notifications";

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

  const result = await performQuoteSendCheckpoint(quoteId, { expiresInDays });
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
  const ctx = await getRequestContextOrThrow();

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
  const ctx = await getRequestContextOrThrow();
  
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
          customerEmail,
          customerName,
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

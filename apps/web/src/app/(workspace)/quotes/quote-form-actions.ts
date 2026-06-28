"use server";

import { Prisma, QuoteStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePositiveQuantityString, parseUsdStringToCents } from "@/lib/quote-money";
import {
  parseQuoteLineFormDataInput,
  type ParsedQuoteLineInput as ParsedQuoteLineInputLib,
} from "@/lib/quote-line-form-input";
import { db } from "@/lib/db";
import {
  getCommercialMutationContextOrThrow as getCommercialRequestContextOrThrow,
} from "@/lib/auth-context";
import { promoteLeadToQuote } from "@/lib/lead/promote-to-quote";
import type { QuoteRollupTx } from "@/lib/quote-line-item-template-apply-tx";
import {
  performApplyLineItemTemplateToQuoteTx,
  recalculateQuoteRollupsInTx,
} from "@/lib/quote-line-item-template-apply-tx";

import {
  QUOTE_FIELD_LIMITS,
  QUOTE_LINE_FIELD_LIMITS,
  QUOTE_PROPOSAL_FIELD_LIMITS,
} from "./quote-field-limits";

export type QuoteFormState = {
  error?: string;
};

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): QuoteFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

function parseOptionalProposalString(
  formData: FormData,
  fieldName: string,
  label: string,
  max: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = trimOrNull(formData.get(fieldName));
  if (!v) {
    return { ok: true, value: null };
  }
  if (v.length > max) {
    return { ok: false, error: `${label} is too long (max ${max} characters).` };
  }
  return { ok: true, value: v };
}

type TemplateDefaultProposalFields = {
  defaultCustomerScopeTitle: string | null;
  defaultCustomerScopeDescription: string | null;
  defaultCustomerIncludedNotes: string | null;
  defaultCustomerExcludedNotes: string | null;
  defaultCustomerPresentationGroup: string | null;
};

function parseTemplateDefaultProposalFieldsFromForm(
  formData: FormData,
): { ok: true; data: TemplateDefaultProposalFields } | { ok: false; error: string } {
  const title = parseOptionalProposalString(
    formData,
    "defaultCustomerScopeTitle",
    "Preset proposal scope title",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeTitle,
  );
  if (!title.ok) {
    return { ok: false, error: title.error };
  }
  const desc = parseOptionalProposalString(
    formData,
    "defaultCustomerScopeDescription",
    "Preset proposal scope description",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeDescription,
  );
  if (!desc.ok) {
    return { ok: false, error: desc.error };
  }
  const inc = parseOptionalProposalString(
    formData,
    "defaultCustomerIncludedNotes",
    "Preset included notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerIncludedNotes,
  );
  if (!inc.ok) {
    return { ok: false, error: inc.error };
  }
  const exc = parseOptionalProposalString(
    formData,
    "defaultCustomerExcludedNotes",
    "Preset excluded notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerExcludedNotes,
  );
  if (!exc.ok) {
    return { ok: false, error: exc.error };
  }
  const grp = parseOptionalProposalString(
    formData,
    "defaultCustomerPresentationGroup",
    "Preset presentation group",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerPresentationGroup,
  );
  if (!grp.ok) {
    return { ok: false, error: grp.error };
  }
  return {
    ok: true,
    data: {
      defaultCustomerScopeTitle: title.value,
      defaultCustomerScopeDescription: desc.value,
      defaultCustomerIncludedNotes: inc.value,
      defaultCustomerExcludedNotes: exc.value,
      defaultCustomerPresentationGroup: grp.value,
    },
  };
}

/** Parsed fields shared by create / update line preset (library or quote-bound flows). */
type LineItemTemplateParsedUpsert = {
  description: string;
  defaultQuantity: Prisma.Decimal;
  defaultUnitAmountCents: number;
  defaultInternalNotes: string | null;
  tags: string[];
  priceBufferPercentage: number;
} & TemplateDefaultProposalFields;

/**
 * Validates preset form fields for create/update. Returns `{ data }` on success or `{ error }`.
 */
function parseLineItemTemplateUpsertForm(
  formData: FormData,
): QuoteFormState | { data: LineItemTemplateParsedUpsert } {
  const description = trimRequired(formData.get("description"));
  if (!description) {
    return { error: "Internal preset description is required." };
  }
  const descErr = enforceMaxLength(
    "Internal preset description",
    description,
    QUOTE_LINE_FIELD_LIMITS.description,
  );
  if (descErr) {
    return descErr;
  }

  const quantityRaw = trimRequired(formData.get("quantity"));
  const qtyParsed = parsePositiveQuantityString(quantityRaw);
  if (!qtyParsed.ok) {
    return { error: qtyParsed.error };
  }

  const unitRaw = trimRequired(formData.get("unitAmountDollars"));
  const unitParsed = parseUsdStringToCents(unitRaw);
  if (!unitParsed.ok) {
    return { error: unitParsed.error };
  }

  const defaultInternalNotes = trimOrNull(formData.get("defaultInternalNotes"));
  if (defaultInternalNotes) {
    const notesErr = enforceMaxLength(
      "Preset internal notes",
      defaultInternalNotes,
      QUOTE_LINE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return notesErr;
    }
  }

  const templateProposalParsed = parseTemplateDefaultProposalFieldsFromForm(formData);
  if (!templateProposalParsed.ok) {
    return { error: templateProposalParsed.error };
  }

  const tagsRaw = trimRequired(formData.get("tags"));
  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const bufferRaw = trimRequired(formData.get("priceBufferPercentage"));
  const priceBufferPercentage = parseInt(bufferRaw, 10);
  if (isNaN(priceBufferPercentage) || priceBufferPercentage < 0 || priceBufferPercentage > 100) {
    return { error: "Price buffer must be a percentage between 0 and 100." };
  }

  return {
    data: {
      description,
      defaultQuantity: qtyParsed.decimal,
      defaultUnitAmountCents: unitParsed.cents,
      defaultInternalNotes,
      tags,
      priceBufferPercentage,
      ...templateProposalParsed.data,
    },
  };
}

function defaultTitleFromContext(params: {
  lead: { title: string } | null;
  customer: { displayName: string } | null;
}): string {
  const { lead, customer } = params;
  if (customer && lead) {
    return `Quote — ${customer.displayName}`;
  }
  if (customer) {
    return `Quote — ${customer.displayName}`;
  }
  if (lead) {
    return `Quote — ${lead.title}`;
  }
  return "";
}

/** Minimal DB surface for draft resolution + insert (plain client or interactive tx). */
type QuoteDraftDb = Pick<typeof db, "lead" | "customer" | "quote">;

type OrgScope = { id: string };

type ResolvedDraftQuoteInsert = {
  organizationId: string;
  customerId: string | null;
  leadId: string | null;
  title: string;
  internalNotes: string | null;
};

async function resolveCreateQuoteDraftFromFormFields(
  exec: QuoteDraftDb,
  org: OrgScope,
  input: {
    formLeadId: string | null;
    formCustomerId: string | null;
    /** Trimmed workspace title — empty string lets the server derive from lead/customer. */
    title: string;
    internalNotes: string | null;
  },
): Promise<{ ok: false; error: string } | { ok: true; data: ResolvedDraftQuoteInsert }> {
  const { formLeadId, formCustomerId, internalNotes } = input;
  let title = input.title;

  const lead = formLeadId
    ? await exec.lead.findFirst({
        where: { id: formLeadId, organizationId: org.id },
        select: { id: true, title: true, customerId: true },
      })
    : null;

  if (formLeadId && !lead) {
    return {
      ok: false,
      error:
        "That opportunity was not found in your organization. Remove stale context or start from Sales without a link.",
    };
  }

  const customer = formCustomerId
    ? await exec.customer.findFirst({
        where: { id: formCustomerId, organizationId: org.id },
        select: { id: true, displayName: true },
      })
    : null;

  if (formCustomerId && !customer) {
    return {
      ok: false,
      error:
        "That customer was not found in your organization. Remove stale context or start without a customer link.",
    };
  }

  if (lead && customer) {
    if (lead.customerId != null && lead.customerId !== customer.id) {
      return {
        ok: false,
        error:
          "This opportunity is linked to a different customer than the one submitted. Refresh the page and try again from the record.",
      };
    }
  }

  let resolvedLeadId: string | null = lead?.id ?? null;
  let resolvedCustomerId: string | null = null;

  if (lead && customer) {
    resolvedCustomerId = customer.id;
  } else if (lead && !customer) {
    resolvedLeadId = lead.id;
    if (lead.customerId) {
      const linkedCustomer = await exec.customer.findFirst({
        where: { id: lead.customerId, organizationId: org.id },
        select: { id: true },
      });
      resolvedCustomerId = linkedCustomer?.id ?? null;
    } else {
      resolvedCustomerId = null;
    }
  } else if (!lead && customer) {
    resolvedCustomerId = customer.id;
  }

  let customerForTitle: { displayName: string } | null = customer;
  if (!customerForTitle && resolvedCustomerId) {
    customerForTitle = await exec.customer.findFirst({
      where: { id: resolvedCustomerId, organizationId: org.id },
      select: { displayName: true },
    });
  }


  if (!title) {
    title = defaultTitleFromContext({
      lead,
      customer: customerForTitle,
    });
  }

  if (!title) {
    return {
      ok: false,
      error: "Title is required when no opportunity or customer context is attached.",
    };
  }

  return {
    ok: true,
    data: {
      organizationId: org.id,
      customerId: resolvedCustomerId,
      leadId: resolvedLeadId,
      title,
      internalNotes,
    },
  };

}

export type PerformCreateQuoteDraftFromLeadResult =
  | { ok: true; quoteId: string; reusedExisting: boolean }
  | { ok: false; error: string };

/**
 * Org-scoped draft quote creation anchored to an opportunity.
 * Now a thin wrapper around the promoteLeadToQuote use case.
 */
export async function performCreateQuoteDraftFromLead(
  leadId: string,
): Promise<PerformCreateQuoteDraftFromLeadResult> {
  const result = await promoteLeadToQuote(leadId);
  if (result.ok && result.quoteId) {
    return {
      ok: true,
      quoteId: result.quoteId,
      reusedExisting: result.reusedExisting === true,
    };
  }
  return {
    ok: false,
    error: result.error ?? "Could not start the quote.",
  };
}

/**
 * Canonical staff handoff: promote lead → quote and redirect to the quote record.
 */
export async function startQuoteFromLeadAction(leadId: string): Promise<void> {
  const result = await performCreateQuoteDraftFromLead(leadId);
  if (!result.ok) {
    throw new Error(result.error);
  }
  revalidatePath("/leads");
  revalidatePath(`/quotes/${result.quoteId}`);
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}?tab=quote`);
}

import { createQuoteDraft } from "@/lib/quote/create-draft";
import { sendQuote } from "@/lib/quote/send";
import { approveQuote } from "@/lib/quote/approve";

/**
 * Creates a DRAFT quote for the active development organization.
 * `leadId` / `customerId` in the form are untrusted—revalidated against org scope here.
 */
export async function createQuoteDraftAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const ctx = await getCommercialRequestContextOrThrow();

  const formLeadId = trimOrNull(formData.get("leadId"));
  const formCustomerId = trimOrNull(formData.get("customerId"));
  const title = trimRequired(formData.get("title"));
  const internalNotes = trimOrNull(formData.get("internalNotes"));

  const resolved = await resolveCreateQuoteDraftFromFormFields(db, { id: ctx.organizationId }, {
    formLeadId,
    formCustomerId,
    title,
    internalNotes,
  });

  if (!resolved.ok) {
    return { error: resolved.error };
  }

  if (formLeadId) {
    const promoted = await performCreateQuoteDraftFromLead(formLeadId);
    if (!promoted.ok) {
      return { error: promoted.error };
    }
    revalidatePath("/leads");
    redirect(quoteAuthoringHref({ quoteId: promoted.quoteId, leadId: formLeadId }));
  }

  const result = await createQuoteDraft({
    title: resolved.data.title,
    customerId: resolved.data.customerId,
    leadId: null,
    internalNotes: resolved.data.internalNotes,
  });

  if (!result.ok || !result.quoteId) {
    return { error: result.error };
  }

  revalidatePath("/leads");
  redirect(quoteAuthoringHref({ quoteId: result.quoteId }));
}

async function normalizeQuoteLineSortOrdersTx(tx: QuoteRollupTx, quoteId: string) {
  const lines = await tx.quoteLineItem.findMany({
    where: { quoteId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (let i = 0; i < lines.length; i++) {
    await tx.quoteLineItem.update({
      where: { id: lines[i].id },
      data: { sortOrder: i },
    });
  }
}

/**
 * Org-scoped update of draft quote details. No redirect, no revalidate.
 */
export async function performUpdateDraftQuoteDetails(
  quoteId: string,
  input: {
    title: string;
    internalNotes: string | null;
    customerDocumentTitle: string | null;
  },
): Promise<PerformQuoteLineItemResult> {
  const id = quoteId.trim();
  if (!id) {
    return { ok: false, error: "Missing quote record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
      status: QuoteStatus.DRAFT,
    },
    data: {
      title: input.title,
      internalNotes: input.internalNotes,
      customerDocumentTitle: input.customerDocumentTitle,
    },
  });

  if (result.count === 0) {
    return {
      ok: false,
      error:
        "This quote could not be updated. It may not be a draft, may be archived, missing, or outside your organization.",
    };
  }

  return { ok: true };
}

/**
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
 */
export async function updateDraftQuoteDetailsAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Workspace title is required." };
  }
  const titleErr = enforceMaxLength("Workspace title", title, QUOTE_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const internalNotes = trimOrNull(formData.get("internalNotes"));
  if (internalNotes) {
    const notesErr = enforceMaxLength(
      "Internal notes",
      internalNotes,
      QUOTE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return notesErr;
    }
  }

  const customerDocTitle = parseOptionalProposalString(
    formData,
    "customerDocumentTitle",
    "Customer proposal document title",
    QUOTE_FIELD_LIMITS.customerDocumentTitle,
  );
  if (!customerDocTitle.ok) {
    return { error: customerDocTitle.error };
  }

  const result = await performUpdateDraftQuoteDetails(id, {
    title,
    internalNotes,
    customerDocumentTitle: customerDocTitle.value,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

/**
 * Org-scoped copy of lead notes to quote notes. No redirect, no revalidate.
 */
export async function performCopyLeadToQuoteNotes(
  quoteId: string,
): Promise<PerformQuoteLineItemResult> {
  const id = quoteId.trim();
  if (!id) {
    return { ok: false, error: "Missing quote record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
        select: { internalNotes: true, lead: { select: { notes: true } } },
      });

      if (!quote) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (!quote.lead?.notes) {
        throw new Error("NO_LEAD_NOTES");
      }

      const leadNotes = quote.lead.notes;
      const existingNotes = quote.internalNotes ?? "";
      const separator = existingNotes ? "\n\nCopied from intake:\n" : "Copied from intake:\n";
      const newNotes = `${existingNotes}${separator}${leadNotes}`;

      if (newNotes.length > QUOTE_FIELD_LIMITS.internalNotes) {
        throw new Error("NOTES_TOO_LONG");
      }

      await tx.quote.update({
        where: { id },
        data: { internalNotes: newNotes },
      });
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "QUOTE_NOT_FOUND") {
        return { ok: false, error: "Quote not found or not a draft." };
      }
      if (e.message === "NO_LEAD_NOTES") {
        return { ok: false, error: "No intake notes found on the linked opportunity." };
      }
      if (e.message === "NOTES_TOO_LONG") {
        return {
          ok: false,
          error: `Resulting notes would exceed the ${QUOTE_FIELD_LIMITS.internalNotes} character limit.`,
        };
      }
    }
    throw e;
  }
}

/**
 * Appends lead notes to internal quote notes.
 * `quoteId` must be supplied via `.bind(null, quote.id)`.
 */
export async function copyLeadToQuoteNotesAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const result = await performCopyLeadToQuoteNotes(id);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  return {};
}

export type PerformQuoteLineItemResult =
  | { ok: true }
  | { ok: false; error: string };

import { performReviseQuoteByClone } from "@/lib/quote/revise-by-clone";
export type { PerformReviseQuoteResult } from "@/lib/quote/revise-by-clone";
import { opportunityWorkspaceHref, quoteAuthoringHref } from "@/lib/opportunity-tab-routing";

type ParsedQuoteLineInput = ParsedQuoteLineInputLib;

async function resolveQuoteAuthoringRedirectHref(quoteId: string): Promise<string> {
  const id = quoteId.trim();
  if (!id) return "/quotes";
  const ctx = await getCommercialRequestContextOrThrow();
  const quote = await db.quote.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { leadId: true },
  });
  return quoteAuthoringHref({ quoteId: id, leadId: quote?.leadId });
}

/**
 * Org-scoped add of a quote line item. No redirect, no revalidate — composable
 * by both the redirecting full-page action and workspace-safe wrappers used
 * inside QuoteWorkSurface popup/drawer/opportunity-tab containers.
 */
export async function performAddQuoteLineItem(
  quoteId: string,
  input: ParsedQuoteLineInput,
): Promise<PerformQuoteLineItemResult> {
  const id = quoteId.trim();
  if (!id) {
    return { ok: false, error: "Missing quote record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: QuoteStatus.DRAFT,
      },
      select: { id: true },
    });
    if (!quote) {
      return { ok: false as const };
    }

    const agg = await tx.quoteLineItem.aggregate({
      where: { quoteId: id },
      _max: { sortOrder: true },
    });
    const nextOrder = (agg._max.sortOrder ?? -1) + 1;

    await tx.quoteLineItem.create({
      data: {
        quoteId: id,
        sortOrder: nextOrder,
        description: input.description,
        customerScopeTitle: input.customerScopeTitle,
        customerScopeDescription: input.customerScopeDescription,
        customerIncludedNotes: input.customerIncludedNotes,
        customerExcludedNotes: input.customerExcludedNotes,
        customerPresentationGroup: input.customerPresentationGroup,
        quantity: input.quantity,
        unitAmountCents: input.unitAmountCents,
        lineTotalCents: input.lineTotalCents,
        internalNotes: input.internalNotes,
        sourceLineItemTemplateId: null,
      },
    });

    await recalculateQuoteRollupsInTx(tx, { quoteId: id, organizationId: ctx.organizationId });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        "This line could not be added. The quote may not be a draft, may be archived, missing, or outside your organization.",
    };
  }
  return { ok: true };
}

/**
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
 *
 * Redirecting wrapper retained for the full Quote page form pattern. New
 * workspace-safe call sites should use `addQuoteLineItemWorkspaceAction`.
 */
export async function addQuoteLineItemAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const parsed = parseQuoteLineFormDataInput(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const result = await performAddQuoteLineItem(id, parsed.input);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

/**
 * Org-scoped update of a quote line item. No redirect, no revalidate —
 * composed by both the redirecting full-page action and the workspace-safe
 * wrapper.
 */
export async function performUpdateQuoteLineItem(
  quoteId: string,
  lineItemId: string,
  input: ParsedQuoteLineInput,
): Promise<PerformQuoteLineItemResult> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { ok: false, error: "Missing quote or line item id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
        },
      },
      select: { id: true },
    });
    if (!line) {
      return { ok: false as const };
    }

    await tx.quoteLineItem.update({
      where: { id: lid },
      data: {
        description: input.description,
        customerScopeTitle: input.customerScopeTitle,
        customerScopeDescription: input.customerScopeDescription,
        customerIncludedNotes: input.customerIncludedNotes,
        customerExcludedNotes: input.customerExcludedNotes,
        customerPresentationGroup: input.customerPresentationGroup,
        quantity: input.quantity,
        unitAmountCents: input.unitAmountCents,
        lineTotalCents: input.lineTotalCents,
        internalNotes: input.internalNotes,
      },
    });

    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: ctx.organizationId });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        "This line could not be updated. It may not belong to this draft quote, the quote may be archived, or it is outside your organization.",
    };
  }
  return { ok: true };
}

/**
 * `quoteId` and `lineItemId` must be supplied via `.bind(null, quote.id, line.id)`.
 *
 * Redirecting wrapper retained for the full Quote page form pattern. New
 * workspace-safe call sites should use `updateQuoteLineItemWorkspaceAction`.
 */
export async function updateQuoteLineItemAction(
  quoteId: string,
  lineItemId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item id." };
  }

  const parsed = parseQuoteLineFormDataInput(formData);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const result = await performUpdateQuoteLineItem(qid, lid, parsed.input);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(qid));
}

/**
 * Org-scoped delete of a quote line item. No redirect, no revalidate.
 */
export async function performDeleteQuoteLineItem(
  quoteId: string,
  lineItemId: string,
): Promise<PerformQuoteLineItemResult> {
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { ok: false, error: "Missing quote or line item id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
        },
      },
      select: { id: true },
    });
    if (!line) {
      return { ok: false as const };
    }

    await tx.quoteLineItem.delete({
      where: { id: lid },
    });

    await normalizeQuoteLineSortOrdersTx(tx, qid);
    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: ctx.organizationId });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        "This line could not be removed. It may not belong to this draft quote, the quote may be archived, or it is outside your organization.",
    };
  }
  return { ok: true };
}

/**
 * `quoteId` and `lineItemId` must be supplied via `.bind(null, quote.id, line.id)`.
 *
 * Redirecting wrapper retained for the full Quote page form pattern. New
 * workspace-safe call sites should use `deleteQuoteLineItemWorkspaceAction`.
 */
export async function deleteQuoteLineItemAction(
  quoteId: string,
  lineItemId: string,
  prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void prevState;
  void formData;
  const qid = quoteId.trim();
  const lid = lineItemId.trim();
  if (!qid || !lid) {
    return { error: "Missing quote or line item id." };
  }

  const result = await performDeleteQuoteLineItem(qid, lid);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(qid));
}

/**
 * `returnQuoteId` must be supplied via `.bind(null, quote.id)` when creating from quote draft.
 */
export async function createLineItemTemplateAction(
  returnQuoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const rid = returnQuoteId.trim();
  if (!rid) {
    return { error: "Missing return quote id." };
  }

  const parsed = parseLineItemTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const { tags: tagNames, ...rest } = parsed.data;

  const quoteExists = await db.quote.findFirst({
    where: { id: rid, organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
    select: { id: true },
  });
  if (!quoteExists) {
    return {
      error:
        "That quote was not found as a draft in your organization. Open a draft quote to manage line presets.",
    };
  }

  await db.lineItemTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      ...rest,
      tags: {
        connectOrCreate: tagNames.map((name) => ({
          where: {
            organizationId_name: {
              organizationId: ctx.organizationId,
              name: name.toLowerCase(),
            },
          },
          create: {
            organizationId: ctx.organizationId,
            name: name.toLowerCase(),
            source: "USER_CREATED",
            status: "ACTIVE",
          },
        })),
      },
    },
  });

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(rid));
}

/**
 * Org-scoped preset create from Settings → Scope Library (no draft quote context).
 */
export async function createLineItemTemplateFromScopeLibraryAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const parsed = parseLineItemTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const { tags: tagNames, ...rest } = parsed.data;

  await db.lineItemTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      ...rest,
      tags: {
        connectOrCreate: tagNames.map((name) => ({
          where: {
            organizationId_name: {
              organizationId: ctx.organizationId,
              name: name.toLowerCase(),
            },
          },
          create: {
            organizationId: ctx.organizationId,
            name: name.toLowerCase(),
            source: "USER_CREATED",
            status: "ACTIVE",
          },
        })),
      },
    },
  });

  redirect("/settings/scope-library");
}

/**
 * `templateId` must be supplied via `.bind(null, template.id)`.
 */
export async function updateLineItemTemplateFromScopeLibraryAction(
  templateId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const tid = templateId.trim();
  if (!tid) {
    return { error: "Missing template id." };
  }

  const parsed = parseLineItemTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const { tags: tagNames, ...rest } = parsed.data;

  const result = await db.lineItemTemplate.update({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    data: {
      ...rest,
      tags: {
        set: [], // Clear existing relations
        connectOrCreate: tagNames.map((name) => ({
          where: {
            organizationId_name: {
              organizationId: ctx.organizationId,
              name: name.toLowerCase(),
            },
          },
          create: {
            organizationId: ctx.organizationId,
            name: name.toLowerCase(),
            source: "USER_CREATED",
            status: "ACTIVE",
          },
        })),
      },
    },
  });

  if (!result) {
    return {
      error:
        "This preset could not be updated. It may be hidden, missing, or outside your organization.",
    };
  }

  redirect("/settings/scope-library");
}

/**
 * `templateId` must be supplied via `.bind(null, template.id)`.
 */
export async function archiveLineItemTemplateFromScopeLibraryAction(
  templateId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const tid = templateId.trim();
  if (!tid) {
    return { error: "Missing template id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const result = await db.lineItemTemplate.updateMany({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    return {
      error:
        "This preset could not be hidden. It may already be hidden, missing, or outside your organization.",
    };
  }

  redirect("/settings/scope-library");
}

/**
 * `returnQuoteId` and `templateId` must be supplied via `.bind(null, quote.id, template.id)`.
 */
export async function archiveLineItemTemplateAction(
  returnQuoteId: string,
  templateId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const rid = returnQuoteId.trim();
  const tid = templateId.trim();
  if (!rid || !tid) {
    return { error: "Missing quote or template id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const quoteExists = await db.quote.findFirst({
    where: { id: rid, organizationId: ctx.organizationId, status: QuoteStatus.DRAFT },
    select: { id: true },
  });
  if (!quoteExists) {
    return {
      error:
        "That quote was not found as a draft in your organization. Open a draft quote to manage line presets.",
    };
  }

  const result = await db.lineItemTemplate.updateMany({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    return {
      error:
        "This preset could not be hidden. It may already be hidden, missing, or outside your organization.",
    };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(rid));
}

/**
 * Org-scoped apply of a Scope Library template to a draft quote. No redirect,
 * no revalidate — composed by both the redirecting full-page action and the
 * workspace-safe wrapper used inside QuoteWorkSurface popup/drawer/opportunity-tab.
 *
 * Copies the template's commercial fields onto a new quote line item, copies
 * any default execution tasks onto the new line, and recalculates quote
 * rollups. The template itself is never mutated.
 */
export async function performApplyLineItemTemplateToQuote(
  quoteId: string,
  templateId: string,
): Promise<PerformQuoteLineItemResult> {
  const qid = quoteId.trim();
  const tid = templateId.trim();
  if (!qid || !tid) {
    return { ok: false, error: "Missing quote or template id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    return await performApplyLineItemTemplateToQuoteTx(tx, qid, tid, ctx.organizationId);
  });

  if (!outcome.ok) {
    if (outcome.message) {
      return { ok: false, error: outcome.message };
    }
    return {
      ok: false,
      error:
        "This saved line item could not be copied to the quote. The quote may not be a draft, the saved line item may be hidden, or the record is outside your organization.",
    };
  }
  return { ok: true };
}

/**
 * `quoteId` and `templateId` must be supplied via `.bind(null, quote.id, template.id)`.
 * Copies commercial fields onto a new line; does not mutate the template.
 *
 * Redirecting wrapper retained for the full Quote page form pattern. New
 * workspace-safe call sites should use `applyLineItemTemplateToQuoteWorkspaceAction`.
 */
export async function applyLineItemTemplateToQuoteAction(
  quoteId: string,
  templateId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const qid = quoteId.trim();
  const tid = templateId.trim();
  if (!qid || !tid) {
    return { error: "Missing quote or template id." };
  }

  const result = await performApplyLineItemTemplateToQuote(qid, tid);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(qid));
}

/**
 * Transitions ARCHIVED → DRAFT only; does not modify lines, totals, or links.
 */
export async function restoreQuoteToDraftAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
      status: QuoteStatus.ARCHIVED,
    },
    data: { status: QuoteStatus.DRAFT },
  });

  if (result.count === 0) {
    return {
      error:
        "This quote could not be restored. It may already be a draft, missing, or outside your organization.",
    };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

export type PerformQuoteCheckpointResult = {
  error?: string;
  outcome?: "sent" | "delivery_failed" | "ready_to_send" | "not_ready";
  message?: string;
  deliveryWarnings?: string[];
  signatureRequestId?: string;
  signerUrls?: string[];
};

/**
 * Org-scoped send checkpoint + SENT transition. Used by workstation actions.
 */
export async function performQuoteSendCheckpoint(
  quoteId: string,
  options: {
    expiresInDays?: number | null;
    recipients?: { email: string; name?: string }[];
    customMessage?: string;
  } = {},
): Promise<PerformQuoteCheckpointResult> {
  const result = await sendQuote(quoteId, options);
  if (!result.ok) {
    return { error: result.error ?? "Failed to send quote.", outcome: result.outcome };
  }
  return {
    outcome: result.outcome,
    message: result.message,
    deliveryWarnings: result.deliveryWarnings,
    signatureRequestId: result.signatureRequestId,
    signerUrls: result.signerUrls,
  };
}

/**
 * Org-scoped approval checkpoint + APPROVED transition. Used by workstation actions.
 */
export async function performQuoteMarkApproved(
  quoteId: string,
): Promise<PerformQuoteCheckpointResult> {
  const result = await approveQuote(quoteId);
  if (!result.ok) {
    return { error: result.error ?? "Failed to approve quote." };
  }
  return {};
}

/**
 * Records SEND checkpoint and sets quote → SENT. Redirects on success.
 */
export async function recordQuoteSendCheckpointAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
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
    return { error: result.error };
  }

  const id = quoteId.trim();
  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

/**
 * Records APPROVAL checkpoint and sets quote → APPROVED. Redirects on success.
 */
export async function markQuoteApprovedAction(
  quoteId: string,
  _prevState: QuoteFormState,
  _formData: FormData,
): Promise<QuoteFormState> {
  void _formData;
  const result = await performQuoteMarkApproved(quoteId);
  if (result.error) {
    return { error: result.error };
  }

  const id = quoteId.trim();
  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

/**
 * Transitions a quote to ARCHIVED.
 */
export async function archiveQuoteAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
      status: { not: QuoteStatus.ARCHIVED },
    },
    data: { status: QuoteStatus.ARCHIVED },
  });

  if (result.count === 0) {
    return {
      error:
        "This quote could not be archived. It may already be archived, missing, or outside your organization.",
    };
  }

  revalidatePath(`/leads`);
  redirect(await resolveQuoteAuthoringRedirectHref(id));
}

export { performReviseQuoteByClone };

export async function reviseQuoteByCloneAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const result = await performReviseQuoteByClone(quoteId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath(`/quotes/${quoteId.trim()}`);
  revalidatePath("/leads");
  const leadRow = await db.quote.findFirst({
    where: { id: result.revisedQuoteId, organizationId: (await getCommercialRequestContextOrThrow()).organizationId },
    select: { leadId: true },
  });
  if (leadRow?.leadId) {
    redirect(opportunityWorkspaceHref(leadRow.leadId, "quote"));
  }
  redirect(await resolveQuoteAuthoringRedirectHref(result.revisedQuoteId));
}

"use server";

import {
  Prisma,
  QuoteCheckpointKind,
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  computeLineTotalCents,
  parsePositiveQuantityString,
  parseUsdStringToCents,
} from "@/lib/quote-money";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { EXECUTION_STAGE_KEYS_ORDERED } from "@/lib/execution-stage-catalog";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForCustomerProposalCheckpoint,
  serializeCustomerPreviewDocumentForCheckpoint,
} from "@/lib/quote-checkpoint-snapshot";
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

type QuoteLineProposalFields = {
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  customerPresentationGroup: string | null;
};

function parseQuoteLineProposalFieldsFromForm(
  formData: FormData,
): { ok: true; data: QuoteLineProposalFields } | { ok: false; error: string } {
  const title = parseOptionalProposalString(
    formData,
    "customerScopeTitle",
    "Proposal scope title",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeTitle,
  );
  if (!title.ok) {
    return { ok: false, error: title.error };
  }
  const desc = parseOptionalProposalString(
    formData,
    "customerScopeDescription",
    "Proposal scope description",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeDescription,
  );
  if (!desc.ok) {
    return { ok: false, error: desc.error };
  }
  const inc = parseOptionalProposalString(
    formData,
    "customerIncludedNotes",
    "Included notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerIncludedNotes,
  );
  if (!inc.ok) {
    return { ok: false, error: inc.error };
  }
  const exc = parseOptionalProposalString(
    formData,
    "customerExcludedNotes",
    "Excluded notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerExcludedNotes,
  );
  if (!exc.ok) {
    return { ok: false, error: exc.error };
  }
  const grp = parseOptionalProposalString(
    formData,
    "customerPresentationGroup",
    "Presentation group",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerPresentationGroup,
  );
  if (!grp.ok) {
    return { ok: false, error: grp.error };
  }
  return {
    ok: true,
    data: {
      customerScopeTitle: title.value,
      customerScopeDescription: desc.value,
      customerIncludedNotes: inc.value,
      customerExcludedNotes: exc.value,
      customerPresentationGroup: grp.value,
    },
  };
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

  return {
    data: {
      description,
      defaultQuantity: qtyParsed.decimal,
      defaultUnitAmountCents: unitParsed.cents,
      defaultInternalNotes,
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

/**
 * Creates a DRAFT quote for the active development organization.
 * `leadId` / `customerId` in the form are untrusted—revalidated against org scope here.
 */
export async function createQuoteDraftAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const org = await getDevOrganizationOrThrow();

  const formLeadId = trimOrNull(formData.get("leadId"));
  const formCustomerId = trimOrNull(formData.get("customerId"));
  let title = trimRequired(formData.get("title"));
  const internalNotes = trimOrNull(formData.get("internalNotes"));

  const lead = formLeadId
    ? await db.lead.findFirst({
        where: { id: formLeadId, organizationId: org.id },
        select: { id: true, title: true, customerId: true },
      })
    : null;
  if (formLeadId && !lead) {
    return {
      error:
        "That lead was not found in your organization. Remove stale context or start from Quotes without a lead link.",
    };
  }

  const customer = formCustomerId
    ? await db.customer.findFirst({
        where: { id: formCustomerId, organizationId: org.id },
        select: { id: true, displayName: true },
      })
    : null;
  if (formCustomerId && !customer) {
    return {
      error:
        "That customer was not found in your organization. Remove stale context or start without a customer link.",
    };
  }

  if (lead && customer) {
    if (lead.customerId != null && lead.customerId !== customer.id) {
      return {
        error:
          "This lead is linked to a different customer than the one submitted. Refresh the page and try again from the lead or customer record.",
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
      const linkedCustomer = await db.customer.findFirst({
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
    customerForTitle = await db.customer.findFirst({
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
    return { error: "Title is required when no lead or customer context is attached." };
  }

  const titleErr = enforceMaxLength("Title", title, QUOTE_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }
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

  const quote = await db.quote.create({
    data: {
      organizationId: org.id,
      customerId: resolvedCustomerId,
      leadId: resolvedLeadId,
      status: QuoteStatus.DRAFT,
      title,
      internalNotes,
      subtotalCents: 0,
      totalCents: 0,
    },
  });

  revalidatePath("/quotes");
  redirect(`/quotes/${quote.id}`);
}

type QuoteRollupTx = Pick<typeof db, "quoteLineItem" | "quote">;

async function normalizeQuoteLineExecutionOrdersTx(tx: QuoteRollupTx, quoteId: string) {
  const lines = await tx.quoteLineItem.findMany({
    where: { quoteId },
    orderBy: [{ executionOrder: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (let i = 0; i < lines.length; i++) {
    await tx.quoteLineItem.update({
      where: { id: lines[i].id },
      data: { executionOrder: i },
    });
  }
}

async function recalculateQuoteRollupsInTx(
  tx: QuoteRollupTx,
  params: { quoteId: string; organizationId: string },
) {
  const { quoteId, organizationId } = params;
  const lines = await tx.quoteLineItem.findMany({
    where: { quoteId },
    select: { lineTotalCents: true },
  });
  const subtotal = lines.reduce((sum, row) => sum + row.lineTotalCents, 0);
  await tx.quote.updateMany({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.DRAFT,
    },
    data: {
      subtotalCents: subtotal,
      totalCents: subtotal,
    },
  });
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

  const org = await getDevOrganizationOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: org.id,
      status: QuoteStatus.DRAFT,
    },
    data: {
      title,
      internalNotes,
      customerDocumentTitle: customerDocTitle.value,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This quote could not be updated. It may not be a draft, may be archived, missing, or outside your organization.",
    };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

/**
 * Appends lead intake notes to internal quote notes.
 * `quoteId` must be supplied via `.bind(null, quote.id)`.
 */
export async function copyLeadIntakeToQuoteNotesAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const org = await getDevOrganizationOrThrow();

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id, organizationId: org.id, status: QuoteStatus.DRAFT },
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
      const separator = existingNotes ? "\n\nCopied from lead intake:\n" : "Copied from lead intake:\n";
      const newNotes = `${existingNotes}${separator}${leadNotes}`;

      if (newNotes.length > QUOTE_FIELD_LIMITS.internalNotes) {
        throw new Error("NOTES_TOO_LONG");
      }

      await tx.quote.update({
        where: { id },
        data: { internalNotes: newNotes },
      });
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "QUOTE_NOT_FOUND") {
        return { error: "Quote not found or not a draft." };
      }
      if (e.message === "NO_LEAD_NOTES") {
        return { error: "No intake notes found on the linked lead." };
      }
      if (e.message === "NOTES_TOO_LONG") {
        return { error: `Resulting notes would exceed the ${QUOTE_FIELD_LIMITS.internalNotes} character limit.` };
      }
    }
    throw e;
  }

  revalidatePath(`/quotes/${id}`);
  return {};
}

/**
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
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

  const description = trimRequired(formData.get("description"));
  if (!description) {
    return { error: "Internal line description is required." };
  }
  const descErr = enforceMaxLength(
    "Internal line description",
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

  const internalNotes = trimOrNull(formData.get("internalNotes"));
  if (internalNotes) {
    const notesErr = enforceMaxLength(
      "Line internal notes",
      internalNotes,
      QUOTE_LINE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return notesErr;
    }
  }

  const proposalParsed = parseQuoteLineProposalFieldsFromForm(formData);
  if (!proposalParsed.ok) {
    return { error: proposalParsed.error };
  }

  const lineTotal = computeLineTotalCents(qtyParsed.decimal, unitParsed.cents);
  if (!lineTotal.ok) {
    return { error: lineTotal.error };
  }

  const org = await getDevOrganizationOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id,
        organizationId: org.id,
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
        description,
        ...proposalParsed.data,
        quantity: qtyParsed.decimal,
        unitAmountCents: unitParsed.cents,
        lineTotalCents: lineTotal.lineTotalCents,
        internalNotes,
        sourceLineItemTemplateId: null,
        executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
        executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
        executionOrder: nextOrder,
      },
    });

    await recalculateQuoteRollupsInTx(tx, { quoteId: id, organizationId: org.id });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      error:
        "This line could not be added. The quote may not be a draft, may be archived, missing, or outside your organization.",
    };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

/**
 * `quoteId` and `lineItemId` must be supplied via `.bind(null, quote.id, line.id)`.
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

  const description = trimRequired(formData.get("description"));
  if (!description) {
    return { error: "Internal line description is required." };
  }
  const descErr = enforceMaxLength(
    "Internal line description",
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

  const internalNotes = trimOrNull(formData.get("internalNotes"));
  if (internalNotes) {
    const notesErr = enforceMaxLength(
      "Line internal notes",
      internalNotes,
      QUOTE_LINE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return notesErr;
    }
  }

  const proposalParsed = parseQuoteLineProposalFieldsFromForm(formData);
  if (!proposalParsed.ok) {
    return { error: proposalParsed.error };
  }

  const lineTotal = computeLineTotalCents(qtyParsed.decimal, unitParsed.cents);
  if (!lineTotal.ok) {
    return { error: lineTotal.error };
  }

  const org = await getDevOrganizationOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: org.id,
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
        description,
        ...proposalParsed.data,
        quantity: qtyParsed.decimal,
        unitAmountCents: unitParsed.cents,
        lineTotalCents: lineTotal.lineTotalCents,
        internalNotes,
      },
    });

    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: org.id });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      error:
        "This line could not be updated. It may not belong to this draft quote, the quote may be archived, or it is outside your organization.",
    };
  }

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${qid}`);
}

/**
 * `quoteId` and `lineItemId` must be supplied via `.bind(null, quote.id, line.id)`.
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

  const org = await getDevOrganizationOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const line = await tx.quoteLineItem.findFirst({
      where: {
        id: lid,
        quoteId: qid,
        quote: {
          organizationId: org.id,
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

    await normalizeQuoteLineExecutionOrdersTx(tx, qid);
    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: org.id });
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return {
      error:
        "This line could not be removed. It may not belong to this draft quote, the quote may be archived, or it is outside your organization.",
    };
  }

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${qid}`);
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

  const org = await getDevOrganizationOrThrow();

  const quoteExists = await db.quote.findFirst({
    where: { id: rid, organizationId: org.id, status: QuoteStatus.DRAFT },
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
      organizationId: org.id,
      ...parsed.data,
    },
  });

  redirect(`/quotes/${rid}`);
}

/**
 * Org-scoped preset create from Sales → Scope Library (no draft quote context).
 */
export async function createLineItemTemplateFromScopeLibraryAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const parsed = parseLineItemTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const org = await getDevOrganizationOrThrow();

  await db.lineItemTemplate.create({
    data: {
      organizationId: org.id,
      ...parsed.data,
    },
  });

  redirect("/scope-library");
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

  const org = await getDevOrganizationOrThrow();

  const result = await db.lineItemTemplate.updateMany({
    where: {
      id: tid,
      organizationId: org.id,
      archivedAt: null,
    },
    data: parsed.data,
  });

  if (result.count === 0) {
    return {
      error:
        "This preset could not be updated. It may be hidden, missing, or outside your organization.",
    };
  }

  redirect("/scope-library");
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

  const org = await getDevOrganizationOrThrow();

  const result = await db.lineItemTemplate.updateMany({
    where: {
      id: tid,
      organizationId: org.id,
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

  redirect("/scope-library");
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

  const org = await getDevOrganizationOrThrow();

  const quoteExists = await db.quote.findFirst({
    where: { id: rid, organizationId: org.id, status: QuoteStatus.DRAFT },
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
      organizationId: org.id,
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

  redirect(`/quotes/${rid}`);
}

/**
 * `quoteId` and `templateId` must be supplied via `.bind(null, quote.id, template.id)`.
 * Copies commercial fields onto a new line; does not mutate the template.
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

  const org = await getDevOrganizationOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const template = await tx.lineItemTemplate.findFirst({
      where: {
        id: tid,
        organizationId: org.id,
        archivedAt: null,
      },
    });
    if (!template) {
      return { ok: false as const, message: null as string | null };
    }

    const quote = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: org.id,
        status: QuoteStatus.DRAFT,
      },
      select: { id: true },
    });
    if (!quote) {
      return { ok: false as const, message: null as string | null };
    }

    const lineTotal = computeLineTotalCents(
      template.defaultQuantity,
      template.defaultUnitAmountCents,
    );
    if (!lineTotal.ok) {
      return { ok: false as const, message: lineTotal.error };
    }

    const agg = await tx.quoteLineItem.aggregate({
      where: { quoteId: qid },
      _max: { sortOrder: true },
    });
    const nextOrder = (agg._max.sortOrder ?? -1) + 1;

    const createdLine = await tx.quoteLineItem.create({
      data: {
        quoteId: qid,
        sortOrder: nextOrder,
        description: template.description,
        customerScopeTitle: template.defaultCustomerScopeTitle,
        customerScopeDescription: template.defaultCustomerScopeDescription,
        customerIncludedNotes: template.defaultCustomerIncludedNotes,
        customerExcludedNotes: template.defaultCustomerExcludedNotes,
        customerPresentationGroup: template.defaultCustomerPresentationGroup,
        quantity: template.defaultQuantity,
        unitAmountCents: template.defaultUnitAmountCents,
        lineTotalCents: lineTotal.lineTotalCents,
        internalNotes: template.defaultInternalNotes,
        sourceLineItemTemplateId: template.id,
        executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
        executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
        executionOrder: nextOrder,
      },
    });

    const templateTasks = await tx.lineItemTemplateTask.findMany({
      where: { lineItemTemplateId: template.id },
    });
    const sortedTemplateTasks = [...templateTasks].sort((a, b) => {
      const ia = EXECUTION_STAGE_KEYS_ORDERED.indexOf(a.stageKey);
      const ib = EXECUTION_STAGE_KEYS_ORDERED.indexOf(b.stageKey);
      if (ia !== ib) {
        return ia - ib;
      }
      return a.sortOrder - b.sortOrder;
    });
    for (const tt of sortedTemplateTasks) {
      await tx.quoteLineExecutionTask.create({
        data: {
          quoteLineItemId: createdLine.id,
          sourceLineItemTemplateTaskId: tt.id,
          sourceTaskTemplateId: tt.sourceTaskTemplateId,
          sourceType: tt.sourceType,
          title: tt.title,
          stageKey: tt.stageKey,
          category: tt.category,
          instructions: tt.instructions,
          sortOrder: tt.sortOrder,
        },
      });
    }

    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: org.id });
    return { ok: true as const, message: null as string | null };
  });

  if (!outcome.ok) {
    if (outcome.message) {
      return { error: outcome.message };
    }
    return {
      error:
        "This saved line item could not be copied to the quote. The quote may not be a draft, the saved line item may be hidden, or the record is outside your organization.",
    };
  }

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${qid}`);
}

/**
 * Org-scoped send checkpoint + status → SENT. No redirect — for Workstation and
 * for composition into {@link recordQuoteSendCheckpointAction}.
 */
export async function performQuoteSendCheckpoint(quoteId: string): Promise<QuoteFormState> {
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const org = await getDevOrganizationOrThrow();

  const draftExists = await db.quote.findFirst({
    where: {
      id,
      organizationId: org.id,
      status: QuoteStatus.DRAFT,
    },
    select: { id: true },
  });
  if (!draftExists) {
    return {
      error:
        "Send is only available while the quote is a draft. If it was already sent, approved, or archived, open the quote and review its status.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: {
          id,
          organizationId: org.id,
          status: QuoteStatus.DRAFT,
        },
        select: quoteSelectForCustomerProposalCheckpoint,
      });

      if (!quote) {
        throw new Error("QUOTE_SEND_CHECKPOINT_RACE");
      }

      const input = quoteRowToCustomerPreviewInput(quote, org.id);
      const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
        organizationDisplayName: org.name,
      });

      const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId: org.id,
          quoteId: id,
          kind: QuoteCheckpointKind.SEND,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.quoteCheckpoint.create({
        data: {
          organizationId: org.id,
          quoteId: id,
          kind: QuoteCheckpointKind.SEND,
          sequence: nextSequence,
          schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
          staffOnlyJson: {
            anyLineUsesInternalDescriptionForTitle: staffOnly.anyLineUsesInternalDescriptionForTitle,
          } as Prisma.InputJsonValue,
          quoteUpdatedAtAtCapture: quote.updatedAt,
        },
      });

      const statusUpdate = await tx.quote.updateMany({
        where: {
          id,
          organizationId: org.id,
          status: QuoteStatus.DRAFT,
        },
        data: { status: QuoteStatus.SENT },
      });
      if (statusUpdate.count !== 1) {
        throw new Error("QUOTE_SEND_STATUS_RACE");
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTE_SEND_CHECKPOINT_RACE") {
      return {
        error:
          "This quote changed state while sending (for example it was archived). Refresh the page and try again if it should still be a draft.",
      };
    }
    if (e instanceof Error && e.message === "QUOTE_SEND_STATUS_RACE") {
      return {
        error:
          "This quote could not be marked sent—another change may have happened at the same time. Refresh and try again.",
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error:
          "Another send was recorded at the same moment. Refresh the page and try again if you still need to send.",
      };
    }
    throw e;
  }

  return {};
}

/**
 * Sends a draft quote: records a hidden SEND checkpoint (commercial proposal projection only) and sets status to SENT.
 * Does not email customers, does not include internal execution planning in the checkpoint payload, and does not create jobs.
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
 */
export async function recordQuoteSendCheckpointAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const result = await performQuoteSendCheckpoint(quoteId);
  if (result.error) {
    return result;
  }
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

/**
 * Org-scoped approval checkpoint + status → APPROVED. No redirect — for Workstation
 * and for composition into {@link markQuoteApprovedAction}.
 */
export async function performQuoteMarkApproved(quoteId: string): Promise<QuoteFormState> {
  const id = quoteId.trim();
  if (!id) {
    return { error: "Missing quote record id." };
  }

  const org = await getDevOrganizationOrThrow();

  const sentExists = await db.quote.findFirst({
    where: {
      id,
      organizationId: org.id,
      status: QuoteStatus.SENT,
    },
    select: { id: true },
  });
  if (!sentExists) {
    return {
      error:
        "Approval can only be recorded for a sent quote. Send the quote first, or refresh if the status already changed.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: {
          id,
          organizationId: org.id,
          status: QuoteStatus.SENT,
        },
        select: quoteSelectForCustomerProposalCheckpoint,
      });

      if (!quote) {
        throw new Error("QUOTE_APPROVAL_RACE");
      }

      const input = quoteRowToCustomerPreviewInput(quote, org.id);
      const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
        organizationDisplayName: org.name,
      });

      const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId: org.id,
          quoteId: id,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.quoteCheckpoint.create({
        data: {
          organizationId: org.id,
          quoteId: id,
          kind: QuoteCheckpointKind.APPROVAL,
          sequence: nextSequence,
          schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
          staffOnlyJson: {
            anyLineUsesInternalDescriptionForTitle: staffOnly.anyLineUsesInternalDescriptionForTitle,
          } as Prisma.InputJsonValue,
          quoteUpdatedAtAtCapture: quote.updatedAt,
        },
      });

      const statusUpdate = await tx.quote.updateMany({
        where: {
          id,
          organizationId: org.id,
          status: QuoteStatus.SENT,
        },
        data: { status: QuoteStatus.APPROVED },
      });
      if (statusUpdate.count !== 1) {
        throw new Error("QUOTE_APPROVAL_STATUS_RACE");
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "QUOTE_APPROVAL_RACE") {
      return {
        error:
          "This quote changed state while recording approval. Refresh the page and try again if it should still be sent.",
      };
    }
    if (e instanceof Error && e.message === "QUOTE_APPROVAL_STATUS_RACE") {
      return {
        error:
          "This quote could not be marked approved—another change may have happened at the same time. Refresh and try again.",
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error:
          "Another approval row was written at the same moment. Refresh the page and try again if you still need to record acceptance.",
      };
    }
    throw e;
  }

  return {};
}

/**
 * Staff-recorded customer acceptance of the commercial proposal (no e-sign provider in this build).
 * Creates an APPROVAL checkpoint with the same commercial projection shape as SEND, then sets status to APPROVED.
 * SENT-only. Does not create jobs or freeze internal execution planning.
 */
export async function markQuoteApprovedAction(
  quoteId: string,
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  void formData;
  const result = await performQuoteMarkApproved(quoteId);
  if (result.error) {
    return result;
  }
  const id = quoteId.trim();
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

/**
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
 * Transitions draft, sent, or approved quotes → ARCHIVED; does not modify lines, totals, or links.
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

  const org = await getDevOrganizationOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: org.id,
      status: { in: [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.APPROVED] },
    },
    data: { status: QuoteStatus.ARCHIVED },
  });

  if (result.count === 0) {
    return {
      error:
        "This quote could not be archived. It may already be archived, missing, or outside your organization.",
    };
  }

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

/**
 * `quoteId` must be supplied via `.bind(null, quote.id)` from the quote detail route.
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

  const org = await getDevOrganizationOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: org.id,
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

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

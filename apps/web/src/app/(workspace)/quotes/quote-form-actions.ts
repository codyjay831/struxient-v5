"use server";

import {
  Prisma,
  QuoteCheckpointKind,
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";
import {
  getLeadCommercialProgress,
  type LeadProgressQuoteInput,
} from "@/lib/lead-commercial-progress";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  computeLineTotalCents,
  parsePositiveQuantityString,
  parseUsdStringToCents,
} from "@/lib/quote-money";
import {
  parseQuoteLineFormDataInput,
  type ParsedQuoteLineInput as ParsedQuoteLineInputLib,
} from "@/lib/quote-line-form-input";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { formatPrimaryServiceLocationLineForQuoteNotes } from "@/lib/customer-service-location-from-lead";
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
        "That lead was not found in your organization. Remove stale context or start from Quotes without a lead link.",
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
      error: "Title is required when no lead or customer context is attached.",
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

function validateResolvedDraftQuoteFields(data: ResolvedDraftQuoteInsert): string | null {
  const titleErr = enforceMaxLength("Title", data.title, QUOTE_FIELD_LIMITS.title);
  if (titleErr?.error) {
    return titleErr.error;
  }
  if (data.internalNotes) {
    const notesErr = enforceMaxLength(
      "Internal notes",
      data.internalNotes,
      QUOTE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr?.error) {
      return notesErr.error;
    }
  }
  return null;
}

export type PerformCreateQuoteDraftFromLeadResult =
  | { ok: true; quoteId: string; reusedExisting: boolean }
  | { ok: false; error: string };

/**
 * Org-scoped draft quote creation anchored to a lead — same resolution defaults
 * as `/quotes/new?leadId=…` and {@link createQuoteDraftAction}, without redirect.
 *
 * When {@link getLeadCommercialProgress} already has an active linked quote,
 * returns that id and does not insert (idempotent for double-clicks / races).
 *
 * Uses a serializable transaction so concurrent "Start quote" requests do not
 * reliably create two active drafts for the same lead window.
 */
export async function performCreateQuoteDraftFromLead(
  leadId: string,
): Promise<PerformCreateQuoteDraftFromLeadResult> {
  const ctx = await getRequestContextOrThrow();
  const id = leadId.trim();
  if (!id) {
    return { ok: false, error: "Missing lead record id." };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id, organizationId: ctx.organizationId },
          select: {
            id: true,
            title: true,
            status: true,
            customerId: true,
            email: true,
            phone: true,
            quotes: {
              where: { status: { not: QuoteStatus.ARCHIVED } },
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                title: true,
                status: true,
                totalCents: true,
                updatedAt: true,
                _count: { select: { lineItems: true } },
                job: { select: { id: true, status: true, organizationId: true } },
              },
            },
          },
        });

        if (!lead) {
          return { ok: false as const, error: "That lead was not found in your organization." };
        }

        const progressQuoteInputs: LeadProgressQuoteInput[] = lead.quotes.map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
          totalCents: q.totalCents,
          lineItemCount: q._count.lineItems,
          updatedAt: q.updatedAt,
          job:
            q.job && q.job.organizationId === ctx.organizationId
              ? { id: q.job.id, status: q.job.status }
              : null,
        }));

        const progress = getLeadCommercialProgress({
          lead: {
            status: lead.status,
            customerId: lead.customerId,
            email: lead.email,
            phone: lead.phone,
          },
          quotes: progressQuoteInputs,
        });

        if (progress.isTerminal) {
          return {
            ok: false as const,
            error:
              "This lead is archived or closed. Open the full lead record if you need to change its status before starting a quote.",
          };
        }

        if (progress.activeQuote) {
          return {
            ok: true as const,
            quoteId: progress.activeQuote.id,
            reusedExisting: true,
          };
        }

        const resolved = await resolveCreateQuoteDraftFromFormFields(tx, { id: ctx.organizationId }, {
          formLeadId: lead.id,
          formCustomerId: null,
          title: "",
          internalNotes: null,
        });

        if (!resolved.ok) {
          return { ok: false as const, error: resolved.error };
        }

        const valErr = validateResolvedDraftQuoteFields(resolved.data);
        if (valErr) {
          return { ok: false as const, error: valErr };
        }

        const quote = await tx.quote.create({
          data: {
            organizationId: resolved.data.organizationId,
            customerId: resolved.data.customerId,
            leadId: resolved.data.leadId,
            status: QuoteStatus.DRAFT,
            title: resolved.data.title,
            internalNotes: resolved.data.internalNotes,
            subtotalCents: 0,
            totalCents: 0,
          },
        });

        if (resolved.data.customerId) {
          const primaryLoc = await tx.customerServiceLocation.findFirst({
            where: {
              organizationId: ctx.organizationId,
              customerId: resolved.data.customerId,
              isPrimary: true,
            },
            select: { formattedAddress: true, addressLine1: true },
          });
          const line = formatPrimaryServiceLocationLineForQuoteNotes(primaryLoc);
          if (line) {
            const prefix = `Primary service location:\n${line}\n\n`;
            const merged = prefix + (resolved.data.internalNotes ?? "");
            if (merged.length <= QUOTE_FIELD_LIMITS.internalNotes) {
              await tx.quote.update({
                where: { id: quote.id },
                data: { internalNotes: merged },
              });
            }
          }
        }

        return { ok: true as const, quoteId: quote.id, reusedExisting: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return {
        ok: false,
        error:
          "Another change happened at the same moment. Refresh the workspace and try again.",
      };
    }
    throw e;
  }
}

/**
 * Creates a DRAFT quote for the active development organization.
 * `leadId` / `customerId` in the form are untrusted—revalidated against org scope here.
 */
export async function createQuoteDraftAction(
  _prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const ctx = await getRequestContextOrThrow();

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

  const valErr = validateResolvedDraftQuoteFields(resolved.data);
  if (valErr) {
    return { error: valErr };
  }

  const quote = await db.quote.create({
    data: {
      organizationId: resolved.data.organizationId,
      customerId: resolved.data.customerId,
      leadId: resolved.data.leadId,
      status: QuoteStatus.DRAFT,
      title: resolved.data.title,
      internalNotes: resolved.data.internalNotes,
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

  const ctx = await getRequestContextOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();

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

export type PerformQuoteLineItemResult =
  | { ok: true }
  | { ok: false; error: string };

type ParsedQuoteLineInput = ParsedQuoteLineInputLib;

/**
 * Org-scoped add of a quote line item. No redirect, no revalidate — composable
 * by both the redirecting full-page action and workspace-safe wrappers used
 * inside QuoteWorkSurface popup/drawer/lead-tab containers.
 */
export async function performAddQuoteLineItem(
  quoteId: string,
  input: ParsedQuoteLineInput,
): Promise<PerformQuoteLineItemResult> {
  const id = quoteId.trim();
  if (!id) {
    return { ok: false, error: "Missing quote record id." };
  }

  const ctx = await getRequestContextOrThrow();

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
        executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
        executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
        executionOrder: nextOrder,
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

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
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

  const ctx = await getRequestContextOrThrow();

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

  revalidatePath(`/quotes/${qid}`);
  revalidatePath(`/quotes/${qid}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${qid}`);
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

  const ctx = await getRequestContextOrThrow();

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

    await normalizeQuoteLineExecutionOrdersTx(tx, qid);
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

  const ctx = await getRequestContextOrThrow();

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

  const ctx = await getRequestContextOrThrow();

  await db.lineItemTemplate.create({
    data: {
      organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();

  const result = await db.lineItemTemplate.updateMany({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();

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

  const ctx = await getRequestContextOrThrow();

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

  redirect(`/quotes/${rid}`);
}

/**
 * Org-scoped apply of a Scope Library template to a draft quote. No redirect,
 * no revalidate — composed by both the redirecting full-page action and the
 * workspace-safe wrapper used inside QuoteWorkSurface popup/drawer/lead-tab.
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

  const ctx = await getRequestContextOrThrow();

  const outcome = await db.$transaction(async (tx) => {
    const template = await tx.lineItemTemplate.findFirst({
      where: {
        id: tid,
        organizationId: ctx.organizationId,
        archivedAt: null,
      },
    });
    if (!template) {
      return { ok: false as const, message: null as string | null };
    }

    const quote = await tx.quote.findFirst({
      where: {
        id: qid,
        organizationId: ctx.organizationId,
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

    await recalculateQuoteRollupsInTx(tx, { quoteId: qid, organizationId: ctx.organizationId });
    return { ok: true as const, message: null as string | null };
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

  const ctx = await getRequestContextOrThrow();

  const draftExists = await db.quote.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
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
          organizationId: ctx.organizationId,
          status: QuoteStatus.DRAFT,
        },
        select: quoteSelectForCustomerProposalCheckpoint,
      });

      if (!quote) {
        throw new Error("QUOTE_SEND_CHECKPOINT_RACE");
      }

      const input = quoteRowToCustomerPreviewInput(quote, ctx.organizationId);
      const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
        organizationDisplayName: ctx.organizationName,
      });

      const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId: ctx.organizationId,
          quoteId: id,
          kind: QuoteCheckpointKind.SEND,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.quoteCheckpoint.create({
        data: {
          organizationId: ctx.organizationId,
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
          organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();

  const sentExists = await db.quote.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
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
          organizationId: ctx.organizationId,
          status: QuoteStatus.SENT,
        },
        select: quoteSelectForCustomerProposalCheckpoint,
      });

      if (!quote) {
        throw new Error("QUOTE_APPROVAL_RACE");
      }

      const input = quoteRowToCustomerPreviewInput(quote, ctx.organizationId);
      const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
        organizationDisplayName: ctx.organizationName,
      });

      const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId: ctx.organizationId,
          quoteId: id,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.quoteCheckpoint.create({
        data: {
          organizationId: ctx.organizationId,
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
          organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();
  const result = await db.quote.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
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

  const ctx = await getRequestContextOrThrow();
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

  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/execution-review`);
  revalidatePath("/quotes");
  redirect(`/quotes/${id}`);
}

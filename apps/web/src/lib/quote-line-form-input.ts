/**
 * Pure, server-safe form parsing for quote line item add/update.
 *
 * Lives in `lib/` (not in a `"use server"` module) so both
 * `quote-form-actions.ts` (full-page redirecting actions) and
 * `workstation/quote-workspace-actions.ts` (workspace-safe wrappers used
 * inside QuoteWorkSurface popup/drawer/lead-tab) can import the same
 * validator without crossing the server-action export rule.
 *
 * No DB, no `"use server"`, no `revalidatePath`, no `redirect`.
 */

import type { Prisma } from "@prisma/client";
import {
  computeLineTotalCents,
  parsePositiveQuantityString,
  parseUsdStringToCents,
} from "@/lib/quote-money";
import {
  QUOTE_LINE_FIELD_LIMITS,
  QUOTE_PROPOSAL_FIELD_LIMITS,
} from "@/app/(workspace)/quotes/quote-field-limits";

export type QuoteLineProposalFields = {
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  customerPresentationGroup: string | null;
};

export type ParsedQuoteLineInput = {
  description: string;
  quantity: Prisma.Decimal;
  unitAmountCents: number;
  lineTotalCents: number;
  internalNotes: string | null;
} & QuoteLineProposalFields;

export type ParseQuoteLineFormDataResult =
  | { ok: true; input: ParsedQuoteLineInput }
  | { ok: false; error: string };

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

function enforceMaxLength(label: string, value: string, max: number): string | null {
  if (value.length > max) {
    return `${label} is too long (max ${max} characters).`;
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

function parseQuoteLineProposalFieldsFromForm(
  formData: FormData,
): { ok: true; data: QuoteLineProposalFields } | { ok: false; error: string } {
  const title = parseOptionalProposalString(
    formData,
    "customerScopeTitle",
    "Proposal scope title",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeTitle,
  );
  if (!title.ok) return { ok: false, error: title.error };

  const desc = parseOptionalProposalString(
    formData,
    "customerScopeDescription",
    "Proposal scope description",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeDescription,
  );
  if (!desc.ok) return { ok: false, error: desc.error };

  const inc = parseOptionalProposalString(
    formData,
    "customerIncludedNotes",
    "Included notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerIncludedNotes,
  );
  if (!inc.ok) return { ok: false, error: inc.error };

  const exc = parseOptionalProposalString(
    formData,
    "customerExcludedNotes",
    "Excluded notes",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerExcludedNotes,
  );
  if (!exc.ok) return { ok: false, error: exc.error };

  const grp = parseOptionalProposalString(
    formData,
    "customerPresentationGroup",
    "Presentation group",
    QUOTE_PROPOSAL_FIELD_LIMITS.customerPresentationGroup,
  );
  if (!grp.ok) return { ok: false, error: grp.error };

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

/**
 * Validates the FormData payload for the add/update line-item flow and
 * returns a normalized typed input ready for `performAddQuoteLineItem` /
 * `performUpdateQuoteLineItem`.
 *
 * Errors are user-safe strings.
 */
export function parseQuoteLineFormDataInput(
  formData: FormData,
): ParseQuoteLineFormDataResult {
  const description = trimRequired(formData.get("description"));
  if (!description) {
    return { ok: false, error: "Internal line description is required." };
  }
  const descErr = enforceMaxLength(
    "Internal line description",
    description,
    QUOTE_LINE_FIELD_LIMITS.description,
  );
  if (descErr) {
    return { ok: false, error: descErr };
  }

  const quantityRaw = trimRequired(formData.get("quantity"));
  const qtyParsed = parsePositiveQuantityString(quantityRaw);
  if (!qtyParsed.ok) {
    return { ok: false, error: qtyParsed.error };
  }

  const unitRaw = trimRequired(formData.get("unitAmountDollars"));
  const unitParsed = parseUsdStringToCents(unitRaw);
  if (!unitParsed.ok) {
    return { ok: false, error: unitParsed.error };
  }

  const internalNotes = trimOrNull(formData.get("internalNotes"));
  if (internalNotes) {
    const notesErr = enforceMaxLength(
      "Line internal notes",
      internalNotes,
      QUOTE_LINE_FIELD_LIMITS.internalNotes,
    );
    if (notesErr) {
      return { ok: false, error: notesErr };
    }
  }

  const proposalParsed = parseQuoteLineProposalFieldsFromForm(formData);
  if (!proposalParsed.ok) {
    return { ok: false, error: proposalParsed.error };
  }

  const lineTotal = computeLineTotalCents(qtyParsed.decimal, unitParsed.cents);
  if (!lineTotal.ok) {
    return { ok: false, error: lineTotal.error };
  }

  return {
    ok: true,
    input: {
      description,
      quantity: qtyParsed.decimal,
      unitAmountCents: unitParsed.cents,
      lineTotalCents: lineTotal.lineTotalCents,
      internalNotes,
      ...proposalParsed.data,
    },
  };
}

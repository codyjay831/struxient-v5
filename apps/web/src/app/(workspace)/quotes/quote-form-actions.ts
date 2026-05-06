"use server";

import { QuoteStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { QUOTE_FIELD_LIMITS } from "./quote-field-limits";

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

  redirect(`/quotes/${quote.id}`);
}

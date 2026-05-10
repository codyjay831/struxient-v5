"use server";

import { revalidatePath } from "next/cache";
import { performCreateQuoteDraftFromLead } from "@/app/(workspace)/quotes/quote-form-actions";

/**
 * Workspace-safe lead server actions.
 *
 * These mirror the logic in `lead-form-actions.ts` but return a result object
 * instead of calling `redirect()`, so they can be used from the in-place
 * Customer/Lead Workspace dialog without navigating away.  After a successful
 * action the caller is responsible for calling `router.refresh()` to reload
 * server-component data.
 */

import { LeadStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import {
  attachIntakeServiceLocationToCustomer,
  intakeSnapshotForCustomerFromLead,
} from "@/lib/customer-service-location-from-lead";
import {
  getLeadCommercialProgress,
  type LeadProgressQuoteInput,
} from "@/lib/lead-commercial-progress";
import {
  loadQuoteWorkSurface,
  type QuoteWorkSurfaceLoaderResult,
} from "@/lib/quote-work-surface-loader";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";

const LEAD_STATUS_SET = new Set<string>(Object.values(LeadStatus));

export type WorkspaceFormState = {
  error?: string;
  success?: boolean;
};

/**
 * Result type for {@link loadLeadActiveQuoteWorkSurfaceAction}.
 * Read-only loader; never throws across the action boundary.
 */
export type LoadLeadActiveQuoteWorkSurfaceResult =
  | { ok: true; payload: QuoteWorkSurfaceLoaderResult | null }
  | { ok: false; error: string };

export type CreateQuoteFromLeadWorkspaceResult =
  | { success: true; quoteId: string }
  | { success: false; error: string };

function revalidateLeadAndQuoteSurfaces(leadId: string, quoteId: string) {
  const lid = leadId.trim();
  const qid = quoteId.trim();
  revalidatePath("/leads");
  if (lid) {
    revalidatePath(`/leads/${lid}`);
  }
  revalidatePath("/quotes");
  if (qid) {
    revalidatePath(`/quotes/${qid}`);
  }
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
}

/**
 * Creates (or reuses) the org-scoped active draft quote for a lead — same rules
 * as `/quotes/new?leadId=…` without redirecting. Caller should `router.refresh()`
 * and reload the active quote payload for the embedded {@link QuoteWorkSurface}.
 *
 * `leadId` must be supplied from a trusted server-rendered surface (bound in
 * the client), never from an arbitrary org id.
 */
export async function createQuoteFromLeadWorkspaceAction(
  leadId: string,
): Promise<CreateQuoteFromLeadWorkspaceResult> {
  const result = await performCreateQuoteDraftFromLead(leadId);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateLeadAndQuoteSurfaces(leadId, result.quoteId);
  return { success: true, quoteId: result.quoteId };
}

class WorkspaceTxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceTxError";
  }
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function isReasonableEmail(value: string): boolean {
  if (value.length > LEAD_FIELD_LIMITS.email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Creates a Customer from lead data and links the lead in one transaction.
 * Returns `{ success: true }` on success instead of redirecting.
 * `leadId` must be supplied via `.bind(null, lead.id)` before passing to
 * `useActionState`.
 */
export async function createCustomerFromLeadWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  _formData: FormData,
): Promise<WorkspaceFormState> {
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const ctx = await getRequestContextOrThrow();

  try {
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          customerId: true,
          title: true,
          contactName: true,
          email: true,
          phone: true,
          notes: true,
          publicIntakeServiceLocation: true,
        },
      });

      if (!lead) {
        throw new WorkspaceTxError("This lead was not found in your organization.");
      }
      if (lead.customerId != null) {
        throw new WorkspaceTxError("This lead is already linked to a customer.");
      }

      const prep = prepareCustomerFromLead(lead);
      if (!prep.ok) {
        throw new WorkspaceTxError(prep.error);
      }

      const customer = await tx.customer.create({
        data: {
          organizationId: ctx.organizationId,
          ...prep.data,
        },
      });

      const result = await tx.lead.updateMany({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        data: { customerId: customer.id, convertedAt: new Date() },
      });

      if (result.count === 0) {
        throw new WorkspaceTxError(
          "Could not link this lead—it may have been linked already. Refresh and try again.",
        );
      }

      await attachIntakeServiceLocationToCustomer(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        leadId: id,
        snapshot: intakeSnapshotForCustomerFromLead(lead),
      });
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
  }

  return { success: true };
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") return "";
  return value.trim();
}

/**
 * Links an org-scoped customer to a lead with `customerId` null.
 * Returns `{ success: true }` instead of redirecting — caller should `router.refresh()`.
 * `leadId` must be supplied via `.bind(null, lead.id)`.
 */
export async function linkLeadToCustomerWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const customerIdRaw = trimRequired(formData.get("customerId"));
  if (!customerIdRaw) {
    return { error: "Choose a customer to link, or create one first." };
  }

  const ctx = await getRequestContextOrThrow();

  const customer = await db.customer.findFirst({
    where: { id: customerIdRaw, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!customer) {
    return {
      error: "That customer was not found in your organization. It may belong to another tenant.",
    };
  }

  const leadPeek = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { customerId: true },
  });
  if (!leadPeek) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (leadPeek.customerId != null) {
    return { error: "This lead is already linked to a customer. Unlinking is not available yet." };
  }

  const convertedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        select: { id: true, notes: true, publicIntakeServiceLocation: true },
      });
      if (!lead) {
        throw new WorkspaceTxError(
          "This lead could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      const result = await tx.lead.updateMany({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        data: { customerId: customer.id, convertedAt },
      });
      if (result.count === 0) {
        throw new WorkspaceTxError(
          "This lead could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      await attachIntakeServiceLocationToCustomer(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        leadId: id,
        snapshot: intakeSnapshotForCustomerFromLead(lead),
      });
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
  }

  return { success: true };
}

/**
 * Updates only `status` for an org-scoped lead (same rules as `updateLeadStatusAction` in
 * `lead-form-actions.ts`) but returns `{ success: true }` instead of redirecting.
 * `leadId` must be supplied via `.bind(null, lead.id)`.
 */
export async function updateLeadStatusWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = leadId.trim();
  if (!id) {
    return { error: "Missing lead record id." };
  }

  const rawStatus = formData.get("status");
  if (rawStatus == null || typeof rawStatus !== "string") {
    return { error: "Choose a status, then try again." };
  }
  const v = rawStatus.trim();
  if (!v || !LEAD_STATUS_SET.has(v)) {
    return {
      error:
        "That status is not valid. Choose Open, Qualifying, Converted, Lost, or Archived.",
    };
  }
  const status = v as LeadStatus;

  const ctx = await getRequestContextOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const result = await db.lead.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    data: { status },
  });

  if (result.count === 0) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  return { success: true };
}

/**
 * Updates a lead's contact fields (name, email, phone) in-place.
 * Returns `{ success: true }` on success instead of redirecting.
 * `leadId` must be supplied via `.bind(null, lead.id)`.
 */
export async function updateLeadContactWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const ctx = await getRequestContextOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) return { error: "Lead not found in your organization." };

  const contactName = trimOrNull(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));

  if (contactName && contactName.length > LEAD_FIELD_LIMITS.contactName) {
    return {
      error: `Contact name is too long (max ${LEAD_FIELD_LIMITS.contactName} characters).`,
    };
  }
  if (email && !isReasonableEmail(email)) {
    return { error: "Enter a valid email address, or leave the field blank." };
  }
  if (phone && phone.length > LEAD_FIELD_LIMITS.phone) {
    return {
      error: `Phone is too long (max ${LEAD_FIELD_LIMITS.phone} characters).`,
    };
  }

  const result = await db.lead.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: { contactName, email, phone },
  });

  if (result.count === 0) {
    return { error: "Lead not found or could not be updated." };
  }

  return { success: true };
}

/**
 * Read-only loader for the Leads list popup Quote tab.
 *
 * Lazily produces a `QuoteWorkSurface` payload for the selected lead's active
 * linked quote *without* preloading readiness for every lead row. Containers
 * that already have the payload server-side (Workstation lead drawer, Lead
 * full page) do not need this — they pass `activeQuoteWorkSurface` directly.
 *
 * Security:
 *   - org-scoped via `getRequestContextOrThrow`
 *   - never trusts a client-supplied quote id; the active quote is derived
 *     server-side from the lead's quotes using the same
 *     `getLeadCommercialProgress` logic the other containers use
 *   - read-only — no mutations, no `revalidatePath`, no `redirect`
 *   - `loadQuoteWorkSurface` re-validates the quote's organization scope
 *
 * Returns `{ ok: true, payload: null }` when the lead has no active quote
 * (e.g. only archived quotes or no quotes at all).
 */
export async function loadLeadActiveQuoteWorkSurfaceAction(
  leadId: string,
): Promise<LoadLeadActiveQuoteWorkSurfaceResult> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getRequestContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      status: true,
      customerId: true,
      email: true,
      phone: true,
      quotes: {
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
    return { ok: false, error: "Lead not found in your organization." };
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

  if (!progress.activeQuote) {
    return { ok: true, payload: null };
  }

  const result = await loadQuoteWorkSurface(progress.activeQuote.id, ctx.organizationId);
  return { ok: true, payload: result };
}

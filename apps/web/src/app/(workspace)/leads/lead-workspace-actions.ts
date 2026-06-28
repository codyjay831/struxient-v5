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

import {
  CustomerServiceLocationSource,
  LeadChannel,
  LeadCloseReason,
  LeadStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  getCommercialMutationContextOrThrow,
  getCommercialRequestContextOrThrow,
} from "@/lib/auth-context";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer";
import {
  attachIntakeServiceLocationToCustomerFromLead,
  ensureServiceLocationForLeadFromSnapshot,
  intakeSnapshotForCustomerFromLead,
} from "@/lib/customer-service-location-from-lead";
import { findCustomerMatchHints, type LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import {
  getOpportunityFlow,
  type OpportunityFlowQuoteInput,
} from "@/lib/opportunity-flow";
import {
  loadQuoteWorkSurface,
  type QuoteWorkSurfaceLoaderResult,
} from "@/lib/quote-work-surface-loader";
import {
  loadLeadCommercialSurface,
  type LeadCommercialSurfacePayload,
} from "@/lib/lead-commercial-surface/loader";
import {
  readContact,
  readRequest,
  readSignals,
} from "@/lib/lead/lead-projection";
import {
  jobsiteLineFromLead,
  isLeadAddressQuoteReady,
  isLeadAddressVerified,
} from "@/lib/jobsite-address";
import {
  classifyLeadIntakeAgainstCustomerSites,
  describeLeadCustomerLinkSiteOutcome,
  intakeSnapshotFromLeadRow,
  linkLeadToCustomerInTransaction,
  type LeadCustomerLinkSiteOutcome,
} from "@/lib/lead-customer-link-site";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
import {
  parseStoredPublicIntakeServiceLocation,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-lead-service-location";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";
import {
  fetchSnapshotByPlaceId,
  resolveAddressViaGeocode,
  type GeocodeResolveResult,
} from "@/lib/google-maps-geocode";

const LEAD_STATUS_SET = new Set<string>(Object.values(LeadStatus));
const LEAD_CLOSE_REASON_SET = new Set<string>(Object.values(LeadCloseReason));

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

function revalidateLeadAndQuoteSurfaces(leadId: string, _quoteId: string | null) {
  const lid = leadId.trim();
  revalidatePath("/leads");
  if (lid) {
    revalidatePath(`/leads/${lid}`);
  }
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath("/workstation/jobs");
}

/**
 * Creates (or reuses) the org-scoped active draft quote via {@link promoteLeadToQuote}.
 * Same invariants as `/quotes/new?leadId=…` (auto-promote) without redirecting.
 * Caller should `router.push` to the quote and `router.refresh()` when done.
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
  void _prevState;
  void _formData;
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const ctx = await getCommercialMutationContextOrThrow();

  let createdCustomerId: string | undefined;

  try {
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          customerId: true,
          contact: true,
          request: true,
          signals: true,
          channel: true,
          address: true,
        },
      });

      if (!lead) {
        throw new WorkspaceTxError("This opportunity was not found in your organization.");
      }
      if (lead.customerId != null) {
        throw new WorkspaceTxError("This opportunity is already linked to a customer.");
      }

      const contact = readContact(lead.contact);
      const request = readRequest(lead.request);
      const signals = readSignals(lead.signals);

      const prep = prepareCustomerFromLead({
        title: request.type || "Lead",
        contactName: contact.name,
        companyName: contact.companyName,
        email: contact.email,
        phone: contact.phone,
        notes: signals?.notes || "",
        channel: lead.channel,
      });
      if (!prep.ok) {
        throw new WorkspaceTxError(prep.error);
      }

      const customer = await tx.customer.create({
        data: {
          organizationId: ctx.organizationId,
          ...prep.data,
        },
      });
      createdCustomerId = customer.id;

      const result = await tx.lead.updateMany({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        data: { customerId: customer.id, convertedAt: new Date() },
      });

      if (result.count === 0) {
        throw new WorkspaceTxError(
          "Could not link this opportunity—it may have been linked already. Refresh and try again.",
        );
      }

      const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        leadId: id,
        leadChannel: lead.channel,
        snapshot: intakeSnapshotForCustomerFromLead(lead),
      });
      if (attached.locationId) {
        await tx.lead.update({
          where: { id },
          data: { serviceLocationId: attached.locationId },
        });
      }
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
  }

  if (createdCustomerId) {
    revalidatePath(`/customers/${createdCustomerId}`);
    revalidatePath("/customers");
  }
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

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

  const ctx = await getCommercialMutationContextOrThrow();

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
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (leadPeek.customerId != null) {
    return { error: "This opportunity is already linked to a customer. Unlinking is not available yet." };
  }

  const convertedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      await linkLeadToCustomerInTransaction(tx, {
        organizationId: ctx.organizationId,
        leadId: id,
        customerId: customer.id,
        convertedAt,
        setStatusConverted: false,
        recordLinkEvent: false,
      });
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    if (e instanceof Error) return { error: e.message };
    throw e;
  }

  revalidatePath(`/customers/${customer.id}`);
  revalidatePath("/customers");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

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
        "That status is not valid. Choose New, Triaging, Qualified, Converted, On hold, Lost, or Archived.",
    };
  }
  const status = v as LeadStatus;
  const now = new Date();

  const ctx = await getCommercialMutationContextOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const result = await db.lead.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    data: {
      status,
      closeReason: status === LeadStatus.LOST ? undefined : null,
      followUpAt: status === LeadStatus.ON_HOLD ? undefined : null,
      closedAt:
        status === LeadStatus.LOST || status === LeadStatus.ARCHIVED
          ? now
          : null,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  return { success: true };
}

/**
 * Guided close/pause flow for sales opportunities.
 * - ON_HOLD keeps the opportunity active with optional follow-up date.
 * - LOST requires a close reason and marks closedAt.
 * - ARCHIVED records closedAt without a close reason.
 */
export async function closeOrPauseLeadWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const rawOutcome = formData.get("outcome");
  if (typeof rawOutcome !== "string") {
    return { error: "Choose how to close or pause this opportunity." };
  }
  const outcome = rawOutcome.trim();
  if (!outcome || !LEAD_STATUS_SET.has(outcome)) {
    return { error: "Choose a valid close outcome." };
  }

  const ctx = await getCommercialMutationContextOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Opportunity not found in your organization." };

  if (outcome === LeadStatus.ON_HOLD) {
    const rawFollowUpAt = formData.get("followUpAt");
    const followUpAt =
      typeof rawFollowUpAt === "string" && rawFollowUpAt.trim()
        ? new Date(rawFollowUpAt)
        : null;
    if (followUpAt && Number.isNaN(followUpAt.getTime())) {
      return { error: "Follow-up date is invalid." };
    }
    await db.lead.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        status: LeadStatus.ON_HOLD,
        followUpAt,
        closeReason: null,
        closedAt: null,
      },
    });
    await db.leadEvent.create({
      data: {
        leadId: id,
        type: "CLOSED_OR_PAUSED",
        payload: {
          status: LeadStatus.ON_HOLD,
          followUpAt: followUpAt?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
      },
    });
    revalidateLeadAndQuoteSurfaces(id, null);
    return { success: true };
  }

  if (outcome === LeadStatus.LOST) {
    const rawReason = formData.get("closeReason");
    if (typeof rawReason !== "string" || !LEAD_CLOSE_REASON_SET.has(rawReason.trim())) {
      return { error: "Choose a close reason before marking this opportunity lost." };
    }
    const closeReason = rawReason.trim() as LeadCloseReason;
    const closedAt = new Date();
    await db.lead.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        status: LeadStatus.LOST,
        closeReason,
        closedAt,
        followUpAt: null,
      },
    });
    await db.leadEvent.create({
      data: {
        leadId: id,
        type: "CLOSED_OR_PAUSED",
        payload: {
          status: LeadStatus.LOST,
          closeReason,
          closedAt: closedAt.toISOString(),
        } as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
      },
    });
    revalidateLeadAndQuoteSurfaces(id, null);
    return { success: true };
  }

  if (outcome === LeadStatus.ARCHIVED) {
    const closedAt = new Date();
    await db.lead.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: {
        status: LeadStatus.ARCHIVED,
        closeReason: null,
        followUpAt: null,
        closedAt,
      },
    });
    await db.leadEvent.create({
      data: {
        leadId: id,
        type: "CLOSED_OR_PAUSED",
        payload: {
          status: LeadStatus.ARCHIVED,
          closedAt: closedAt.toISOString(),
        } as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
      },
    });
    revalidateLeadAndQuoteSurfaces(id, null);
    return { success: true };
  }

  return { error: "Choose a valid close outcome." };
}

export type ResumeOpportunityWorkspaceResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Clears ON_HOLD and returns the opportunity to the open pipeline (TRIAGING).
 */
export async function resumeOpportunityWorkspaceAction(
  leadId: string,
): Promise<ResumeOpportunityWorkspaceResult> {
  const id = leadId.trim();
  if (!id) return { success: false, error: "Missing lead record id." };

  const ctx = await getCommercialMutationContextOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) {
    return { success: false, error: "Opportunity not found in your organization." };
  }
  if (existing.status !== LeadStatus.ON_HOLD) {
    return { success: false, error: "This opportunity is not paused." };
  }

  await db.lead.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: {
      status: LeadStatus.TRIAGING,
      followUpAt: null,
      closeReason: null,
      closedAt: null,
    },
  });
  await db.leadEvent.create({
    data: {
      leadId: id,
      type: "RESUMED",
      payload: { previousStatus: LeadStatus.ON_HOLD } as Prisma.InputJsonValue,
      actorUserId: ctx.userId,
    },
  });
  revalidateLeadAndQuoteSurfaces(id, null);
  return { success: true };
}

/**
 * Idempotent archive — flips a lead to ARCHIVED status. Used by the inbox
 * "Archive" button so the row leaves the open queue without being deleted.
 */
export async function archiveLeadInboxAction(
  leadId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const id = leadId.trim();
  if (!id) {
    return { success: false, error: "Missing lead id." };
  }
  const ctx = await getCommercialMutationContextOrThrow();
  const closedAt = new Date();
  const result = await db.lead.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: {
      status: LeadStatus.ARCHIVED,
      closeReason: null,
      followUpAt: null,
      closedAt,
    },
  });
  if (result.count === 0) {
    return {
      success: false,
      error: "This opportunity could not be archived in your organization.",
    };
  }
  revalidateLeadAndQuoteSurfaces(id, null);
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

  const ctx = await getCommercialMutationContextOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) return { error: "Opportunity not found in your organization." };

  const contactName = trimOrNull(formData.get("contactName"));
  const companyName = trimOrNull(formData.get("companyName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));

  if (contactName && contactName.length > LEAD_FIELD_LIMITS.contactName) {
    return {
      error: `Contact name is too long (max ${LEAD_FIELD_LIMITS.contactName} characters).`,
    };
  }
  if (companyName && companyName.length > LEAD_FIELD_LIMITS.contactName) {
    return {
      error: `Company name is too long (max ${LEAD_FIELD_LIMITS.contactName} characters).`,
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
    data: {
      contact: {
        name: contactName,
        companyName,
        email,
        phone,
      } as Prisma.InputJsonValue,
    },
  });

  if (result.count === 0) {
    return { error: "Opportunity not found or could not be updated." };
  }

  return { success: true };
}

/**
 * Result type for {@link searchCustomersForLeadAttachAction}.
 */
export type CustomerSearchMatch = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

export type CustomerLinkPreview = {
  customer: CustomerSearchMatch;
  leadContact: {
    contactName: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    jobsiteAddressLine: string | null;
  };
  siteOutcome: LeadCustomerLinkSiteOutcome;
  siteOutcomeDescription: string;
  customerSiteCount: number;
};

export type LoadCustomerLinkPreviewResult =
  | { ok: true; preview: CustomerLinkPreview }
  | { ok: false; error: string };

/**
 * Read-only preview for customer + jobsite confirmation before linking.
 */
export async function loadCustomerLinkPreviewAction(
  leadId: string,
  customerId: string,
): Promise<LoadCustomerLinkPreviewResult> {
  const id = leadId.trim();
  const cid = customerId.trim();
  if (!id || !cid) {
    return { ok: false, error: "Missing lead or customer id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId, customerId: null },
    select: { contact: true, address: true, signals: true },
  });
  if (!lead) {
    return {
      ok: false,
      error: "This opportunity was not found or is already linked to a customer.",
    };
  }

  const customer = await db.customer.findFirst({
    where: { id: cid, organizationId: ctx.organizationId },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      email: true,
      phone: true,
      serviceLocations: {
        where: { organizationId: ctx.organizationId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          formattedAddress: true,
          addressLine1: true,
          googlePlaceId: true,
          isPrimary: true,
        },
      },
    },
  });
  if (!customer) {
    return { ok: false, error: "That customer was not found in your organization." };
  }

  const contact = readContact(lead.contact);
  const snapshot = intakeSnapshotFromLeadRow({
    address: lead.address,
    signals: lead.signals,
  });
  const siteOutcome = classifyLeadIntakeAgainstCustomerSites(
    snapshot,
    customer.serviceLocations,
  );

  return {
    ok: true,
    preview: {
      customer: {
        id: customer.id,
        displayName: customer.displayName,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
      },
      leadContact: {
        contactName: contact.name?.trim() || "",
        companyName: contact.companyName?.trim() || null,
        email: contact.email?.trim() || null,
        phone: contact.phone?.trim() || null,
        jobsiteAddressLine: jobsiteLineFromLead(lead),
      },
      siteOutcome,
      siteOutcomeDescription: describeLeadCustomerLinkSiteOutcome(siteOutcome),
      customerSiteCount: customer.serviceLocations.length,
    },
  };
}

export type SearchCustomersForLeadAttachResult =
  | { ok: true; matches: CustomerSearchMatch[] }
  | { ok: false; error: string };

/**
 * Searches for customers in the current organization by name, company, email, or phone.
 * Used by the Lead workspace Customer attach card for autocomplete.
 */
export async function searchCustomersForLeadAttachAction(
  query: string,
): Promise<SearchCustomersForLeadAttachResult> {
  const q = query.trim();
  if (!q) return { ok: true, matches: [] };

  const ctx = await getCommercialRequestContextOrThrow();

  try {
    const matches = await db.customer.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 10,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        email: true,
        phone: true,
      },
      orderBy: { displayName: "asc" },
    });

    return { ok: true, matches };
  } catch {
    return { ok: false, error: "Failed to search customers." };
  }
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
 *   - org-scoped via `getCommercialRequestContextOrThrow`
 *   - never trusts a client-supplied quote id; the active quote is derived
 *     server-side from the lead's quotes using the same
 *     server-side from the lead's quotes using the same
 *     `getOpportunityFlow` logic the other containers use
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

  const ctx = await getCommercialRequestContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      status: true,
      followUpAt: true,
      customerId: true,
      serviceLocationId: true,
      contact: true,
      address: true,
      signals: true,
      visitRequests: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          requestedDate: true,
          requestedWindow: true,
          confirmedDate: true,
          completedAt: true,
          createdAt: true,
        },
      },
      quotes: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          totalCents: true,
          createdAt: true,
          updatedAt: true,
          revisionOfQuoteId: true,
          revisionNumber: true,
          _count: { select: { lineItems: true } },
          job: { select: { id: true, status: true, organizationId: true } },
          checkpoints: {
            where: { kind: { in: ["SEND", "APPROVAL"] } },
            orderBy: { createdAt: "desc" },
            select: { kind: true, createdAt: true },
          },
          changeRequests: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              message: true,
              createdAt: true,
              resolvedAt: true,
              requiresVisit: true,
              resultingQuoteId: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    return { ok: false, error: "Opportunity not found in your organization." };
  }

  const contact = readContact(lead.contact);

  const flowQuoteInputs: OpportunityFlowQuoteInput[] = lead.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    lineItemCount: q._count.lineItems,
    totalCents: q.totalCents,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    revisionOfQuoteId: q.revisionOfQuoteId,
    revisionNumber: q.revisionNumber,
    latestSendAt: q.checkpoints.find((c) => c.kind === "SEND")?.createdAt ?? null,
    latestApprovalAt: q.checkpoints.find((c) => c.kind === "APPROVAL")?.createdAt ?? null,
    job:
      q.job && q.job.organizationId === ctx.organizationId
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const changeRequestInputs = lead.quotes.flatMap((quote) =>
    quote.changeRequests.map((request) => ({
      id: request.id,
      quoteId: quote.id,
      message: request.message,
      createdAt: request.createdAt,
      resolvedAt: request.resolvedAt,
      requiresVisit: request.requiresVisit,
      resultingQuoteId: request.resultingQuoteId,
    })),
  );

  let customerPrimaryLocation: { googlePlaceId: string } | null = null;
  let resolvedServiceLocation: { googlePlaceId: string } | null = null;
  if (lead.customerId) {
    if (lead.serviceLocationId) {
      resolvedServiceLocation = await db.customerServiceLocation.findFirst({
        where: {
          id: lead.serviceLocationId,
          customerId: lead.customerId,
          organizationId: ctx.organizationId,
        },
        select: { googlePlaceId: true },
      });
    }
    if (!resolvedServiceLocation) {
      customerPrimaryLocation = await db.customerServiceLocation.findFirst({
        where: { customerId: lead.customerId, organizationId: ctx.organizationId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { googlePlaceId: true },
      });
    }
  }

  const flow = getOpportunityFlow({
    lead: {
      id,
      status: lead.status,
      followUpAt: lead.followUpAt,
      customerId: lead.customerId,
      contactName: contact.name,
      companyName: contact.companyName,
      email: contact.email,
      phone: contact.phone,
      jobsiteAddressLine: jobsiteLineFromLead(lead),
      isAddressVerified: isLeadAddressQuoteReady(lead, {
        resolvedServiceLocation,
        customerPrimaryLocation,
      }),
    },
    quotes: flowQuoteInputs,
    visits: lead.visitRequests.map((visit) => ({
      id: visit.id,
      status: visit.status,
      requestedDate: visit.requestedDate,
      requestedWindow: visit.requestedWindow,
      confirmedDate: visit.confirmedDate,
      completedAt: visit.completedAt,
      createdAt: visit.createdAt,
    })),
    changeRequests: changeRequestInputs,
  });

  const targetQuoteId =
    flow.primaryAction?.targetQuoteId ??
    flow.secondaryActions.find((action) => action.targetQuoteId)?.targetQuoteId ??
    null;
  if (!targetQuoteId) {
    return { ok: true, payload: null };
  }

  const result = await loadQuoteWorkSurface(targetQuoteId, ctx.organizationId);
  return { ok: true, payload: result };
}

/**
 * Authorized server action to load the full LeadCommercialSurface payload.
 * Used by client-side triage views (Inbox, Leads list popup).
 */
export async function loadLeadCommercialSurfaceAction(
  leadId: string,
): Promise<{ ok: true; payload: LeadCommercialSurfacePayload } | { ok: false; error: string }> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getCommercialRequestContextOrThrow();

  const payload = await loadLeadCommercialSurface(id, ctx);
  if (!payload) {
    return { ok: false, error: "Opportunity not found in your organization." };
  }

  return { ok: true, payload };
}

export type RequestSiteVisitResult =
  | { ok: true; visitRequestId: string; created: boolean }
  | { ok: false; error: string };

/**
 * Creates a pending site visit request when none is open, or returns the existing
 * open request. Does not block quoting — discovery and estimating can overlap.
 */
export async function requestSiteVisitForLeadWorkspaceAction(
  leadId: string,
): Promise<RequestSiteVisitResult> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getCommercialMutationContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!lead) {
    return { ok: false, error: "Opportunity not found in your organization." };
  }
  if (lead.status === "LOST" || lead.status === "ARCHIVED") {
    return { ok: false, error: "Cannot schedule a visit on a closed opportunity." };
  }

  const existingOpen = await db.leadVisitRequest.findFirst({
    where: {
      organizationId: ctx.organizationId,
      leadId: id,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existingOpen) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/workstation");
    revalidatePath("/schedule");
    return { ok: true, visitRequestId: existingOpen.id, created: false };
  }

  const visit = await db.$transaction(async (tx) => {
    const created = await tx.leadVisitRequest.create({
      data: {
        organizationId: ctx.organizationId,
        leadId: id,
        purpose: "INITIAL_DISCOVERY",
        status: "PENDING",
      },
      select: { id: true },
    });

    await tx.leadEvent.create({
      data: {
        leadId: id,
        type: "SITE_VISIT_REQUESTED",
        payload: { visitRequestId: created.id } as Prisma.InputJsonValue,
        actorUserId: ctx.userId,
      },
    });

    return created;
  });

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  revalidatePath("/workstation");
  revalidatePath("/schedule");

  return { ok: true, visitRequestId: visit.id, created: true };
}

/**
 * Read-only loader for match hints. Used by the Leads list popup.
 */
export async function loadLeadMatchHintsAction(
  leadId: string,
): Promise<{ ok: true; hints: LeadCustomerMatchHints } | { ok: false; error: string }> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getCommercialRequestContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { email: true, phone: true },
  });

  if (!lead) return { ok: false, error: "Opportunity not found." };

  const customers = await db.customer.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { displayName: "asc" },
    take: 500,
    select: {
      id: true,
      displayName: true,
      companyName: true,
      email: true,
      phone: true,
    },
  });

  const hints = findCustomerMatchHints(
    customers,
    lead.email,
    lead.phone,
    500,
  );

  return { ok: true, hints };
}

/* ─── Service address ownership (Phase 2) ──────────────────────────────── */

/**
 * Serializable shape returned by {@link loadLeadServiceAddressContextAction}.
 *
 * `customer` carries the linked-customer service-locations panel data when a
 * customer is linked. `intake.defaultDisplayAddress` / `intake.structuredJson`
 * carry the lead's own intake address for the unlinked case (and as a hint
 * even when linked, for empty-state CTAs).
 */
export type LeadServiceLocationRowPayload = {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  source: CustomerServiceLocationSource;
  isPrimary: boolean;
  apn?: string | null;
  apnSourceTitle?: string | null;
  apnSourceUrl?: string | null;
  apnVerificationUrl?: string | null;
  apnConflict?: {
    value: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
  } | null;
  utilityName?: string | null;
  utilityOfficialWebsite?: string | null;
  utilityServiceUpgradeUrl?: string | null;
  utilityCoverageSourceTitle?: string | null;
  utilityCoverageSourceUrl?: string | null;
  jurisdictionName?: string | null;
  jurisdictionBuildingDepartmentName?: string | null;
  jurisdictionOfficialWebsite?: string | null;
  jurisdictionBuildingDepartmentUrl?: string | null;
  jurisdictionPermitPortalUrl?: string | null;
  jurisdictionFormsUrl?: string | null;
  jurisdictionInspectionsUrl?: string | null;
  assessorCounty?: string | null;
  assessorState?: string | null;
  assessorSearchUrl?: string | null;
  assessorParcelGisUrl?: string | null;
  detailsStatus?:
    | "DATABASE_MATCH"
    | "AI_FOUND"
    | "USER_REVIEWED"
    | "USER_CORRECTED"
    | "UNVERIFIED"
    | "CONFLICT"
    | "STALE";
  /** `channel` is the new field name; legacy `source` retained as an alias so callers can pick. */
  createdFromLead: { id: string; title: string; channel: LeadChannel; source?: LeadChannel } | null;
};

export type LeadServiceAddressContext = {
  /** When set, the Lead is linked to a customer; render the customer locations panel. */
  customer: {
    customerId: string;
    customerHref: string;
    serviceLocations: LeadServiceLocationRowPayload[];
  } | null;
  /** Always present so the unlinked inline editor can prefill, and so
   * post-link callers can compare against the customer's existing rows. */
  intake: {
    defaultDisplayAddress: string;
    structuredJson: string;
  };
};

export type LoadLeadServiceAddressContextResult =
  | { ok: true; context: LeadServiceAddressContext }
  | { ok: false; error: string };

function intakePayloadFromLeadRow(row: {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
}): { defaultDisplayAddress: string; structuredJson: string } {
  const snapshot = intakeSnapshotForCustomerFromLead({
    address: row.address,
    signals: row.signals,
  });
  if (!snapshot) return { defaultDisplayAddress: "", structuredJson: "" };
  const display = snapshot.formattedAddress.trim() || snapshot.addressLine1.trim();
  return { defaultDisplayAddress: display, structuredJson: JSON.stringify(snapshot) };
}

/**
 * Read-only loader for the Lead workspace Service address block.
 *
 * Returns the linked customer's service-location rows when applicable plus
 * the intake snapshot for prefill — never trusts a client-supplied customer
 * id, never mutates. Org-scoped via `getCommercialRequestContextOrThrow`.
 */
export async function loadLeadServiceAddressContextAction(
  leadId: string,
): Promise<LoadLeadServiceAddressContextResult> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getCommercialRequestContextOrThrow();
  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      customerId: true,
      address: true,
      signals: true,
      customer: {
        select: {
          id: true,
          organizationId: true,
          serviceLocations: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              formattedAddress: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              postalCode: true,
              country: true,
              googlePlaceId: true,
              latitude: true,
              longitude: true,
              source: true,
              isPrimary: true,
              apn: true,
              detailsStatus: true,
              utility: { select: { name: true } },
              jurisdiction: { select: { name: true } },
              createdFromLead: { select: { id: true, title: true, channel: true } },
            },
          },
        },
      },
    },
  });

  if (!lead) return { ok: false, error: "Opportunity not found in your organization." };

  const intake = intakePayloadFromLeadRow({
    address: lead.address,
    signals: lead.signals,
  });

  if (
    lead.customerId &&
    lead.customer &&
    lead.customer.organizationId === ctx.organizationId
  ) {
    return {
      ok: true,
      context: {
        customer: {
          customerId: lead.customer.id,
          customerHref: `/customers/${lead.customer.id}`,
          serviceLocations: lead.customer.serviceLocations.map((loc) => ({
            id: loc.id,
            formattedAddress: loc.formattedAddress,
            addressLine1: loc.addressLine1,
            addressLine2: loc.addressLine2,
            city: loc.city,
            state: loc.state,
            postalCode: loc.postalCode,
            country: loc.country,
            googlePlaceId: loc.googlePlaceId,
            latitude: loc.latitude,
            longitude: loc.longitude,
            source: loc.source,
            isPrimary: loc.isPrimary,
            apn: loc.apn,
            apnSourceTitle: null,
            apnSourceUrl: null,
            apnVerificationUrl: null,
            apnConflict: null,
            utilityName: loc.utility?.name ?? null,
            utilityOfficialWebsite: null,
            utilityServiceUpgradeUrl: null,
            utilityCoverageSourceTitle: null,
            utilityCoverageSourceUrl: null,
            jurisdictionName: loc.jurisdiction?.name ?? null,
            jurisdictionBuildingDepartmentName: null,
            jurisdictionOfficialWebsite: null,
            jurisdictionBuildingDepartmentUrl: null,
            jurisdictionPermitPortalUrl: null,
            jurisdictionFormsUrl: null,
            jurisdictionInspectionsUrl: null,
            assessorCounty: null,
            assessorState: null,
            assessorSearchUrl: null,
            assessorParcelGisUrl: null,
            detailsStatus: loc.detailsStatus,
            createdFromLead: loc.createdFromLead
              ? {
                  id: loc.createdFromLead.id,
                  title: loc.createdFromLead.title,
                  channel: loc.createdFromLead.channel,
                }
              : null,
          })),
        },
        intake,
      },
    };
  }

  return { ok: true, context: { customer: null, intake } };
}

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") return "";
  return value.trim();
}

/**
 * Updates `Lead.publicIntakeServiceLocation` for an unlinked lead in-place.
 * Used by the Lead workspace Service address block when no customer is linked
 * yet — same parsing path as the staff lead form (`updateLeadAction`) and the
 * public intake form, so the snapshot is identical regardless of entry point.
 *
 * Returns `{ success: true }` on success instead of redirecting.
 * `leadId` must be supplied via `.bind(null, lead.id)` or as the first arg
 * from a server-trusted surface — never trust a client-supplied id.
 *
 * If the visible address field is cleared (empty string), the snapshot is
 * cleared (`Prisma.JsonNull`). Empty + already-empty is rejected so the user
 * gets a clear message instead of a no-op success.
 */
export async function updateLeadServiceAddressWorkspaceAction(
  leadId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  void _prevState;
  const id = leadId.trim();
  if (!id) return { error: "Missing lead record id." };

  const ctx = await getCommercialMutationContextOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, address: true },
  });
  if (!existing) return { error: "Opportunity not found in your organization." };

  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  const { snapshot, serviceAddressText } =
    resolveServiceLocationSnapshotFromFormData(formData);

  if (serviceAddressText.length > LEAD_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${LEAD_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
    };
  }

  const wantsClear = serviceAddressText === "" && rawLocationJson === "";
  const previouslyHadValue =
    parseStoredPublicIntakeServiceLocation(existing.address) != null;

  if (wantsClear && !previouslyHadValue) {
    return { error: "Enter a service address." };
  }

  let address:
    | Prisma.InputJsonValue
    | typeof Prisma.JsonNull
    | undefined;
  let savedSnapshot: PublicIntakeServiceLocationV1 | null = null;

  if (wantsClear) {
    address = Prisma.JsonNull;
  } else if (
    snapshot &&
    (snapshot.formattedAddress.trim().length > 0 || snapshot.addressLine1.trim().length > 0)
  ) {
    address = snapshot as unknown as Prisma.InputJsonValue;
    savedSnapshot = snapshot;
  } else {
    return {
      error: "That address could not be saved. Check the address and try again.",
    };
  }

  const writeResult = await db.$transaction(async (tx) => {
    const existingLead = await tx.lead.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { customerId: true, channel: true, serviceLocationId: true },
    });
    if (!existingLead) {
      return { updated: false as const, locationId: null as string | null };
    }
    let resolvedLocationId: string | null = existingLead.serviceLocationId;
    if (savedSnapshot) {
      resolvedLocationId = await ensureServiceLocationForLeadFromSnapshot(tx, {
        organizationId: ctx.organizationId,
        leadId: id,
        leadChannel: existingLead.channel,
        customerId: existingLead.customerId,
        snapshot: savedSnapshot,
      });
    }
    const writeResult = await tx.lead.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { address },
    });
    if (writeResult.count === 0) {
      return { updated: false as const, locationId: null as string | null };
    }
    if (savedSnapshot) {
      await tx.lead.update({
        where: { id },
        data: { serviceLocationId: resolvedLocationId },
      });
    }
    return { updated: true as const, locationId: resolvedLocationId };
  });

  if (!writeResult.updated) {
    return { error: "Opportunity not found or could not be updated." };
  }

  /* If the lead is already linked to a customer, propagate the new intake
   * snapshot to that customer's service locations using the same dedupe path
   * the link / create-customer flows use. Keeps lead-level edits in sync
   * with the customer profile without forcing the user to re-link. */
  if (savedSnapshot) {
    const linked = await db.lead.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { customerId: true, channel: true, serviceLocationId: true },
    });
    if (linked?.customerId) {
      try {
        await db.$transaction(async (tx) => {
          const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
            organizationId: ctx.organizationId,
            customerId: linked.customerId as string,
            leadId: id,
            leadChannel: linked.channel,
            snapshot: savedSnapshot,
          });
          if (attached.locationId && linked.serviceLocationId !== attached.locationId) {
            await tx.lead.update({
              where: { id },
              data: { serviceLocationId: attached.locationId },
            });
          }
        });
      } catch {
        /* Soft-fail propagation — lead update already succeeded; the user can
         * still see the new intake address on the lead, and the customer
         * sync will reconcile on next link / refresh. */
      }
    }
  }

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

  return { success: true };
}

export type ResolveLeadServiceAddressResult =
  | { ok: true; status: "already_verified" }
  | { ok: true; status: "resolved"; formattedAddress: string }
  | {
      ok: true;
      status: "suggest";
      candidates: Array<{ placeId: string; formattedAddress: string }>;
    }
  | { ok: true; status: "failed"; reason?: string }
  | { ok: false; error: string };

async function persistLeadServiceAddressSnapshot(params: {
  leadId: string;
  organizationId: string;
  userId: string;
  snapshot: PublicIntakeServiceLocationV1;
  eventDetail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { leadId, organizationId, userId, snapshot, eventDetail } = params;
  const address = snapshot as unknown as Prisma.InputJsonValue;

  const writeResult = await db.$transaction(async (tx) => {
    const existingLead = await tx.lead.findFirst({
      where: { id: leadId, organizationId },
      select: { customerId: true, channel: true, serviceLocationId: true },
    });
    if (!existingLead) {
      return { updated: false as const, customerId: null as string | null, channel: null as LeadChannel | null };
    }

    const resolvedLocationId = await ensureServiceLocationForLeadFromSnapshot(tx, {
      organizationId,
      leadId,
      leadChannel: existingLead.channel,
      customerId: existingLead.customerId,
      snapshot,
    });

    const writeCount = await tx.lead.updateMany({
      where: { id: leadId, organizationId },
      data: { address },
    });
    if (writeCount.count === 0) {
      return { updated: false as const, customerId: null as string | null, channel: null as LeadChannel | null };
    }

    await tx.lead.update({
      where: { id: leadId },
      data: { serviceLocationId: resolvedLocationId },
    });

    await tx.leadEvent.create({
      data: {
        leadId,
        type: "UPDATED",
        payload: {
          field: "serviceAddress",
          detail: eventDetail,
          googlePlaceId: snapshot.googlePlaceId,
        } as Prisma.InputJsonValue,
        actorUserId: userId,
      },
    });

    return {
      updated: true as const,
      customerId: existingLead.customerId,
      channel: existingLead.channel,
    };
  });

  if (!writeResult.updated) {
    return { ok: false, error: "Opportunity not found or could not be updated." };
  }

  if (writeResult.customerId && writeResult.channel) {
    try {
      await db.$transaction(async (tx) => {
        const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
          organizationId,
          customerId: writeResult.customerId as string,
          leadId,
          leadChannel: writeResult.channel as LeadChannel,
          snapshot,
        });
        if (attached.locationId) {
          await tx.lead.update({
            where: { id: leadId },
            data: { serviceLocationId: attached.locationId },
          });
        }
      });
    } catch {
      /* Soft-fail customer propagation. */
    }
  }

  revalidateLeadAndQuoteSurfaces(leadId, null);
  return { ok: true };
}

function mapResolveResult(
  result: GeocodeResolveResult,
): Exclude<ResolveLeadServiceAddressResult, { ok: false; error: string }> {
  if (result.status === "resolved") {
    return {
      ok: true,
      status: "resolved",
      formattedAddress:
        result.snapshot.formattedAddress.trim() || result.snapshot.addressLine1,
    };
  }
  if (result.status === "suggest") {
    return {
      ok: true,
      status: "suggest",
      candidates: result.candidates.map((c) => ({
        placeId: c.placeId,
        formattedAddress: c.formattedAddress,
      })),
    };
  }
  return { ok: true, status: "failed", reason: result.reason };
}

/**
 * Attempts to auto-clean a partial lead service address via Google Geocoding.
 * When Google returns one confident match, persists the enriched snapshot automatically.
 */
export async function resolveLeadServiceAddressAction(
  leadId: string,
): Promise<ResolveLeadServiceAddressResult> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };

  const ctx = await getCommercialMutationContextOrThrow();
  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, address: true, signals: true, customerId: true },
  });
  if (!lead) return { ok: false, error: "Opportunity not found in your organization." };
  if (lead.customerId) {
    return { ok: true, status: "already_verified" };
  }
  if (isLeadAddressVerified(lead)) {
    return { ok: true, status: "already_verified" };
  }

  const addressLine = jobsiteLineFromLead(lead);
  if (!addressLine?.trim()) {
    return { ok: true, status: "failed", reason: "empty_address" };
  }

  const snapshot = intakeSnapshotForCustomerFromLead(lead);
  const geocodeResult = await resolveAddressViaGeocode({
    addressLine,
    snapshot,
  });

  if (geocodeResult.status === "resolved") {
    const persisted = await persistLeadServiceAddressSnapshot({
      leadId: id,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      snapshot: geocodeResult.snapshot,
      eventDetail: "Service address auto-verified via Google Geocoding.",
    });
    if (!persisted.ok) return { ok: false, error: persisted.error };
    return mapResolveResult(geocodeResult);
  }

  return mapResolveResult(geocodeResult);
}

/**
 * Applies a staff-selected Google place candidate to the lead service address.
 */
export async function applyLeadServiceAddressCandidateAction(
  leadId: string,
  placeId: string,
): Promise<{ ok: true; formattedAddress: string } | { ok: false; error: string }> {
  const id = leadId.trim();
  const pid = placeId.trim();
  if (!id) return { ok: false, error: "Missing lead id." };
  if (!pid) return { ok: false, error: "Missing place id." };

  const ctx = await getCommercialMutationContextOrThrow();
  const lead = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, customerId: true },
  });
  if (!lead) return { ok: false, error: "Opportunity not found in your organization." };
  if (lead.customerId) {
    return {
      ok: false,
      error: "This request is linked to a customer. Manage the address on the customer record.",
    };
  }

  const snapshot = await fetchSnapshotByPlaceId(pid);
  if (!snapshot) {
    return { ok: false, error: "That address could not be loaded from Google. Try another option." };
  }

  const persisted = await persistLeadServiceAddressSnapshot({
    leadId: id,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    snapshot,
    eventDetail: "Service address verified from Google candidate selection.",
  });
  if (!persisted.ok) return { ok: false, error: persisted.error };

  return {
    ok: true,
    formattedAddress: snapshot.formattedAddress.trim() || snapshot.addressLine1,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { performCreateQuoteDraftFromSalesIntake } from "@/app/(workspace)/quotes/quote-form-actions";

/**
 * Workspace-safe sales intake server actions.
 *
 * These mirror the logic in `sales-form-actions.ts` but return a result object
 * instead of calling `redirect()`, so they can be used from the in-place
 * Customer/Sales Intake Workspace dialog without navigating away.  After a successful
 * action the caller is responsible for calling `router.refresh()` to reload
 * server-component data.
 */

import {
  CustomerServiceLocationSource,
  SalesIntakeSource,
  SalesIntakeStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { prepareCustomerFromSalesIntake } from "@/lib/sales-intake-create-customer";
import {
  attachIntakeServiceLocationToCustomerFromSalesIntake,
  intakeSnapshotForCustomerFromSalesIntake,
} from "@/lib/customer-service-location-from-sales-intake";
import {
  getSalesIntakeCommercialProgress,
  type SalesIntakeProgressQuoteInput,
} from "@/lib/sales-commercial-progress";
import {
  loadQuoteWorkSurface,
  type QuoteWorkSurfaceLoaderResult,
} from "@/lib/quote-work-surface-loader";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
import {
  parseStoredPublicIntakeServiceLocation,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";
import { SALES_INTAKE_FIELD_LIMITS } from "./sales-field-limits";

const SALES_INTAKE_STATUS_SET = new Set<string>(Object.values(SalesIntakeStatus));

export type WorkspaceFormState = {
  error?: string;
  success?: boolean;
};

/**
 * Result type for {@link loadSalesIntakeActiveQuoteWorkSurfaceAction}.
 * Read-only loader; never throws across the action boundary.
 */
export type LoadSalesIntakeActiveQuoteWorkSurfaceResult =
  | { ok: true; payload: QuoteWorkSurfaceLoaderResult | null }
  | { ok: false; error: string };

export type CreateQuoteFromSalesIntakeWorkspaceResult =
  | { success: true; quoteId: string }
  | { success: false; error: string };

function revalidateSalesIntakeAndQuoteSurfaces(salesIntakeId: string, quoteId: string) {
  const lid = salesIntakeId.trim();
  const qid = quoteId.trim();
  revalidatePath("/sales");
  if (lid) {
    revalidatePath(`/sales/${lid}`);
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
 * Creates (or reuses) the org-scoped active draft quote for a sales intake — same rules
 * as `/quotes/new?salesIntakeId=…` without redirecting. Caller should `router.refresh()`
 * and reload the active quote payload for the embedded {@link QuoteWorkSurface}.
 *
 * `salesIntakeId` must be supplied from a trusted server-rendered surface (bound in
 * the client), never from an arbitrary org id.
 */
export async function createQuoteFromSalesIntakeWorkspaceAction(
  salesIntakeId: string,
): Promise<CreateQuoteFromSalesIntakeWorkspaceResult> {
  const result = await performCreateQuoteDraftFromSalesIntake(salesIntakeId);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidateSalesIntakeAndQuoteSurfaces(salesIntakeId, result.quoteId);
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
  if (value.length > SALES_INTAKE_FIELD_LIMITS.email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Creates a Customer from sales intake data and links the sales intake in one transaction.
 * Returns `{ success: true }` on success instead of redirecting.
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` before passing to
 * `useActionState`.
 */
export async function createCustomerFromSalesIntakeWorkspaceAction(
  salesIntakeId: string,
  _prevState: WorkspaceFormState,
  _formData: FormData,
): Promise<WorkspaceFormState> {
  void _prevState;
  void _formData;
  const id = salesIntakeId.trim();
  if (!id) return { error: "Missing sales intake record id." };

  const ctx = await getRequestContextOrThrow();

  let createdCustomerId: string | undefined;

  try {
    await db.$transaction(async (tx) => {
      const salesIntake = await tx.salesIntake.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: {
          customerId: true,
          title: true,
          contactName: true,
          email: true,
          phone: true,
          notes: true,
          source: true,
          publicIntakeServiceLocation: true,
        },
      });

      if (!salesIntake) {
        throw new WorkspaceTxError("This sales intake was not found in your organization.");
      }
      if (salesIntake.customerId != null) {
        throw new WorkspaceTxError("This sales intake is already linked to a customer.");
      }

      const prep = prepareCustomerFromSalesIntake(salesIntake);
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

      const result = await tx.salesIntake.updateMany({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        data: { customerId: customer.id, convertedAt: new Date() },
      });

      if (result.count === 0) {
        throw new WorkspaceTxError(
          "Could not link this sales intake—it may have been linked already. Refresh and try again.",
        );
      }

      await attachIntakeServiceLocationToCustomerFromSalesIntake(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        salesIntakeId: id,
        salesIntakeSource: salesIntake.source,
        snapshot: intakeSnapshotForCustomerFromSalesIntake(salesIntake),
      });
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
  }

  if (createdCustomerId) {
    revalidatePath(`/customers/${createdCustomerId}`);
    revalidatePath("/customers");
  }
  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

  return { success: true };
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") return "";
  return value.trim();
}

/**
 * Links an org-scoped customer to a sales intake with `customerId` null.
 * Returns `{ success: true }` instead of redirecting — caller should `router.refresh()`.
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)`.
 */
export async function linkSalesIntakeToCustomerWorkspaceAction(
  salesIntakeId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = salesIntakeId.trim();
  if (!id) return { error: "Missing sales intake record id." };

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

  const salesIntakePeek = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { customerId: true },
  });
  if (!salesIntakePeek) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (salesIntakePeek.customerId != null) {
    return { error: "This sales intake is already linked to a customer. Unlinking is not available yet." };
  }

  const convertedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      const salesIntake = await tx.salesIntake.findFirst({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        select: { id: true, notes: true, publicIntakeServiceLocation: true, source: true },
      });
      if (!salesIntake) {
        throw new WorkspaceTxError(
          "This sales intake could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      const result = await tx.salesIntake.updateMany({
        where: { id, organizationId: ctx.organizationId, customerId: null },
        data: { customerId: customer.id, convertedAt },
      });
      if (result.count === 0) {
        throw new WorkspaceTxError(
          "This sales intake could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      await attachIntakeServiceLocationToCustomerFromSalesIntake(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        salesIntakeId: id,
        salesIntakeSource: salesIntake.source,
        snapshot: intakeSnapshotForCustomerFromSalesIntake(salesIntake),
      });
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/customers/${customer.id}`);
  revalidatePath("/customers");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

  return { success: true };
}

/**
 * Updates only `status` for an org-scoped sales intake (same rules as `updateSalesIntakeStatusAction` in
 * `sales-form-actions.ts`) but returns `{ success: true }` instead of redirecting.
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)`.
 */
export async function updateSalesIntakeStatusWorkspaceAction(
  salesIntakeId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = salesIntakeId.trim();
  if (!id) {
    return { error: "Missing sales intake record id." };
  }

  const rawStatus = formData.get("status");
  if (rawStatus == null || typeof rawStatus !== "string") {
    return { error: "Choose a status, then try again." };
  }
  const v = rawStatus.trim();
  if (!v || !SALES_INTAKE_STATUS_SET.has(v)) {
    return {
      error:
        "That status is not valid. Choose Open, Qualifying, Converted, Lost, or Archived.",
    };
  }
  const status = v as SalesIntakeStatus;

  const ctx = await getRequestContextOrThrow();

  const exists = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const result = await db.salesIntake.updateMany({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    data: { status },
  });

  if (result.count === 0) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  return { success: true };
}

/**
 * Updates a sales intake's contact fields (name, email, phone) in-place.
 * Returns `{ success: true }` on success instead of redirecting.
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)`.
 */
export async function updateSalesIntakeContactWorkspaceAction(
  salesIntakeId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const id = salesIntakeId.trim();
  if (!id) return { error: "Missing sales intake record id." };

  const ctx = await getRequestContextOrThrow();

  const exists = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!exists) return { error: "Sales intake not found in your organization." };

  const contactName = trimOrNull(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));

  if (contactName && contactName.length > SALES_INTAKE_FIELD_LIMITS.contactName) {
    return {
      error: `Contact name is too long (max ${SALES_INTAKE_FIELD_LIMITS.contactName} characters).`,
    };
  }
  if (email && !isReasonableEmail(email)) {
    return { error: "Enter a valid email address, or leave the field blank." };
  }
  if (phone && phone.length > SALES_INTAKE_FIELD_LIMITS.phone) {
    return {
      error: `Phone is too long (max ${SALES_INTAKE_FIELD_LIMITS.phone} characters).`,
    };
  }

  const result = await db.salesIntake.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: { contactName, email, phone },
  });

  if (result.count === 0) {
    return { error: "Sales intake not found or could not be updated." };
  }

  return { success: true };
}

/**
 * Result type for {@link searchCustomersForSalesIntakeAttachAction}.
 */
export type CustomerSearchMatch = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

export type SearchCustomersForSalesIntakeAttachResult =
  | { ok: true; matches: CustomerSearchMatch[] }
  | { ok: false; error: string };

/**
 * Searches for customers in the current organization by name, company, email, or phone.
 * Used by the Sales Intake workspace Customer attach card for autocomplete.
 */
export async function searchCustomersForSalesIntakeAttachAction(
  query: string,
): Promise<SearchCustomersForSalesIntakeAttachResult> {
  const q = query.trim();
  if (!q) return { ok: true, matches: [] };

  const ctx = await getRequestContextOrThrow();

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
  } catch (e) {
    return { ok: false, error: "Failed to search customers." };
  }
}

/**
 * Read-only loader for the Sales Intakes list popup Quote tab.
 *
 * Lazily produces a `QuoteWorkSurface` payload for the selected sales intake's active
 * linked quote *without* preloading readiness for every sales intake row. Containers
 * that already have the payload server-side (Workstation sales intake drawer, Sales Intake
 * full page) do not need this — they pass `activeQuoteWorkSurface` directly.
 *
 * Security:
 *   - org-scoped via `getRequestContextOrThrow`
 *   - never trusts a client-supplied quote id; the active quote is derived
 *     server-side from the sales intake's quotes using the same
 *     `getSalesIntakeCommercialProgress` logic the other containers use
 *   - read-only — no mutations, no `revalidatePath`, no `redirect`
 *   - `loadQuoteWorkSurface` re-validates the quote's organization scope
 *
 * Returns `{ ok: true, payload: null }` when the sales intake has no active quote
 * (e.g. only archived quotes or no quotes at all).
 */
export async function loadSalesIntakeActiveQuoteWorkSurfaceAction(
  salesIntakeId: string,
): Promise<LoadSalesIntakeActiveQuoteWorkSurfaceResult> {
  const id = salesIntakeId.trim();
  if (!id) return { ok: false, error: "Missing sales intake id." };

  const ctx = await getRequestContextOrThrow();

  const salesIntake = await db.salesIntake.findFirst({
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

  if (!salesIntake) {
    return { ok: false, error: "Sales intake not found in your organization." };
  }

  const progressQuoteInputs: SalesIntakeProgressQuoteInput[] = salesIntake.quotes.map((q) => ({
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

  const progress = getSalesIntakeCommercialProgress({
    salesIntake: {
      status: salesIntake.status,
      customerId: salesIntake.customerId,
      email: salesIntake.email,
      phone: salesIntake.phone,
    },
    quotes: progressQuoteInputs,
  });

  if (!progress.activeQuote) {
    return { ok: true, payload: null };
  }

  const result = await loadQuoteWorkSurface(progress.activeQuote.id, ctx.organizationId);
  return { ok: true, payload: result };
}

/* ─── Service address ownership (Phase 2) ──────────────────────────────── */

/**
 * Serializable shape returned by {@link loadSalesIntakeServiceAddressContextAction}.
 *
 * `customer` carries the linked-customer service-locations panel data when a
 * customer is linked. `intake.defaultDisplayAddress` / `intake.structuredJson`
 * carry the sales intake's own intake address for the unlinked case (and as a hint
 * even when linked, for empty-state CTAs).
 */
export type SalesIntakeServiceLocationRowPayload = {
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
  createdFromSalesIntake: { id: string; title: string; source: SalesIntakeSource } | null;
};

export type SalesIntakeServiceAddressContext = {
  /** When set, the Sales Intake is linked to a customer; render the customer locations panel. */
  customer: {
    customerId: string;
    customerHref: string;
    serviceLocations: SalesIntakeServiceLocationRowPayload[];
  } | null;
  /** Always present so the unlinked inline editor can prefill, and so
   * post-link callers can compare against the customer's existing rows. */
  intake: {
    defaultDisplayAddress: string;
    structuredJson: string;
  };
};

export type LoadSalesIntakeServiceAddressContextResult =
  | { ok: true; context: SalesIntakeServiceAddressContext }
  | { ok: false; error: string };

function intakePayloadFromSalesIntakeRow(row: {
  publicIntakeServiceLocation: Prisma.JsonValue | null;
  notes: string | null;
}): { defaultDisplayAddress: string; structuredJson: string } {
  const snapshot = intakeSnapshotForCustomerFromSalesIntake({
    publicIntakeServiceLocation: row.publicIntakeServiceLocation,
    notes: row.notes,
  });
  if (!snapshot) return { defaultDisplayAddress: "", structuredJson: "" };
  const display = snapshot.formattedAddress.trim() || snapshot.addressLine1.trim();
  return { defaultDisplayAddress: display, structuredJson: JSON.stringify(snapshot) };
}

/**
 * Read-only loader for the Sales Intake workspace Service address block.
 *
 * Returns the linked customer's service-location rows when applicable plus
 * the intake snapshot for prefill — never trusts a client-supplied customer
 * id, never mutates. Org-scoped via `getRequestContextOrThrow`.
 */
export async function loadSalesIntakeServiceAddressContextAction(
  salesIntakeId: string,
): Promise<LoadSalesIntakeServiceAddressContextResult> {
  const id = salesIntakeId.trim();
  if (!id) return { ok: false, error: "Missing sales intake id." };

  const ctx = await getRequestContextOrThrow();
  const salesIntake = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      customerId: true,
      notes: true,
      publicIntakeServiceLocation: true,
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
              createdFromSalesIntake: { select: { id: true, title: true, source: true } },
            },
          },
        },
      },
    },
  });

  if (!salesIntake) return { ok: false, error: "Sales intake not found in your organization." };

  const intake = intakePayloadFromSalesIntakeRow({
    publicIntakeServiceLocation: salesIntake.publicIntakeServiceLocation,
    notes: salesIntake.notes,
  });

  if (
    salesIntake.customerId &&
    salesIntake.customer &&
    salesIntake.customer.organizationId === ctx.organizationId
  ) {
    return {
      ok: true,
      context: {
        customer: {
          customerId: salesIntake.customer.id,
          customerHref: `/customers/${salesIntake.customer.id}`,
          serviceLocations: salesIntake.customer.serviceLocations.map((loc) => ({
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
            createdFromSalesIntake: loc.createdFromSalesIntake
              ? {
                  id: loc.createdFromSalesIntake.id,
                  title: loc.createdFromSalesIntake.title,
                  source: loc.createdFromSalesIntake.source,
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
 * Updates `SalesIntake.publicIntakeServiceLocation` for an unlinked sales intake in-place.
 * Used by the Sales Intake workspace Service address block when no customer is linked
 * yet — same parsing path as the staff sales intake form (`updateSalesIntakeAction`) and the
 * public intake form, so the snapshot is identical regardless of entry point.
 *
 * Returns `{ success: true }` on success instead of redirecting.
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` or as the first arg
 * from a server-trusted surface — never trust a client-supplied id.
 *
 * If the visible address field is cleared (empty string), the snapshot is
 * cleared (`Prisma.JsonNull`). Empty + already-empty is rejected so the user
 * gets a clear message instead of a no-op success.
 */
export async function updateSalesIntakeServiceAddressWorkspaceAction(
  salesIntakeId: string,
  _prevState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  void _prevState;
  const id = salesIntakeId.trim();
  if (!id) return { error: "Missing sales intake record id." };

  const ctx = await getRequestContextOrThrow();
  const existing = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, publicIntakeServiceLocation: true },
  });
  if (!existing) return { error: "Sales intake not found in your organization." };

  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  const { snapshot, serviceAddressText } =
    resolveServiceLocationSnapshotFromFormData(formData);

  if (serviceAddressText.length > SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
    };
  }

  const wantsClear = serviceAddressText === "" && rawLocationJson === "";
  const previouslyHadValue =
    parseStoredPublicIntakeServiceLocation(existing.publicIntakeServiceLocation) != null;

  if (wantsClear && !previouslyHadValue) {
    return { error: "Enter a service address." };
  }

  let publicIntakeServiceLocation:
    | Prisma.InputJsonValue
    | typeof Prisma.JsonNull
    | undefined;
  let savedSnapshot: PublicIntakeServiceLocationV1 | null = null;

  if (wantsClear) {
    publicIntakeServiceLocation = Prisma.JsonNull;
  } else if (
    snapshot &&
    (snapshot.formattedAddress.trim().length > 0 || snapshot.addressLine1.trim().length > 0)
  ) {
    publicIntakeServiceLocation = snapshot as unknown as Prisma.InputJsonValue;
    savedSnapshot = snapshot;
  } else {
    return {
      error: "That address could not be saved. Check the address and try again.",
    };
  }

  const result = await db.salesIntake.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: { publicIntakeServiceLocation },
  });

  if (result.count === 0) {
    return { error: "Sales intake not found or could not be updated." };
  }

  /* If the sales intake is already linked to a customer, propagate the new intake
   * snapshot to that customer's service locations using the same dedupe path
   * the link / create-customer flows use. Keeps sales intake-level edits in sync
   * with the customer profile without forcing the user to re-link. */
  if (savedSnapshot) {
    const linked = await db.salesIntake.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { customerId: true, source: true },
    });
    if (linked?.customerId) {
      try {
        await db.$transaction(async (tx) => {
          await attachIntakeServiceLocationToCustomerFromSalesIntake(tx, {
            organizationId: ctx.organizationId,
            customerId: linked.customerId as string,
            salesIntakeId: id,
            salesIntakeSource: linked.source,
            snapshot: savedSnapshot,
          });
        });
      } catch {
        /* Soft-fail propagation — sales intake update already succeeded; the user can
         * still see the new intake address on the sales intake, and the customer
         * sync will reconcile on next link / refresh. */
      }
    }
  }

  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath("/workstation");

  return { success: true };
}

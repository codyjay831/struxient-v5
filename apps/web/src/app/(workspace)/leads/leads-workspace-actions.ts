"use server";

/**
 * Workspace-safe lead server actions.
 *
 * These mirror the logic in `lead-form-actions.ts` but return a result object
 * instead of calling `redirect()`, so they can be used from the in-place
 * Customer/Lead Workspace dialog without navigating away.  After a successful
 * action the caller is responsible for calling `router.refresh()` to reload
 * server-component data.
 */

import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";

export type WorkspaceFormState = {
  error?: string;
  success?: boolean;
};

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

  const org = await getDevOrganizationOrThrow();

  try {
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id, organizationId: org.id },
        select: {
          customerId: true,
          title: true,
          contactName: true,
          email: true,
          phone: true,
          notes: true,
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
          organizationId: org.id,
          ...prep.data,
        },
      });

      const result = await tx.lead.updateMany({
        where: { id, organizationId: org.id, customerId: null },
        data: { customerId: customer.id, convertedAt: new Date() },
      });

      if (result.count === 0) {
        throw new WorkspaceTxError(
          "Could not link this lead—it may have been linked already. Refresh and try again.",
        );
      }
    });
  } catch (e) {
    if (e instanceof WorkspaceTxError) return { error: e.message };
    throw e;
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

  const org = await getDevOrganizationOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: org.id },
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
    where: { id, organizationId: org.id },
    data: { contactName, email, phone },
  });

  if (result.count === 0) {
    return { error: "Lead not found or could not be updated." };
  }

  return { success: true };
}

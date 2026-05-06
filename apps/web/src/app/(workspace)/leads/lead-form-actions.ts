"use server";

import { LeadSource, LeadStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { LEAD_FIELD_LIMITS } from "./lead-field-limits";

class CreateFromLeadTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateFromLeadTransactionError";
  }
}

export type LeadFormState = {
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

function enforceMaxLength(label: string, value: string, max: number): LeadFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/** Same pragmatic rule as customer create/update. */
function isReasonableEmail(value: string): boolean {
  if (value.length > LEAD_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const LEAD_SOURCE_SET = new Set<string>(Object.values(LeadSource));

const LEAD_STATUS_SET = new Set<string>(Object.values(LeadStatus));

function parseLeadSource(raw: FormDataEntryValue | null): LeadSource {
  if (raw == null || typeof raw !== "string") {
    return LeadSource.MANUAL;
  }
  const v = raw.trim();
  if (!v || !LEAD_SOURCE_SET.has(v)) {
    return LeadSource.MANUAL;
  }
  return v as LeadSource;
}

/**
 * On update, missing or invalid `source` values keep the stored enum — safer than forcing
 * MANUAL when the field is absent or tampered with (create still defaults to MANUAL).
 */
function parseLeadSourceForUpdate(
  raw: FormDataEntryValue | null,
  previous: LeadSource,
): LeadSource {
  if (raw == null || typeof raw !== "string") {
    return previous;
  }
  const v = raw.trim();
  if (!v || !LEAD_SOURCE_SET.has(v)) {
    return previous;
  }
  return v as LeadSource;
}

export async function createLeadAction(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, LEAD_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const org = await getDevOrganizationOrThrow();

  const contactName = trimOrNull(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const sourceDetail = trimOrNull(formData.get("sourceDetail"));
  const notes = trimOrNull(formData.get("notes"));
  const source = parseLeadSource(formData.get("source"));

  if (contactName) {
    const err = enforceMaxLength("Contact name", contactName, LEAD_FIELD_LIMITS.contactName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, LEAD_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, LEAD_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (sourceDetail) {
    const err = enforceMaxLength("Source detail", sourceDetail, LEAD_FIELD_LIMITS.sourceDetail);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Notes", notes, LEAD_FIELD_LIMITS.notes);
    if (err) {
      return err;
    }
  }

  const lead = await db.lead.create({
    data: {
      organizationId: org.id,
      title,
      contactName,
      email,
      phone,
      source,
      sourceDetail,
      notes,
    },
  });

  redirect(`/leads/${lead.id}`);
}

/**
 * `leadId` must be supplied via `.bind(null, lead.id)` from the lead detail route.
 * Updates only `status` — does not touch customerId, convertedAt, or other fields.
 */
export async function updateLeadStatusAction(
  leadId: string,
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
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

  const org = await getDevOrganizationOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: org.id },
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
      organizationId: org.id,
    },
    data: { status },
  });

  if (result.count === 0) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  redirect(`/leads/${id}`);
}

/**
 * `leadId` must be supplied via `.bind(null, lead.id)` from the edit route so the record key
 * cannot be swapped client-side to update a different row in the same org.
 */
export async function updateLeadAction(
  leadId: string,
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const id = leadId.trim();
  if (!id) {
    return { error: "Missing lead record id." };
  }

  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, LEAD_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const org = await getDevOrganizationOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: org.id },
    select: { source: true },
  });
  if (!existing) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const contactName = trimOrNull(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const sourceDetail = trimOrNull(formData.get("sourceDetail"));
  const notes = trimOrNull(formData.get("notes"));
  const source = parseLeadSourceForUpdate(formData.get("source"), existing.source);

  if (contactName) {
    const err = enforceMaxLength("Contact name", contactName, LEAD_FIELD_LIMITS.contactName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, LEAD_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, LEAD_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (sourceDetail) {
    const err = enforceMaxLength("Source detail", sourceDetail, LEAD_FIELD_LIMITS.sourceDetail);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Notes", notes, LEAD_FIELD_LIMITS.notes);
    if (err) {
      return err;
    }
  }

  const result = await db.lead.updateMany({
    where: {
      id,
      organizationId: org.id,
    },
    data: {
      title,
      contactName,
      email,
      phone,
      source,
      sourceDetail,
      notes,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  redirect(`/leads/${id}`);
}

/**
 * `leadId` must be supplied via `.bind(null, lead.id)` from the lead detail route.
 * Links an org-scoped customer to a lead that is not yet linked (`customerId` null only).
 */
export async function linkLeadToCustomerAction(
  leadId: string,
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const id = leadId.trim();
  if (!id) {
    return { error: "Missing lead record id." };
  }

  const customerIdRaw = trimRequired(formData.get("customerId"));
  if (!customerIdRaw) {
    return { error: "Choose a customer to link, or create one first." };
  }

  const org = await getDevOrganizationOrThrow();

  const customer = await db.customer.findFirst({
    where: {
      id: customerIdRaw,
      organizationId: org.id,
    },
    select: { id: true },
  });
  if (!customer) {
    return {
      error: "That customer was not found in your organization. It may belong to another tenant.",
    };
  }

  const lead = await db.lead.findFirst({
    where: {
      id,
      organizationId: org.id,
    },
    select: { customerId: true },
  });
  if (!lead) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (lead.customerId != null) {
    return {
      error: "This lead is already linked to a customer. Unlinking is not available yet.",
    };
  }

  const convertedAt = new Date();
  const result = await db.lead.updateMany({
    where: {
      id,
      organizationId: org.id,
      customerId: null,
    },
    data: {
      customerId: customer.id,
      convertedAt,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This lead could not be linked. It may have been linked already—refresh the page and try again.",
    };
  }

  redirect(`/leads/${id}`);
}

/**
 * `leadId` must be supplied via `.bind(null, lead.id)` from the lead detail route.
 * Creates a Customer from the lead’s fields and links the lead in one transaction.
 */
export async function createCustomerFromLeadAction(
  leadId: string,
  _prevState: LeadFormState,
  _formData: FormData,
): Promise<LeadFormState> {
  void _prevState;
  void _formData;
  const id = leadId.trim();
  if (!id) {
    return { error: "Missing lead record id." };
  }

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
        throw new CreateFromLeadTransactionError(
          "This lead was not found in your organization.",
        );
      }
      if (lead.customerId != null) {
        throw new CreateFromLeadTransactionError(
          "This lead is already linked to a customer.",
        );
      }

      const prep = prepareCustomerFromLead(lead);
      if (!prep.ok) {
        throw new CreateFromLeadTransactionError(prep.error);
      }

      const customer = await tx.customer.create({
        data: {
          organizationId: org.id,
          ...prep.data,
        },
      });

      const convertedAt = new Date();
      const result = await tx.lead.updateMany({
        where: {
          id,
          organizationId: org.id,
          customerId: null,
        },
        data: {
          customerId: customer.id,
          convertedAt,
        },
      });

      if (result.count === 0) {
        throw new CreateFromLeadTransactionError(
          "Could not link this lead—it may have been linked elsewhere. Refresh and try again.",
        );
      }
    });
  } catch (e) {
    if (e instanceof CreateFromLeadTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/leads/${id}`);
}

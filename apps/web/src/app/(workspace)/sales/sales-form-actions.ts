"use server";

import { LeadSource, LeadStatus, NeededByBucket, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer-from-lead";
import {
  attachIntakeServiceLocationToCustomer,
  intakeSnapshotForCustomerFromLead,
} from "@/lib/customer-service-location-from-lead";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
import { LEAD_FIELD_LIMITS } from "./sales-field-limits";


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

function trimOrEmpty(value: FormDataEntryValue | null): string {
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

  const ctx = await getRequestContextOrThrow();

  const contactName = trimOrNull(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const requestType = trimOrNull(formData.get("requestType"));
  const neededByBucketRaw = trimOrNull(formData.get("neededByBucket"));
  const neededByDateRaw = trimOrNull(formData.get("neededByDate"));
  const scopeSummary = trimOrNull(formData.get("scopeSummary"));
  const suggestedTemplateIdsRaw = trimOrEmpty(formData.get("suggestedTemplateIds"));
  const suggestedTemplateIds = suggestedTemplateIdsRaw ? suggestedTemplateIdsRaw.split(",") : [];
  const sourceDetail = trimOrNull(formData.get("sourceDetail"));

  const requestedDateRaw = trimOrNull(formData.get("requestedVisitDate"));
  const requestedWindow = trimOrNull(formData.get("requestedVisitWindow"));
  const visitNotes = trimOrNull(formData.get("requestedVisitNotes"));

  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("customField_") && typeof value === "string") {
      const fieldDefId = key.replace("customField_", "");
      customFields[fieldDefId] = value;
    }
  }
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
  if (requestType) {
    const err = enforceMaxLength("Request type", requestType, LEAD_FIELD_LIMITS.requestType);
    if (err) {
      return err;
    }
  }
  if (scopeSummary) {
    const err = enforceMaxLength("Scope summary", scopeSummary, LEAD_FIELD_LIMITS.scopeSummary);
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

  let neededByBucket: NeededByBucket | null = null;
  if (neededByBucketRaw && Object.values(NeededByBucket).includes(neededByBucketRaw as NeededByBucket)) {
    neededByBucket = neededByBucketRaw as NeededByBucket;
  }

  let neededByDate: Date | null = null;
  if (neededByDateRaw) {
    const d = new Date(neededByDateRaw);
    if (!isNaN(d.getTime())) {
      neededByDate = d;
    }
  }

  const attachmentIdsRaw = trimOrEmpty(formData.get("attachmentIds"));
  const attachmentIds = attachmentIdsRaw ? attachmentIdsRaw.split(",") : [];

  const { snapshot, serviceAddressText } = resolveServiceLocationSnapshotFromFormData(formData);
  if (serviceAddressText.length > LEAD_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${LEAD_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
    };
  }
  const hasStructuredAddress = Boolean(
    snapshot &&
      (snapshot.formattedAddress.trim().length > 0 || snapshot.addressLine1.trim().length > 0),
  );

  const lead = await db.$transaction(async (tx) => {
    const l = await tx.lead.create({
      data: {
        organizationId: ctx.organizationId,
        title,
        contactName,
        email,
        phone,
        requestType,
        neededByBucket,
        neededByDate,
        scopeSummary,
        suggestedTemplateIds,
        source,
        sourceDetail,
        notes,
        publicIntakeServiceLocation:
          hasStructuredAddress && snapshot
            ? (snapshot as unknown as Prisma.InputJsonValue)
            : undefined,
      },
    });

    if (attachmentIds.length > 0) {
      await tx.attachment.updateMany({
        where: {
          id: { in: attachmentIds },
          organizationId: ctx.organizationId,
          leadId: null,
        },
        data: {
          leadId: l.id,
          status: "READY",
        },
      });
    }

    if (requestedDateRaw || requestedWindow) {
      let requestedDate: Date | null = null;
      if (requestedDateRaw) {
        const d = new Date(requestedDateRaw);
        if (!isNaN(d.getTime())) {
          requestedDate = d;
        }
      }

      await tx.leadVisitRequest.create({
        data: {
          organizationId: ctx.organizationId,
          leadId: l.id,
          requestedDate,
          requestedWindow,
          notes: visitNotes,
        },
      });
    }

    for (const [fieldDefId, value] of Object.entries(customFields)) {
      if (value.trim()) {
        await tx.leadCustomFieldValue.create({
          data: {
            leadId: l.id,
            fieldDefId,
            value: value.trim(),
          },
        });
      }
    }

    return l;
  });


  redirect(`/sales/${lead.id}`);
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

  redirect(`/sales/${id}`);
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

  const ctx = await getRequestContextOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
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
  const requestType = trimOrNull(formData.get("requestType"));
  const neededByBucketRaw = trimOrNull(formData.get("neededByBucket"));
  const neededByDateRaw = trimOrNull(formData.get("neededByDate"));
  const scopeSummary = trimOrNull(formData.get("scopeSummary"));
  const suggestedTemplateIdsRaw = trimOrEmpty(formData.get("suggestedTemplateIds"));
  const suggestedTemplateIds = suggestedTemplateIdsRaw ? suggestedTemplateIdsRaw.split(",") : [];
  const sourceDetail = trimOrNull(formData.get("sourceDetail"));

  const requestedDateRaw = trimOrNull(formData.get("requestedVisitDate"));
  const requestedWindow = trimOrNull(formData.get("requestedVisitWindow"));
  const visitNotes = trimOrNull(formData.get("requestedVisitNotes"));

  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("customField_") && typeof value === "string") {
      const fieldDefId = key.replace("customField_", "");
      customFields[fieldDefId] = value;
    }
  }
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
  if (requestType) {
    const err = enforceMaxLength("Request type", requestType, LEAD_FIELD_LIMITS.requestType);
    if (err) {
      return err;
    }
  }
  if (scopeSummary) {
    const err = enforceMaxLength("Scope summary", scopeSummary, LEAD_FIELD_LIMITS.scopeSummary);
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

  let neededByBucket: NeededByBucket | null = null;
  if (neededByBucketRaw && Object.values(NeededByBucket).includes(neededByBucketRaw as NeededByBucket)) {
    neededByBucket = neededByBucketRaw as NeededByBucket;
  }

  let neededByDate: Date | null = null;
  if (neededByDateRaw) {
    const d = new Date(neededByDateRaw);
    if (!isNaN(d.getTime())) {
      neededByDate = d;
    }
  }

  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  const attachmentIdsRaw = trimOrEmpty(formData.get("attachmentIds"));
  const attachmentIds = attachmentIdsRaw ? attachmentIdsRaw.split(",") : [];

  const { snapshot, serviceAddressText } = resolveServiceLocationSnapshotFromFormData(formData);
  if (serviceAddressText.length > LEAD_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${LEAD_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
    };
  }

  let publicIntakeServiceLocation: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
  if (serviceAddressText === "" && rawLocationJson === "") {
    publicIntakeServiceLocation = Prisma.JsonNull;
  } else if (
    snapshot &&
    (snapshot.formattedAddress.trim().length > 0 || snapshot.addressLine1.trim().length > 0)
  ) {
    publicIntakeServiceLocation = snapshot as unknown as Prisma.InputJsonValue;
  } else {
    publicIntakeServiceLocation = undefined;
  }

  const result = await db.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({
      where: {
        id,
        organizationId: ctx.organizationId,
      },
      data: {
        title,
        contactName,
        email,
        phone,
        requestType,
        neededByBucket,
        neededByDate,
        scopeSummary,
        suggestedTemplateIds,
        source,
        sourceDetail,
        notes,
        ...(publicIntakeServiceLocation !== undefined
          ? { publicIntakeServiceLocation }
          : {}),
      },
    });

    if (attachmentIds.length > 0) {
      await tx.attachment.updateMany({
        where: {
          id: { in: attachmentIds },
          organizationId: ctx.organizationId,
          leadId: null,
        },
        data: {
          leadId: id,
          status: "READY",
        },
      });
    }

    if (requestedDateRaw || requestedWindow) {
      let requestedDate: Date | null = null;
      if (requestedDateRaw) {
        const d = new Date(requestedDateRaw);
        if (!isNaN(d.getTime())) {
          requestedDate = d;
        }
      }

      // v1: update only creates if none exists, or updates the latest pending one
      const existing = await tx.leadVisitRequest.findFirst({
        where: { leadId: id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        await tx.leadVisitRequest.update({
          where: { id: existing.id },
          data: {
            requestedDate,
            requestedWindow,
            notes: visitNotes,
          },
        });
      } else {
        await tx.leadVisitRequest.create({
          data: {
            organizationId: ctx.organizationId,
            leadId: id,
            requestedDate,
            requestedWindow,
            notes: visitNotes,
          },
        });
      }
    }

    for (const [fieldDefId, value] of Object.entries(customFields)) {
      if (value.trim()) {
        await tx.leadCustomFieldValue.upsert({
          where: { leadId_fieldDefId: { leadId: id, fieldDefId } },
          update: { value: value.trim() },
          create: { leadId: id, fieldDefId, value: value.trim() },
        });
      } else {
        await tx.leadCustomFieldValue.deleteMany({
          where: { leadId: id, fieldDefId },
        });
      }
    }

    return res;
  });


  if (result.count === 0) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  redirect(`/sales/${id}`);
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

  const ctx = await getRequestContextOrThrow();

  const customer = await db.customer.findFirst({
    where: {
      id: customerIdRaw,
      organizationId: ctx.organizationId,
    },
    select: { id: true },
  });
  if (!customer) {
    return {
      error: "That customer was not found in your organization. It may belong to another tenant.",
    };
  }

  const leadPeek = await db.lead.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    select: { customerId: true },
  });
  if (!leadPeek) {
    return {
      error:
        "This lead was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (leadPeek.customerId != null) {
    return {
      error: "This lead is already linked to a customer. Unlinking is not available yet.",
    };
  }

  const convertedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          customerId: null,
        },
        select: { id: true, notes: true, publicIntakeServiceLocation: true, source: true },
      });
      if (!lead) {
        throw new CreateFromLeadTransactionError(
          "This lead could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      const result = await tx.lead.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          customerId: null,
        },
        data: {
          customerId: customer.id,
          convertedAt,
          status: "CONVERTED",
        },
      });
      if (result.count === 0) {
        throw new CreateFromLeadTransactionError(
          "This lead could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      await attachIntakeServiceLocationToCustomer(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        leadId: id,
        leadSource: lead.source,
        snapshot: intakeSnapshotForCustomerFromLead(lead),
      });
    });
  } catch (e) {
    if (e instanceof CreateFromLeadTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/sales/${id}`);
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
          source: true,
          publicIntakeServiceLocation: true,
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
          organizationId: ctx.organizationId,
          ...prep.data,
        },
      });

      const convertedAt = new Date();
      const result = await tx.lead.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          customerId: null,
        },
        data: {
          customerId: customer.id,
          convertedAt,
          status: "CONVERTED",
        },
      });


      if (result.count === 0) {
        throw new CreateFromLeadTransactionError(
          "Could not link this lead—it may have been linked elsewhere. Refresh and try again.",
        );
      }

      await attachIntakeServiceLocationToCustomer(tx, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        leadId: id,
        leadSource: lead.source,
        snapshot: intakeSnapshotForCustomerFromLead(lead),
      });
    });
  } catch (e) {
    if (e instanceof CreateFromLeadTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/sales/${id}`);
}

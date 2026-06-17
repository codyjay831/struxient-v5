"use server";

import { LeadChannel, LeadStatus, NeededByBucket, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prepareCustomerFromLead } from "@/lib/lead-create-customer";
import {
  readContact,
  readRequest,
  readSignals,
} from "@/lib/lead/lead-projection";
import {
  attachIntakeServiceLocationToCustomerFromLead,
  intakeSnapshotForCustomerFromLead,
} from "@/lib/customer-service-location-from-lead";
import { db } from "@/lib/db";
import { finalizeLeadAttachments } from "@/lib/finalize-lead-attachments";
import { getCommercialRequestContextOrThrow } from "@/lib/auth-context";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
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

const LEAD_SOURCE_SET = new Set<string>(Object.values(LeadChannel));

const LEAD_STATUS_SET = new Set<string>(Object.values(LeadStatus));

/**
 * On update, missing or invalid `source` values keep the stored enum — safer than forcing
 * MANUAL when the field is absent or tampered with.
 */
function parseLeadChannelForUpdate(
  raw: FormDataEntryValue | null,
  previous: LeadChannel,
): LeadChannel {
  if (raw == null || typeof raw !== "string") {
    return previous;
  }
  const v = raw.trim();
  if (!v || !LEAD_SOURCE_SET.has(v)) {
    return previous;
  }
  return v as LeadChannel;
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
    return { error: "Missing sales record id." };
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

  const ctx = await getCommercialRequestContextOrThrow();

  const exists = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!exists) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const now = new Date();
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

  await db.leadEvent.create({
    data: {
      leadId: id,
      type: "STATUS_CHANGED",
      payload: {
        from: exists.status,
        to: status,
      } as Prisma.InputJsonValue,
      actorUserId: ctx.userId,
    },
  });


  if (result.count === 0) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
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
    return { error: "Missing sales record id." };
  }

  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, LEAD_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const ctx = await getCommercialRequestContextOrThrow();
  const existing = await db.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { channel: true },
  });
  if (!existing) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  const contactName = trimOrNull(formData.get("contactName"));
  const companyName = trimOrNull(formData.get("companyName"));
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
  const channel = parseLeadChannelForUpdate(formData.get("source"), existing.channel);

  if (contactName) {
    const err = enforceMaxLength("Contact name", contactName, LEAD_FIELD_LIMITS.contactName);
    if (err) {
      return err;
    }
  }
  if (companyName) {
    const err = enforceMaxLength("Company name", companyName, LEAD_FIELD_LIMITS.contactName);
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
    const err = enforceMaxLength("Channel detail", sourceDetail, LEAD_FIELD_LIMITS.sourceDetail);
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
        contact: {
          name: contactName,
          companyName,
          email,
          phone,
        } as Prisma.InputJsonValue,
        request: {
          type: requestType,
          neededByBucket,
          neededByDate,
          scope: scopeSummary,
          suggestedTemplateIds,
        } as Prisma.InputJsonValue,
        channel,
        signals: {
          sourceDetail,
          notes,
        } as Prisma.InputJsonValue,
        ...(publicIntakeServiceLocation !== undefined
          ? { address: publicIntakeServiceLocation }
          : {}),
      },
    });

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
            purpose: "INITIAL_DISCOVERY",
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

      await tx.leadEvent.create({
        data: {
          leadId: id,
          type: "UPDATED",
          payload: {
            contactName,
            companyName,
            email,
            phone,
            requestType,
            channel,
          } as Prisma.InputJsonValue,
          actorUserId: ctx.userId,
        },
      });

    return res;
  });


  if (result.count === 0) {
    return {
      error:
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  if (attachmentIds.length > 0) {
    await finalizeLeadAttachments({
      organizationId: ctx.organizationId,
      leadId: id,
      attachmentIds,
      uploadedByUserId: ctx.userId,
    });
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
    return { error: "Missing sales record id." };
  }

  const customerIdRaw = trimRequired(formData.get("customerId"));
  if (!customerIdRaw) {
    return { error: "Choose a customer to link, or create one first." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

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
        "This opportunity was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (leadPeek.customerId != null) {
    return {
      error: "This opportunity is already linked to a customer. Unlinking is not available yet.",
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
        select: { id: true, address: true, signals: true, channel: true },
      });
      if (!lead) {
        throw new CreateFromLeadTransactionError(
          "This opportunity could not be linked. It may have been linked already—refresh the page and try again.",
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
          "This opportunity could not be linked. It may have been linked already—refresh the page and try again.",
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

      await tx.leadEvent.create({
        data: {
          leadId: id,
          type: "LINKED_TO_CUSTOMER",
          payload: { customerId: customer.id } as Prisma.InputJsonValue,
          actorUserId: ctx.userId,
        },
      });
    });
  } catch (e) {
    if (e instanceof CreateFromLeadTransactionError) {
      return { error: e.message };
    }
    throw e;
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
    return { error: "Missing sales record id." };
  }

  const ctx = await getCommercialRequestContextOrThrow();

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
        throw new CreateFromLeadTransactionError(
          "This opportunity was not found in your organization.",
        );
      }
      if (lead.customerId != null) {
        throw new CreateFromLeadTransactionError(
          "This opportunity is already linked to a customer.",
        );
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
          "Could not link this opportunity—it may have been linked elsewhere. Refresh and try again.",
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

      await tx.leadEvent.create({
        data: {
          leadId: id,
          type: "CONVERTED_TO_CUSTOMER",
          payload: { customerId: customer.id } as Prisma.InputJsonValue,
          actorUserId: ctx.userId,
        },
      });
    });
  } catch (e) {
    if (e instanceof CreateFromLeadTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/leads/${id}`);
}

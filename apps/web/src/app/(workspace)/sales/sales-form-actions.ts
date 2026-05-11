"use server";

import { SalesIntakeSource, SalesIntakeStatus, NeededByBucket, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prepareCustomerFromSalesIntake } from "@/lib/sales-intake-create-customer";
import {
  attachIntakeServiceLocationToCustomerFromSalesIntake,
  intakeSnapshotForCustomerFromSalesIntake,
} from "@/lib/customer-service-location-from-sales-intake";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { resolveServiceLocationSnapshotFromFormData } from "@/lib/service-address-form";
import { SALES_INTAKE_FIELD_LIMITS } from "./sales-field-limits";


class CreateFromSalesIntakeTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateFromSalesIntakeTransactionError";
  }
}

export type SalesIntakeFormState = {
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

function enforceMaxLength(label: string, value: string, max: number): SalesIntakeFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/** Same pragmatic rule as customer create/update. */
function isReasonableEmail(value: string): boolean {
  if (value.length > SALES_INTAKE_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const SALES_INTAKE_SOURCE_SET = new Set<string>(Object.values(SalesIntakeSource));

const SALES_INTAKE_STATUS_SET = new Set<string>(Object.values(SalesIntakeStatus));

function parseSalesIntakeSource(raw: FormDataEntryValue | null): SalesIntakeSource {
  if (raw == null || typeof raw !== "string") {
    return SalesIntakeSource.MANUAL;
  }
  const v = raw.trim();
  if (!v || !SALES_INTAKE_SOURCE_SET.has(v)) {
    return SalesIntakeSource.MANUAL;
  }
  return v as SalesIntakeSource;
}

/**
 * On update, missing or invalid `source` values keep the stored enum — safer than forcing
 * MANUAL when the field is absent or tampered with (create still defaults to MANUAL).
 */
function parseSalesIntakeSourceForUpdate(
  raw: FormDataEntryValue | null,
  previous: SalesIntakeSource,
): SalesIntakeSource {
  if (raw == null || typeof raw !== "string") {
    return previous;
  }
  const v = raw.trim();
  if (!v || !SALES_INTAKE_SOURCE_SET.has(v)) {
    return previous;
  }
  return v as SalesIntakeSource;
}

export async function createSalesIntakeAction(
  _prevState: SalesIntakeFormState,
  formData: FormData,
): Promise<SalesIntakeFormState> {
  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, SALES_INTAKE_FIELD_LIMITS.title);
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
  const source = parseSalesIntakeSource(formData.get("source"));

  if (contactName) {
    const err = enforceMaxLength("Contact name", contactName, SALES_INTAKE_FIELD_LIMITS.contactName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, SALES_INTAKE_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, SALES_INTAKE_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (requestType) {
    const err = enforceMaxLength("Request type", requestType, SALES_INTAKE_FIELD_LIMITS.requestType);
    if (err) {
      return err;
    }
  }
  if (scopeSummary) {
    const err = enforceMaxLength("Scope summary", scopeSummary, SALES_INTAKE_FIELD_LIMITS.scopeSummary);
    if (err) {
      return err;
    }
  }
  if (sourceDetail) {
    const err = enforceMaxLength("Source detail", sourceDetail, SALES_INTAKE_FIELD_LIMITS.sourceDetail);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Notes", notes, SALES_INTAKE_FIELD_LIMITS.notes);
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
  if (serviceAddressText.length > SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
    };
  }
  const hasStructuredAddress = Boolean(
    snapshot &&
      (snapshot.formattedAddress.trim().length > 0 || snapshot.addressLine1.trim().length > 0),
  );

  const salesIntake = await db.$transaction(async (tx) => {
    const l = await tx.salesIntake.create({
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
          salesIntakeId: null,
        },
        data: {
          salesIntakeId: l.id,
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

      await tx.salesVisitRequest.create({
        data: {
          organizationId: ctx.organizationId,
          salesIntakeId: l.id,
          requestedDate,
          requestedWindow,
          notes: visitNotes,
        },
      });
    }

    for (const [fieldDefId, value] of Object.entries(customFields)) {
      if (value.trim()) {
        await tx.salesCustomFieldValue.create({
          data: {
            salesIntakeId: l.id,
            fieldDefId,
            value: value.trim(),
          },
        });
      }
    }

    return l;
  });


  redirect(`/sales/${salesIntake.id}`);
}

/**
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` from the sales intake detail route.
 * Updates only `status` — does not touch customerId, convertedAt, or other fields.
 */
export async function updateSalesIntakeStatusAction(
  salesIntakeId: string,
  _prevState: SalesIntakeFormState,
  formData: FormData,
): Promise<SalesIntakeFormState> {
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

  redirect(`/sales/${id}`);
}

/**
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` from the edit route so the record key
 * cannot be swapped client-side to update a different row in the same org.
 */
export async function updateSalesIntakeAction(
  salesIntakeId: string,
  _prevState: SalesIntakeFormState,
  formData: FormData,
): Promise<SalesIntakeFormState> {
  const id = salesIntakeId.trim();
  if (!id) {
    return { error: "Missing sales intake record id." };
  }

  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, SALES_INTAKE_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const ctx = await getRequestContextOrThrow();
  const existing = await db.salesIntake.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { source: true },
  });
  if (!existing) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
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
  const source = parseSalesIntakeSourceForUpdate(formData.get("source"), existing.source);

  if (contactName) {
    const err = enforceMaxLength("Contact name", contactName, SALES_INTAKE_FIELD_LIMITS.contactName);
    if (err) {
      return err;
    }
  }
  if (email) {
    const err = enforceMaxLength("Email", email, SALES_INTAKE_FIELD_LIMITS.email);
    if (err) {
      return err;
    }
    if (!isReasonableEmail(email)) {
      return { error: "Enter a valid email address, or leave the field blank." };
    }
  }
  if (phone) {
    const err = enforceMaxLength("Phone", phone, SALES_INTAKE_FIELD_LIMITS.phone);
    if (err) {
      return err;
    }
  }
  if (requestType) {
    const err = enforceMaxLength("Request type", requestType, SALES_INTAKE_FIELD_LIMITS.requestType);
    if (err) {
      return err;
    }
  }
  if (scopeSummary) {
    const err = enforceMaxLength("Scope summary", scopeSummary, SALES_INTAKE_FIELD_LIMITS.scopeSummary);
    if (err) {
      return err;
    }
  }
  if (sourceDetail) {
    const err = enforceMaxLength("Source detail", sourceDetail, SALES_INTAKE_FIELD_LIMITS.sourceDetail);
    if (err) {
      return err;
    }
  }
  if (notes) {
    const err = enforceMaxLength("Notes", notes, SALES_INTAKE_FIELD_LIMITS.notes);
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
  if (serviceAddressText.length > SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress) {
    return {
      error: `Service address is too long (max ${SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress} characters).`,
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
    const res = await tx.salesIntake.updateMany({
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
          salesIntakeId: null,
        },
        data: {
          salesIntakeId: id,
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
      const existing = await tx.salesVisitRequest.findFirst({
        where: { salesIntakeId: id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        await tx.salesVisitRequest.update({
          where: { id: existing.id },
          data: {
            requestedDate,
            requestedWindow,
            notes: visitNotes,
          },
        });
      } else {
        await tx.salesVisitRequest.create({
          data: {
            organizationId: ctx.organizationId,
            salesIntakeId: id,
            requestedDate,
            requestedWindow,
            notes: visitNotes,
          },
        });
      }
    }

    for (const [fieldDefId, value] of Object.entries(customFields)) {
      if (value.trim()) {
        await tx.salesCustomFieldValue.upsert({
          where: { salesIntakeId_fieldDefId: { salesIntakeId: id, fieldDefId } },
          update: { value: value.trim() },
          create: { salesIntakeId: id, fieldDefId, value: value.trim() },
        });
      } else {
        await tx.salesCustomFieldValue.deleteMany({
          where: { salesIntakeId: id, fieldDefId },
        });
      }
    }

    return res;
  });


  if (result.count === 0) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }

  redirect(`/sales/${id}`);
}

/**
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` from the sales intake detail route.
 * Links an org-scoped customer to a sales intake that is not yet linked (`customerId` null only).
 */
export async function linkSalesIntakeToCustomerAction(
  salesIntakeId: string,
  _prevState: SalesIntakeFormState,
  formData: FormData,
): Promise<SalesIntakeFormState> {
  const id = salesIntakeId.trim();
  if (!id) {
    return { error: "Missing sales intake record id." };
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

  const salesIntakePeek = await db.salesIntake.findFirst({
    where: {
      id,
      organizationId: ctx.organizationId,
    },
    select: { customerId: true },
  });
  if (!salesIntakePeek) {
    return {
      error:
        "This sales intake was not updated. It may not exist in your organization or may belong to another tenant.",
    };
  }
  if (salesIntakePeek.customerId != null) {
    return {
      error: "This sales intake is already linked to a customer. Unlinking is not available yet.",
    };
  }

  const convertedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      const salesIntake = await tx.salesIntake.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          customerId: null,
        },
        select: { id: true, notes: true, publicIntakeServiceLocation: true, source: true },
      });
      if (!salesIntake) {
        throw new CreateFromSalesIntakeTransactionError(
          "This sales intake could not be linked. It may have been linked already—refresh the page and try again.",
        );
      }
      const result = await tx.salesIntake.updateMany({
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
        throw new CreateFromSalesIntakeTransactionError(
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
    if (e instanceof CreateFromSalesIntakeTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/sales/${id}`);
}

/**
 * `salesIntakeId` must be supplied via `.bind(null, salesIntake.id)` from the sales intake detail route.
 * Creates a Customer from the sales intake’s fields and links the sales intake in one transaction.
 */
export async function createCustomerFromSalesIntakeAction(
  salesIntakeId: string,
  _prevState: SalesIntakeFormState,
  _formData: FormData,
): Promise<SalesIntakeFormState> {
  void _prevState;
  void _formData;
  const id = salesIntakeId.trim();
  if (!id) {
    return { error: "Missing sales intake record id." };
  }

  const ctx = await getRequestContextOrThrow();

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
        throw new CreateFromSalesIntakeTransactionError(
          "This sales intake was not found in your organization.",
        );
      }
      if (salesIntake.customerId != null) {
        throw new CreateFromSalesIntakeTransactionError(
          "This sales intake is already linked to a customer.",
        );
      }

      const prep = prepareCustomerFromSalesIntake(salesIntake);
      if (!prep.ok) {
        throw new CreateFromSalesIntakeTransactionError(prep.error);
      }

      const customer = await tx.customer.create({
        data: {
          organizationId: ctx.organizationId,
          ...prep.data,
        },
      });

      const convertedAt = new Date();
      const result = await tx.salesIntake.updateMany({
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
        throw new CreateFromSalesIntakeTransactionError(
          "Could not link this sales intake—it may have been linked elsewhere. Refresh and try again.",
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
    if (e instanceof CreateFromSalesIntakeTransactionError) {
      return { error: e.message };
    }
    throw e;
  }

  redirect(`/sales/${id}`);
}

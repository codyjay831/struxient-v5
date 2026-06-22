"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CustomerPortalEventType, CustomerRequestType } from "@prisma/client";
import {
  CustomerPortalAccessDeniedError,
  requireCustomerPortalAccess,
} from "@/lib/customer-portal/authorize";
import {
  openChangeOrderFromPortal,
  openQuoteFromPortal,
} from "@/lib/customer-portal/commercial-navigation-service";
import { createCustomerRequest } from "@/lib/customer-portal/request-service";
import { confirmCustomerAppointment } from "@/lib/customer-portal/schedule-service";
import {
  completeCustomerPortalUpload,
  prepareCustomerPortalUpload,
} from "@/lib/customer-portal/upload-service";
import { appendCustomerPortalEvent } from "@/lib/customer-portal/event-service";
import { checkRateLimit } from "@/lib/rate-limit";

export type PortalRequestFormState = {
  error?: string;
  success?: boolean;
};

const RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyPrefix: "customer-portal-request",
};

const UPLOAD_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 15,
  keyPrefix: "customer-portal-upload",
};

const COMMERCIAL_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyPrefix: "customer-portal-commercial",
};

export async function openQuoteFromPortalAction(accessId: string): Promise<void> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!(await checkRateLimit(`${accessId}:quote:${ip}`, COMMERCIAL_RATE_LIMIT))) {
    throw new Error("Too many requests. Please try again later.");
  }

  const session = await requireCustomerPortalAccess({ accessId });
  const { redirectPath } = await openQuoteFromPortal(
    session,
    ip,
    headerList.get("user-agent"),
  );
  redirect(redirectPath);
}

export async function openChangeOrderFromPortalAction(
  accessId: string,
  changeOrderId: string,
): Promise<void> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!(await checkRateLimit(`${accessId}:co:${ip}`, COMMERCIAL_RATE_LIMIT))) {
    throw new Error("Too many requests. Please try again later.");
  }

  const session = await requireCustomerPortalAccess({ accessId });
  const { redirectPath } = await openChangeOrderFromPortal(
    session,
    changeOrderId,
    ip,
    headerList.get("user-agent"),
  );
  redirect(redirectPath);
}

export async function submitCustomerPortalRequestAction(
  accessId: string,
  _prev: PortalRequestFormState,
  formData: FormData,
): Promise<PortalRequestFormState> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!(await checkRateLimit(`${accessId}:${ip}`, RATE_LIMIT))) {
    return { error: "Too many requests. Please try again later." };
  }

  const type = String(formData.get("type") ?? "") as CustomerRequestType;
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!title || title.length < 3) {
    return { error: "Please enter a short title." };
  }
  if (!message || message.length < 5) {
    return { error: "Please enter a brief message." };
  }

  try {
    const session = await requireCustomerPortalAccess({ accessId });
    await createCustomerRequest({
      session,
      type,
      title,
      message,
      ipAddress: ip,
      userAgent: headerList.get("user-agent"),
    });
    revalidatePath(`/portal/project/${accessId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { error: error.message };
    }
    return { error: "Could not submit your request." };
  }
}

export async function confirmCustomerAppointmentAction(
  accessId: string,
  scheduleEventId: string,
): Promise<PortalRequestFormState> {
  const headerList = await headers();
  try {
    const session = await requireCustomerPortalAccess({ accessId });
    await confirmCustomerAppointment({
      session,
      scheduleEventId,
      ipAddress: headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: headerList.get("user-agent"),
    });
    revalidatePath(`/portal/project/${accessId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { error: error.message };
    }
    return { error: "Could not confirm appointment." };
  }
}

export async function submitScheduleCustomerRequestAction(
  accessId: string,
  formData: FormData,
): Promise<PortalRequestFormState> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!(await checkRateLimit(`${accessId}:schedule:${ip}`, RATE_LIMIT))) {
    return { error: "Too many requests. Please try again later." };
  }

  const type = String(formData.get("type") ?? "") as CustomerRequestType;
  const scheduleEventId = String(formData.get("scheduleEventId") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim();

  if (!message || message.length < 5) {
    return { error: "Please enter a brief message." };
  }

  const typeConfig: Partial<
    Record<CustomerRequestType, { title: string; allowed: boolean }>
  > = {
    REQUEST_RESCHEDULE: { title: "Reschedule request", allowed: true },
    SUBMIT_AVAILABILITY: { title: "Availability submitted", allowed: true },
    ADD_ACCESS_NOTE: { title: "Site access note", allowed: true },
  };
  const config = typeConfig[type];
  if (!config?.allowed) {
    return { error: "Invalid request type." };
  }

  try {
    const session = await requireCustomerPortalAccess({ accessId });
    await createCustomerRequest({
      session,
      type,
      title: config.title,
      message,
      metadataJson: scheduleEventId ? { scheduleEventId } : undefined,
      ipAddress: ip,
      userAgent: headerList.get("user-agent"),
    });
    revalidatePath(`/portal/project/${accessId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { error: error.message };
    }
    return { error: "Could not submit your request." };
  }
}

export async function recordCustomerPaymentViewedAction(
  accessId: string,
  requirementId?: string,
): Promise<PortalRequestFormState> {
  const headerList = await headers();
  try {
    const session = await requireCustomerPortalAccess({ accessId });
    await appendCustomerPortalEvent({
      organizationId: session.organizationId,
      customerId: session.customerId,
      jobId: session.jobId,
      customerPortalAccessId: session.customerPortalAccessId,
      portalIdentityId: session.portalIdentityId,
      eventType: CustomerPortalEventType.PAYMENT_LINK_OPENED,
      ipAddress: headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: headerList.get("user-agent"),
      metadataJson: requirementId ? { requirementId } : undefined,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { error: error.message };
    }
    return { error: "Could not record payment view." };
  }
}

export async function prepareCustomerPortalUploadAction(
  accessId: string,
  visibleResourceId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!(await checkRateLimit(`${accessId}:upload:${ip}`, UPLOAD_RATE_LIMIT))) {
    return { ok: false as const, error: "Too many upload attempts. Please try again later." };
  }

  try {
    const session = await requireCustomerPortalAccess({ accessId });
    return await prepareCustomerPortalUpload({
      session,
      visibleResourceId,
      fileName,
      contentType,
      fileSize,
    });
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { ok: false as const, error: error.message };
    }
    return { ok: false as const, error: "Could not prepare upload." };
  }
}

export async function completeCustomerPortalUploadAction(
  accessId: string,
  visibleResourceId: string,
  attachmentId: string,
) {
  const headerList = await headers();
  try {
    const session = await requireCustomerPortalAccess({ accessId });
    const result = await completeCustomerPortalUpload({
      session,
      visibleResourceId,
      attachmentId,
      ipAddress: headerList.get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: headerList.get("user-agent"),
    });
    if (result.ok) {
      revalidatePath(`/portal/project/${accessId}`);
    }
    return result;
  } catch (error) {
    if (error instanceof CustomerPortalAccessDeniedError) {
      return { ok: false as const, error: error.message };
    }
    return { ok: false as const, error: "Could not complete upload." };
  }
}

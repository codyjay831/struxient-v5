"use server";

import { revalidatePath } from "next/cache";
import {
  CustomerPortalAccessLevel,
  CustomerPortalAccessStatus,
  CustomerRequestStatus,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
  JobTaskStatus,
  JobStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
  QuoteStatus,
  ChangeOrderStatus,
  JobActivityType,
} from "@prisma/client";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  getCommercialRequestContextOrThrow,
  getRequestContextOrThrow,
} from "@/lib/auth-context";
import { canManageCustomerPortal, canReadCustomerCoordination } from "@/lib/customer-portal/authorize";
import {
  createCustomerPortalAccess,
  revokeCustomerPortalAccess,
  listPortalAccessForJob,
} from "@/lib/customer-portal/access-service";
import { resolveCustomerRequest } from "@/lib/customer-portal/request-service";
import {
  markResourceCustomerVisible,
  revokeCustomerVisibleResource,
} from "@/lib/customer-portal/visible-resource-service";
import { buildCustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isPortalEmailConfigured,
  sendPortalChangeOrderLink,
  sendPortalInvitation,
  sendPortalPaymentRequest,
  sendPortalQuoteLink,
} from "@/lib/customer-portal/notification-service";
import {
  listPortalAuditEventsForJob,
  portalAuditEventLabel,
} from "@/lib/customer-portal/event-service";
import {
  attachScheduleAnchorsToRequirements,
  buildPaymentDueContextFromJob,
  getUnsettledEffectivelyDueRequirements,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { computeNextTaskSortOrder } from "@/lib/job-task-add-guard";

export type JobPortalActionResult = {
  ok: boolean;
  error?: string;
  portalUrl?: string;
};

export async function inviteCustomerPortalAccessAction(
  jobId: string,
  formData: FormData,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const name = String(formData.get("contactName") ?? "").trim();
  const email = String(formData.get("contactEmail") ?? "").trim();
  const phone = String(formData.get("contactPhone") ?? "").trim();
  const accessLevel = String(formData.get("accessLevel") ?? "PROJECT_PARTICIPANT") as CustomerPortalAccessLevel;

  if (name.length < 2) {
    return { ok: false, error: "Contact name is required." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Email or phone is required for portal access." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (
    !(await checkRateLimit(`${ctx.organizationId}:portal-invite:${ip}`, {
      windowMs: 60 * 60 * 1000,
      max: 30,
      keyPrefix: "customer-portal-invite",
    }))
  ) {
    return { ok: false, error: "Too many invite attempts. Please try again later." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true, customerId: true },
  });
  if (!job?.customerId) {
    return { ok: false, error: "Job must have a linked customer before inviting portal access." };
  }

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "Membership not found." };
  }

  try {
    const contact = await db.customerContact.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: job.customerId,
        name,
        email: email || null,
        phone: phone || null,
        isPrimary: false,
      },
    });

    const { magicLinkToken, accessId } = await createCustomerPortalAccess({
      organizationId: ctx.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      customerContactId: contact.id,
      accessLevel,
      invitedByMembershipId: membership.id,
      contactEmail: email || null,
      contactPhone: phone || null,
      expiresInDays: 30,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const portalUrl = `${baseUrl}/portal/${magicLinkToken}`;

    const sendEmail =
      formData.has("sendEmail") && String(formData.get("sendEmail") ?? "") !== "off";
    if (sendEmail && email && isPortalEmailConfigured()) {
      const emailResult = await sendPortalInvitation({
        accessId,
        contactEmail: email,
        contactName: name,
      });
      if (!emailResult.ok && emailResult.error !== "Email is not configured.") {
        revalidatePath(`/jobs/${jobId}`);
        return {
          ok: true,
          portalUrl,
          error: `Portal link created but email failed: ${emailResult.error}`,
        };
      }
    }

    revalidatePath(`/jobs/${jobId}`);

    return {
      ok: true,
      portalUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create portal access.",
    };
  }
}

export async function revokeCustomerPortalAccessAction(
  accessId: string,
  jobId: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to revoke portal access." };
  }

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "Membership not found." };
  }

  try {
    await revokeCustomerPortalAccess({
      accessId,
      organizationId: ctx.organizationId,
      revokedByMembershipId: membership.id,
    });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not revoke portal access." };
  }
}

export async function resolveCustomerRequestAction(
  requestId: string,
  jobId: string,
  formData: FormData,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to resolve customer requests." };
  }

  const status = String(formData.get("status") ?? "RESOLVED") as CustomerRequestStatus;
  const linkedTaskId = String(formData.get("linkedTaskId") ?? "").trim() || null;
  const linkedScheduleEventId =
    String(formData.get("linkedScheduleEventId") ?? "").trim() || null;
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim() || null;

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "Membership not found." };
  }

  await resolveCustomerRequest({
    requestId,
    organizationId: ctx.organizationId,
    resolvedByMembershipId: membership.id,
    status,
    linkedTaskId,
    linkedScheduleEventId,
    resolutionNote,
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/workstation");
  return { ok: true };
}

export async function loadJobPortalManagementData(jobId: string) {
  const ctx = await getRequestContextOrThrow();
  if (!canReadCustomerCoordination(ctx.role)) {
    return null;
  }

  const canManage = canManageCustomerPortal(ctx.role);

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: {
      id: true,
      customerId: true,
      quoteId: true,
      status: true,
      customer: { select: { displayName: true, email: true, phone: true } },
      quote: { select: { id: true, status: true } },
      changeOrders: {
        where: { status: ChangeOrderStatus.SENT },
        orderBy: { updatedAt: "desc" },
        select: { id: true, number: true, title: true, status: true },
      },
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          stageId: true,
          tasks: {
            where: { status: { not: JobTaskStatus.CANCELED } },
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, status: true },
          },
        },
      },
      scheduleEvents: {
        where: { customerVisible: true },
        orderBy: { startAt: "desc" },
        select: { id: true, title: true, startAt: true, status: true },
      },
      paymentRequirements: {
        select: {
          id: true,
          title: true,
          status: true,
          amountCents: true,
          paymentUrl: true,
          paymentUrlLabel: true,
          requiredBeforeStageId: true,
          sourcePaymentScheduleItemId: true,
        },
      },
    },
  });
  if (!job?.customerId) {
    return null;
  }

  const anchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
  );
  const paymentRequirementsWithAnchors = attachScheduleAnchorsToRequirements(
    job.paymentRequirements,
    anchors,
  );
  const paymentDueContext = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages,
    paymentRequirements: paymentRequirementsWithAnchors,
  });
  const duePaymentRequirements = getUnsettledEffectivelyDueRequirements(
    paymentRequirementsWithAnchors,
    paymentDueContext,
  ).map((r) => {
    const row = job.paymentRequirements.find((x) => x.id === r.id);
    return {
      id: r.id,
      title: r.title,
      amountCents: row?.amountCents ?? null,
      paymentUrl: row?.paymentUrl ?? null,
      paymentUrlLabel: row?.paymentUrlLabel ?? null,
    };
  });

  const [accesses, openRequests, visibleResources, attachments, auditEvents] = await Promise.all([
    listPortalAccessForJob(ctx.organizationId, jobId),
    db.customerRequest.findMany({
      where: {
        organizationId: ctx.organizationId,
        jobId,
        status: { in: [CustomerRequestStatus.OPEN, CustomerRequestStatus.NEEDS_REVIEW] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.customerVisibleResource.findMany({
      where: {
        organizationId: ctx.organizationId,
        jobId,
        revokedAt: null,
        visibility: { not: CustomerVisibleResourceVisibility.REVOKED },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        resourceType: true,
        visibility: true,
        createdAt: true,
      },
    }),
    db.attachment.findMany({
      where: {
        organizationId: ctx.organizationId,
        jobId,
        status: "READY",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, fileName: true, createdAt: true },
    }),
    listPortalAuditEventsForJob({
      organizationId: ctx.organizationId,
      jobId,
      limit: 20,
    }),
  ]);

  return {
    canManage,
    emailConfigured: isPortalEmailConfigured(),
    customer: job.customer,
    quote: job.quote,
    changeOrders: job.changeOrders,
    duePaymentRequirements,
    taskOptions: job.stages.flatMap((stage) =>
      stage.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        stageTitle: stage.title,
        status: task.status,
      })),
    ),
    scheduleEventOptions: job.scheduleEvents,
    jobStages: job.stages.map((stage) => ({ id: stage.id, title: stage.title })),
    attachments,
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      label: portalAuditEventLabel(event.eventType),
      eventType: event.eventType,
      createdAt: event.createdAt,
      contactName: event.customerPortalAccess?.customerContact?.name ?? null,
      metadataJson: event.metadataJson,
    })),
    accesses: accesses.map((access) => ({
      id: access.id,
      status: access.status,
      accessLevel: access.accessLevel,
      expiresAt: access.expiresAt,
      revokedAt: access.revokedAt,
      lastUsedAt: access.lastUsedAt,
      createdAt: access.createdAt,
      contactName: access.customerContact?.name ?? null,
      contactEmail: access.customerContact?.email ?? access.portalIdentity?.emailNormalized ?? null,
      lastOpenedAt: access.portalEvents[0]?.createdAt ?? null,
    })),
    openRequests,
    visibleResources,
  };
}

export async function loadCustomerPortalPreviewDocument(accessId: string) {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    throw new Error("Forbidden");
  }

  const access = await db.customerPortalAccess.findFirst({
    where: { id: accessId, organizationId: ctx.organizationId },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      jobId: true,
      accessLevel: true,
      status: true,
    },
  });
  if (!access || access.status !== CustomerPortalAccessStatus.ACTIVE) {
    throw new Error("Access not found");
  }

  return buildCustomerProjectPortalDocument({
    accessId: access.id,
    organizationId: access.organizationId,
    customerId: access.customerId,
    jobId: access.jobId,
    accessLevel: access.accessLevel,
  });
}

export async function requestCustomerUploadAction(
  jobId: string,
  formData: FormData,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const resourceType = String(formData.get("resourceType") ?? "DOCUMENT") as CustomerVisibleResourceType;
  if (title.length < 3) {
    return { ok: false, error: "Title is required." };
  }
  if (resourceType !== "DOCUMENT" && resourceType !== "PHOTO") {
    return { ok: false, error: "Invalid upload type." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true, customerId: true },
  });
  if (!job?.customerId) {
    return { ok: false, error: "Job must have a linked customer." };
  }

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "Membership not found." };
  }

  const slotId = crypto.randomUUID();
  await markResourceCustomerVisible({
    organizationId: ctx.organizationId,
    customerId: job.customerId,
    jobId: job.id,
    resourceType,
    resourceId: slotId,
    visibility: CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    createdByMembershipId: membership.id,
  });

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function shareAttachmentWithCustomerAction(
  jobId: string,
  attachmentId: string,
  title: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { id: true, customerId: true },
  });
  if (!job?.customerId) {
    return { ok: false, error: "Job must have a linked customer." };
  }

  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, organizationId: ctx.organizationId, jobId },
    select: { id: true, fileName: true },
  });
  if (!attachment) {
    return { ok: false, error: "Attachment not found." };
  }

  const membership = await db.membership.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, error: "Membership not found." };
  }

  await markResourceCustomerVisible({
    organizationId: ctx.organizationId,
    customerId: job.customerId,
    jobId: job.id,
    resourceType: CustomerVisibleResourceType.DOCUMENT,
    resourceId: attachment.id,
    visibility: CustomerVisibleResourceVisibility.CUSTOMER_VISIBLE,
    title: title.trim() || attachment.fileName,
    createdByMembershipId: membership.id,
  });

  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function revokeCustomerVisibleResourceAction(
  resourceId: string,
  jobId: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  await revokeCustomerVisibleResource(resourceId, ctx.organizationId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function sendPortalInvitationEmailAction(
  accessId: string,
  jobId: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const access = await db.customerPortalAccess.findFirst({
    where: { id: accessId, organizationId: ctx.organizationId, jobId },
    select: {
      customerContact: { select: { name: true, email: true } },
      portalIdentity: { select: { emailNormalized: true } },
    },
  });
  if (!access) {
    return { ok: false, error: "Portal access not found." };
  }

  const email = access.customerContact?.email ?? access.portalIdentity?.emailNormalized;
  if (!email) {
    return { ok: false, error: "No email on file for this access." };
  }

  const result = await sendPortalInvitation({
    accessId,
    contactEmail: email,
    contactName: access.customerContact?.name,
  });
  revalidatePath(`/jobs/${jobId}`);
  return result.ok
    ? { ok: true, portalUrl: result.portalUrl }
    : { ok: false, error: result.error, portalUrl: result.portalUrl };
}

export async function sendPortalQuoteLinkAction(jobId: string): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: {
      quoteId: true,
      quote: { select: { status: true } },
      customer: { select: { email: true, displayName: true } },
    },
  });
  if (!job?.quoteId || job.quote.status !== QuoteStatus.SENT) {
    return { ok: false, error: "No sent quote is available for this job." };
  }
  if (!job.customer?.email) {
    return { ok: false, error: "Customer email is required to send a quote link." };
  }

  const result = await sendPortalQuoteLink({
    organizationId: ctx.organizationId,
    jobId,
    quoteId: job.quoteId,
    recipients: [{ email: job.customer.email, name: job.customer.displayName }],
  });
  revalidatePath(`/jobs/${jobId}`);
  return result.ok ? { ok: true, portalUrl: result.portalUrl } : { ok: false, error: result.error };
}

export async function sendPortalChangeOrderLinkAction(
  jobId: string,
  changeOrderId: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { customer: { select: { email: true, displayName: true } } },
  });
  if (!job?.customer?.email) {
    return { ok: false, error: "Customer email is required to send a change order link." };
  }

  const result = await sendPortalChangeOrderLink({
    organizationId: ctx.organizationId,
    jobId,
    changeOrderId,
    recipients: [{ email: job.customer.email, name: job.customer.displayName }],
  });
  revalidatePath(`/jobs/${jobId}`);
  return result.ok ? { ok: true, portalUrl: result.portalUrl } : { ok: false, error: result.error };
}

export async function sendPortalPaymentRequestAction(
  jobId: string,
  requirementId: string,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer portal access." };
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { customer: { select: { email: true, displayName: true } } },
  });
  if (!job?.customer?.email) {
    return { ok: false, error: "Customer email is required to send a payment request." };
  }

  const result = await sendPortalPaymentRequest({
    organizationId: ctx.organizationId,
    jobId,
    requirementId,
    recipients: [{ email: job.customer.email, name: job.customer.displayName }],
  });
  revalidatePath(`/jobs/${jobId}`);
  return result.ok ? { ok: true, portalUrl: result.portalUrl } : { ok: false, error: result.error };
}

export async function createCustomerRequestFollowUpTaskAction(
  requestId: string,
  jobId: string,
  formData: FormData,
): Promise<JobPortalActionResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  if (!canManageCustomerPortal(ctx.role)) {
    return { ok: false, error: "You do not have permission to manage customer requests." };
  }

  const jobStageId = String(formData.get("jobStageId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!jobStageId || title.length < 3) {
    return { ok: false, error: "Stage and task title are required." };
  }

  const request = await db.customerRequest.findFirst({
    where: { id: requestId, organizationId: ctx.organizationId, jobId },
    select: { id: true, title: true },
  });
  if (!request) {
    return { ok: false, error: "Customer request not found." };
  }

  const jobStage = await db.jobStage.findFirst({
    where: {
      id: jobStageId,
      jobId,
      job: { organizationId: ctx.organizationId, status: JobStatus.ACTIVE },
    },
    select: { id: true, title: true, jobId: true },
  });
  if (!jobStage) {
    return { ok: false, error: "Job stage not found." };
  }

  const maxSort = await db.jobTask.aggregate({
    where: { jobStageId: jobStage.id },
    _max: { sortOrder: true },
  });
  const sortOrder = computeNextTaskSortOrder(maxSort._max.sortOrder);

  await db.$transaction(async (tx) => {
    const created = await tx.jobTask.create({
      data: {
        jobId: jobStage.jobId,
        jobStageId: jobStage.id,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        title,
        category: TaskTemplateCategory.GENERAL,
        status: JobTaskStatus.TODO,
        sortOrder,
        completionRequirementsJson: {},
        providesSignals: [],
        requiresSignals: [],
        hardSignal: false,
      },
    });

    await tx.customerRequest.updateMany({
      where: { id: requestId, organizationId: ctx.organizationId },
      data: { linkedTaskId: created.id },
    });

    await recordJobActivity(
      {
        organizationId: ctx.organizationId,
        jobId,
        actorUserId: ctx.userId,
        type: JobActivityType.ISSUE_FOLLOW_UP_TASK_CREATED,
        title: `Follow-up task: ${title}`,
        details: `Created from customer request "${request.title}".`,
        entityType: "JobTask",
        entityId: created.id,
      },
      tx,
    );
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/workstation");
  return { ok: true };
}

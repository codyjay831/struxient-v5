import {
  CustomerPortalAccessLevel,
  CustomerPortalEventType,
  CustomerRequestStatus,
  CustomerRequestType,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
  JobScheduleEventStatus,
  QuoteStatus,
  ChangeOrderStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  getUnsettledEffectivelyDueRequirements,
  buildPaymentDueContextFromJob,
  attachScheduleAnchorsToRequirements,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";
import { listCustomerSafePortalActivity } from "./event-service";
import { loadCustomerConfirmedScheduleEventIds } from "./schedule-service";
import { listVisibleResourcesForJob } from "./visible-resource-service";

export type CustomerProjectStatus =
  | "REQUEST_RECEIVED"
  | "QUOTE_IN_PROGRESS"
  | "QUOTE_READY"
  | "WAITING_FOR_APPROVAL"
  | "APPROVED_NOT_SCHEDULED"
  | "SCHEDULED"
  | "WORK_IN_PROGRESS"
  | "WAITING_ON_CUSTOMER"
  | "INSPECTION_OR_REVIEW"
  | "PAYMENT_DUE"
  | "COMPLETE"
  | "ON_HOLD"
  | "CANCELED";

export type CustomerNextActionKind =
  | "ACCEPT_QUOTE"
  | "REVIEW_CHANGE_ORDER"
  | "PAY_INVOICE"
  | "CONFIRM_APPOINTMENT"
  | "SUBMIT_AVAILABILITY"
  | "UPLOAD_REQUESTED_DOCUMENT"
  | "UPLOAD_REQUESTED_PHOTO"
  | "ANSWER_CONTRACTOR_QUESTION"
  | "NO_ACTION_NEEDED";

export type CustomerNextAction = {
  kind: CustomerNextActionKind;
  label: string;
  description?: string;
  href?: string;
  action?: "OPEN_QUOTE" | "OPEN_CHANGE_ORDER";
  changeOrderId?: string;
};

export type CustomerProjectPortalDocument = {
  header: {
    companyName: string;
    projectTitle: string;
    projectAddress: string | null;
    portalStatusLabel: string;
  };
  status: CustomerProjectStatus;
  statusLabel: string;
  nextAction: CustomerNextAction;
  schedule: {
    hasAppointment: boolean;
    events: Array<{
      id: string;
      title: string;
      startAt: Date;
      endAt: Date;
      status: JobScheduleEventStatus;
      windowLabel: string | null;
      canConfirm: boolean;
      customerConfirmed: boolean;
    }>;
  };
  quotes: {
    quoteId: string;
    status: QuoteStatus;
    sharePath: string | null;
    acceptedAt: Date | null;
  } | null;
  changeOrders: Array<{
    id: string;
    number: number;
    title: string;
    status: ChangeOrderStatus;
    canReview: boolean;
  }>;
  payments: {
    hasAmountDue: boolean;
    totalDueCents: number;
    items: Array<{
      id: string;
      title: string;
      amountCents: number;
      paymentUrl: string | null;
      paymentUrlLabel: string | null;
    }>;
  };
  documents: Array<{
    id: string;
    title: string;
    visibility: CustomerVisibleResourceVisibility;
    resourceType: CustomerVisibleResourceType;
    downloadPath: string | null;
    canUpload: boolean;
  }>;
  requests: Array<{
    id: string;
    type: CustomerRequestType;
    title: string;
    status: CustomerRequestStatus;
    createdAt: Date;
  }>;
  activity: Array<{
    id: string;
    eventType: CustomerPortalEventType;
    createdAt: Date;
    label: string;
  }>;
  contact: {
    companyName: string;
  };
};

async function loadPaymentDueForJob(jobId: string) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          stageId: true,
          title: true,
          tasks: {
            select: { status: true, recoveryFlowId: true },
          },
        },
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
  if (!job) {
    return {
      dueRequirements: [] as Array<{
        id: string;
        title: string;
        amountCents: number;
        paymentUrl: string | null;
        paymentUrlLabel: string | null;
      }>,
    };
  }

  const anchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
  );
  const requirements = attachScheduleAnchorsToRequirements(job.paymentRequirements, anchors);
  const ctx = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages,
    paymentRequirements: requirements,
  });
  const due = getUnsettledEffectivelyDueRequirements(requirements, ctx);
  return {
    dueRequirements: due.map((r) => {
      const row = job.paymentRequirements.find((x) => x.id === r.id);
      return {
        id: r.id,
        title: r.title,
        amountCents: row?.amountCents ?? 0,
        paymentUrl: row?.paymentUrl ?? null,
        paymentUrlLabel: row?.paymentUrlLabel ?? null,
      };
    }),
  };
}

const STATUS_LABELS: Record<CustomerProjectStatus, string> = {
  REQUEST_RECEIVED: "Request received",
  QUOTE_IN_PROGRESS: "Quote in progress",
  QUOTE_READY: "Quote ready",
  WAITING_FOR_APPROVAL: "Waiting for your approval",
  APPROVED_NOT_SCHEDULED: "Approved — scheduling next",
  SCHEDULED: "Visit scheduled",
  WORK_IN_PROGRESS: "Work in progress",
  WAITING_ON_CUSTOMER: "Waiting on you",
  INSPECTION_OR_REVIEW: "Inspection or review",
  PAYMENT_DUE: "Payment due",
  COMPLETE: "Complete",
  ON_HOLD: "On hold",
  CANCELED: "Canceled",
};

export function getCustomerProjectStatusLabel(status: CustomerProjectStatus): string {
  return STATUS_LABELS[status];
}

export async function getCustomerProjectStatus(jobId: string): Promise<CustomerProjectStatus> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      quote: { select: { status: true } },
      scheduleEvents: {
        where: {
          customerVisible: true,
          status: { in: [JobScheduleEventStatus.CONFIRMED, JobScheduleEventStatus.TENTATIVE] },
        },
        take: 1,
      },
      portalRequests: {
        where: {
          status: { in: [CustomerRequestStatus.OPEN, CustomerRequestStatus.NEEDS_REVIEW] },
        },
        take: 1,
      },
    },
  });

  if (!job) return "REQUEST_RECEIVED";
  if (job.status === "ARCHIVED") return "COMPLETE";

  const openCustomerRequests = job.portalRequests.length > 0;
  if (openCustomerRequests) return "WAITING_ON_CUSTOMER";

  const quoteStatus = job.quote.status;
  if (quoteStatus === QuoteStatus.DRAFT) return "QUOTE_IN_PROGRESS";
  if (quoteStatus === QuoteStatus.SENT) return "WAITING_FOR_APPROVAL";
  if (quoteStatus === QuoteStatus.APPROVED && job.scheduleEvents.length === 0) {
    return "APPROVED_NOT_SCHEDULED";
  }
  if (job.scheduleEvents.length > 0) return "SCHEDULED";

  return "WORK_IN_PROGRESS";
}

export async function getCustomerNextAction(input: {
  jobId: string;
  accessId: string;
  accessLevel: CustomerPortalAccessLevel;
}): Promise<CustomerNextAction> {
  const job = await db.job.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      quoteId: true,
      quote: {
        select: {
          status: true,
          shareToken: { select: { token: true } },
        },
      },
      changeOrders: {
        where: { status: ChangeOrderStatus.SENT },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          shareToken: { select: { token: true } },
          title: true,
        },
      },
      scheduleEvents: {
        where: {
          customerVisible: true,
          status: JobScheduleEventStatus.CONFIRMED,
        },
        orderBy: { startAt: "asc" },
        take: 1,
        select: { id: true, title: true, startAt: true },
      },
    },
  });

  if (!job) {
    return {
      kind: "NO_ACTION_NEEDED",
      label: "No action is needed from you right now.",
    };
  }

  if (job.quote.status === QuoteStatus.SENT) {
    return {
      kind: "ACCEPT_QUOTE",
      label: "Review and approve your quote",
      description: "Open your secure quote to review and approve.",
      action: "OPEN_QUOTE",
    };
  }

  const pendingCo = job.changeOrders[0];
  if (pendingCo) {
    return {
      kind: "REVIEW_CHANGE_ORDER",
      label: "Review change order",
      description: pendingCo.title,
      action: "OPEN_CHANGE_ORDER",
      changeOrderId: pendingCo.id,
    };
  }

  const requiredUpload = await db.customerVisibleResource.findFirst({
    where: {
      jobId: input.jobId,
      visibility: CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
      revokedAt: null,
      resourceType: { in: [CustomerVisibleResourceType.DOCUMENT, CustomerVisibleResourceType.PHOTO] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (requiredUpload) {
    return {
      kind:
        requiredUpload.resourceType === CustomerVisibleResourceType.PHOTO
          ? "UPLOAD_REQUESTED_PHOTO"
          : "UPLOAD_REQUESTED_DOCUMENT",
      label: requiredUpload.title ?? "Upload requested file",
      description: requiredUpload.description ?? undefined,
    };
  }

  const { dueRequirements } = await loadPaymentDueForJob(input.jobId);
  if (dueRequirements.length > 0 && input.accessLevel !== CustomerPortalAccessLevel.VIEW_ONLY) {
    const total = dueRequirements.reduce((sum, r) => sum + r.amountCents, 0);
    const payTarget = dueRequirements.find((r) => r.paymentUrl);
    return {
      kind: "PAY_INVOICE",
      label: "Payment due",
      description: `$${(total / 100).toFixed(2)} due for this project.`,
      href: payTarget?.paymentUrl ?? undefined,
    };
  }

  const appointment = job.scheduleEvents[0];
  if (appointment) {
    return {
      kind: "CONFIRM_APPOINTMENT",
      label: "Confirm your appointment",
      description: appointment.title ?? undefined,
    };
  }

  return {
    kind: "NO_ACTION_NEEDED",
    label: "No action is needed from you right now.",
  };
}

function activityLabel(eventType: CustomerPortalEventType): string {
  switch (eventType) {
    case CustomerPortalEventType.QUOTE_ACCEPTED:
      return "Quote accepted";
    case CustomerPortalEventType.QUOTE_VIEWED:
      return "Quote viewed";
    case CustomerPortalEventType.CHANGE_ORDER_ACCEPTED:
      return "Change order accepted";
    case CustomerPortalEventType.APPOINTMENT_CONFIRMED:
      return "Appointment confirmed";
    case CustomerPortalEventType.DOCUMENT_UPLOADED:
      return "Document uploaded";
    case CustomerPortalEventType.PHOTO_UPLOADED:
      return "Photo uploaded";
    case CustomerPortalEventType.PAYMENT_LINK_OPENED:
      return "Payment link opened";
    case CustomerPortalEventType.RESCHEDULE_REQUESTED:
      return "Reschedule requested";
    case CustomerPortalEventType.AVAILABILITY_SUBMITTED:
      return "Availability submitted";
    case CustomerPortalEventType.ACCESS_NOTE_SUBMITTED:
      return "Access note submitted";
    case CustomerPortalEventType.QUESTION_SUBMITTED:
      return "Question submitted";
    default:
      return "Project update";
  }
}

export async function buildCustomerProjectPortalDocument(input: {
  accessId: string;
  organizationId: string;
  customerId: string;
  jobId: string;
  accessLevel: CustomerPortalAccessLevel;
}): Promise<CustomerProjectPortalDocument> {
  const [job, activity, visibleResources, openRequests] = await Promise.all([
    db.job.findFirst({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        customerId: input.customerId,
      },
      select: {
        title: true,
        organization: { select: { name: true } },
        serviceLocation: { select: { formattedAddress: true } },
        quote: {
          select: {
            id: true,
            status: true,
            shareToken: { select: { token: true, acceptedAt: true } },
          },
        },
        changeOrders: {
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            shareToken: { select: { token: true } },
          },
        },
        scheduleEvents: {
          where: { customerVisible: true },
          orderBy: { startAt: "asc" },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            status: true,
            externalWindowLabel: true,
          },
        },
      },
    }),
    listCustomerSafePortalActivity({
      organizationId: input.organizationId,
      jobId: input.jobId,
    }),
    listVisibleResourcesForJob({
      organizationId: input.organizationId,
      customerId: input.customerId,
      jobId: input.jobId,
      viewerAccessLevel: input.accessLevel,
      resourceTypes: [
        CustomerVisibleResourceType.DOCUMENT,
        CustomerVisibleResourceType.PHOTO,
        CustomerVisibleResourceType.PROJECT_UPDATE,
      ],
    }),
    db.customerRequest.findMany({
      where: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        customerPortalAccessId: input.accessId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  if (!job) {
    throw new Error("JOB_NOT_FOUND");
  }

  const status = await getCustomerProjectStatus(input.jobId);
  const nextAction = await getCustomerNextAction({
    jobId: input.jobId,
    accessId: input.accessId,
    accessLevel: input.accessLevel,
  });

  const { dueRequirements } = await loadPaymentDueForJob(input.jobId);
  const confirmedScheduleIds = await loadCustomerConfirmedScheduleEventIds(input.jobId);

  return {
    header: {
      companyName: job.organization.name,
      projectTitle: job.title,
      projectAddress: job.serviceLocation?.formattedAddress ?? null,
      portalStatusLabel: getCustomerProjectStatusLabel(status),
    },
    status,
    statusLabel: getCustomerProjectStatusLabel(status),
    nextAction,
    schedule: {
      hasAppointment: job.scheduleEvents.length > 0,
      events: job.scheduleEvents.map((event) => ({
        id: event.id,
        title: event.title ?? "Scheduled visit",
        startAt: event.startAt,
        endAt: event.endAt,
        status: event.status,
        windowLabel: event.externalWindowLabel,
        canConfirm:
          (event.status === JobScheduleEventStatus.CONFIRMED ||
            event.status === JobScheduleEventStatus.TENTATIVE) &&
          !confirmedScheduleIds.has(event.id),
        customerConfirmed: confirmedScheduleIds.has(event.id),
      })),
    },
    quotes: job.quote
      ? {
          quoteId: job.quote.id,
          status: job.quote.status,
          sharePath: null,
          acceptedAt: job.quote.shareToken?.acceptedAt ?? null,
        }
      : null,
    changeOrders: job.changeOrders.map((co) => ({
      id: co.id,
      number: co.number,
      title: co.title,
      status: co.status,
      canReview: co.status === ChangeOrderStatus.SENT,
    })),
    payments: {
      hasAmountDue: dueRequirements.length > 0,
      totalDueCents: dueRequirements.reduce((sum, r) => sum + r.amountCents, 0),
      items: dueRequirements.map((r) => ({
        id: r.id,
        title: r.title,
        amountCents: r.amountCents,
        paymentUrl: r.paymentUrl,
        paymentUrlLabel: r.paymentUrlLabel,
      })),
    },
    documents: visibleResources.map((r) => ({
      id: r.id,
      title: r.title ?? r.resourceType,
      visibility: r.visibility,
      resourceType: r.resourceType,
      downloadPath:
        r.visibility === CustomerVisibleResourceVisibility.CUSTOMER_VISIBLE &&
        (r.resourceType === CustomerVisibleResourceType.DOCUMENT ||
          r.resourceType === CustomerVisibleResourceType.PHOTO)
          ? `/api/portal/documents/${r.id}`
          : null,
      canUpload: r.visibility === CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
    })),
    requests: openRequests,
    activity: activity.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      createdAt: row.createdAt,
      label: activityLabel(row.eventType),
    })),
    contact: {
      companyName: job.organization.name,
    },
  };
}

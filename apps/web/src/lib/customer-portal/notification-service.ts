import { CustomerPortalEventType, QuoteStatus, ChangeOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { escapeHtml } from "@/lib/html-escape";
import { getResendClient, getResendFromAddress } from "@/lib/resend-from";
import { appendCustomerPortalEvent } from "./event-service";
import { createCustomerPortalMagicLink } from "./token-service";
import {
  mintChangeOrderShareUrlForStaff,
  mintQuoteShareUrlForStaff,
} from "./commercial-navigation-service";
import {
  getUnsettledEffectivelyDueRequirements,
  buildPaymentDueContextFromJob,
  attachScheduleAnchorsToRequirements,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";

export type PortalNotificationResult = {
  ok: boolean;
  portalUrl?: string;
  error?: string;
};

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  const client = getResendClient();
  if (!client) {
    return { ok: false, error: "Email is not configured." };
  }

  try {
    const result = await client.emails.send({
      from: getResendFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { ok: true, providerMessageId: result.data?.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Email delivery failed.",
    };
  }
}

async function recordDeliveryEvent(input: {
  organizationId: string;
  customerId: string;
  jobId: string;
  customerPortalAccessId?: string | null;
  portalIdentityId?: string | null;
  eventType: CustomerPortalEventType;
  resourceType?: string | null;
  resourceId?: string | null;
  purpose: string;
  delivery: { ok: boolean; providerMessageId?: string; error?: string };
  extraMetadata?: Record<string, unknown>;
}): Promise<void> {
  await appendCustomerPortalEvent({
    organizationId: input.organizationId,
    customerId: input.customerId,
    jobId: input.jobId,
    customerPortalAccessId: input.customerPortalAccessId ?? null,
    portalIdentityId: input.portalIdentityId ?? null,
    eventType: input.eventType,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadataJson: {
      purpose: input.purpose,
      deliveryStatus: input.delivery.ok ? "sent" : input.delivery.error === "Email is not configured." ? "skipped" : "failed",
      providerMessageId: input.delivery.providerMessageId ?? null,
      error: input.delivery.error ?? null,
      ...input.extraMetadata,
    },
  });
}

export function isPortalEmailConfigured(): boolean {
  return getResendClient() != null;
}

export async function sendPortalInvitation(input: {
  accessId: string;
  contactEmail: string;
  contactName?: string | null;
}): Promise<PortalNotificationResult> {
  const email = input.contactEmail.trim();
  if (!email) {
    return { ok: false, error: "Contact email is required to send an invitation." };
  }

  const access = await db.customerPortalAccess.findFirst({
    where: { id: input.accessId },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      jobId: true,
      portalIdentityId: true,
      revokedAt: true,
      job: {
        select: {
          title: true,
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!access || access.revokedAt) {
    return { ok: false, error: "Portal access not found." };
  }

  const { token } = await createCustomerPortalMagicLink({
    customerPortalAccessId: access.id,
    portalIdentityId: access.portalIdentityId,
    purpose: "PORTAL_SIGN_IN",
  });

  const portalUrl = `${appBaseUrl()}/portal/${token}`;
  const orgName = access.job.organization.name;
  const projectTitle = access.job.title;

  const delivery = await sendEmail({
    to: email,
    subject: `Your project portal — ${escapeHtml(projectTitle)}`,
    html: `
      <h1>Your project portal is ready</h1>
      <p>Hi ${escapeHtml(input.contactName?.trim() || "there")},</p>
      <p><strong>${escapeHtml(orgName)}</strong> invited you to follow progress on <strong>${escapeHtml(projectTitle)}</strong>.</p>
      <p><a href="${portalUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Open project portal</a></p>
      <p style="font-size:14px;color:#666;">Or copy this link: ${portalUrl}</p>
      <p style="font-size:14px;color:#666;">This sign-in link expires after use.</p>
    `,
  });

  await recordDeliveryEvent({
    organizationId: access.organizationId,
    customerId: access.customerId,
    jobId: access.jobId,
    customerPortalAccessId: access.id,
    portalIdentityId: access.portalIdentityId,
    eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
    purpose: "PORTAL_INVITATION",
    delivery,
  });

  if (!delivery.ok) {
    return { ok: false, error: delivery.error, portalUrl };
  }

  return { ok: true, portalUrl };
}

export async function sendPortalQuoteLink(input: {
  organizationId: string;
  jobId: string;
  quoteId: string;
  recipients: { email: string; name?: string }[];
}): Promise<PortalNotificationResult> {
  if (input.recipients.length === 0) {
    return { ok: false, error: "At least one recipient is required." };
  }

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId, quoteId: input.quoteId },
    select: {
      id: true,
      title: true,
      customerId: true,
      quote: { select: { status: true } },
      organization: { select: { name: true } },
    },
  });

  if (!job || job.quote.status !== QuoteStatus.SENT || !job.customerId) {
    return { ok: false, error: "Quote is not available to send." };
  }

  const sharePath = await mintQuoteShareUrlForStaff({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
  });
  const shareUrl = `${appBaseUrl()}${sharePath}`;

  let lastError: string | undefined;
  let sent = 0;

  for (const recipient of input.recipients) {
    const delivery = await sendEmail({
      to: recipient.email,
      subject: `Your proposal from ${escapeHtml(job.organization.name)}`,
      html: `
        <h1>Your proposal is ready</h1>
        <p>Hi ${escapeHtml(recipient.name || "there")},</p>
        <p>Review your proposal for <strong>${escapeHtml(job.title)}</strong> from <strong>${escapeHtml(job.organization.name)}</strong>.</p>
        <p><a href="${shareUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Review proposal</a></p>
        <p style="font-size:14px;color:#666;">Or copy this link: ${shareUrl}</p>
      `,
    });

    await recordDeliveryEvent({
      organizationId: input.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
      resourceType: "QUOTE",
      resourceId: input.quoteId,
      purpose: "QUOTE_LINK",
      delivery,
      extraMetadata: { recipientEmail: recipient.email },
    });

    if (delivery.ok) sent += 1;
    else lastError = delivery.error;
  }

  if (sent === 0) {
    return { ok: false, error: lastError ?? "Could not send quote link.", portalUrl: shareUrl };
  }

  return { ok: true, portalUrl: shareUrl };
}

export async function sendPortalChangeOrderLink(input: {
  organizationId: string;
  jobId: string;
  changeOrderId: string;
  recipients: { email: string; name?: string }[];
}): Promise<PortalNotificationResult> {
  if (input.recipients.length === 0) {
    return { ok: false, error: "At least one recipient is required." };
  }

  const changeOrder = await db.changeOrder.findFirst({
    where: {
      id: input.changeOrderId,
      organizationId: input.organizationId,
      status: ChangeOrderStatus.SENT,
      quote: { job: { id: input.jobId } },
    },
    select: {
      id: true,
      title: true,
      quote: {
        select: {
          job: {
            select: {
              id: true,
              title: true,
              customerId: true,
              organization: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!changeOrder) {
    return { ok: false, error: "Change order is not available to send." };
  }

  const job = changeOrder.quote?.job;
  if (!job?.customerId) {
    return { ok: false, error: "Change order job is not available." };
  }
  const customerId = job.customerId;
  const sharePath = await mintChangeOrderShareUrlForStaff({
    organizationId: input.organizationId,
    changeOrderId: changeOrder.id,
  });
  const shareUrl = `${appBaseUrl()}${sharePath}`;

  let lastError: string | undefined;
  let sent = 0;

  for (const recipient of input.recipients) {
    const delivery = await sendEmail({
      to: recipient.email,
      subject: `Change order from ${escapeHtml(job.organization.name)}`,
      html: `
        <h1>Change order ready for review</h1>
        <p>Hi ${escapeHtml(recipient.name || "there")},</p>
        <p>Please review change order <strong>${escapeHtml(changeOrder.title)}</strong> for <strong>${escapeHtml(job.title)}</strong>.</p>
        <p><a href="${shareUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">Review change order</a></p>
        <p style="font-size:14px;color:#666;">Or copy this link: ${shareUrl}</p>
      `,
    });

    await recordDeliveryEvent({
      organizationId: input.organizationId,
      customerId,
      jobId: job.id,
      eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
      resourceType: "CHANGE_ORDER",
      resourceId: changeOrder.id,
      purpose: "CHANGE_ORDER_LINK",
      delivery,
      extraMetadata: { recipientEmail: recipient.email },
    });

    if (delivery.ok) sent += 1;
    else lastError = delivery.error;
  }

  if (sent === 0) {
    return { ok: false, error: lastError ?? "Could not send change order link.", portalUrl: shareUrl };
  }

  return { ok: true, portalUrl: shareUrl };
}

export async function sendPortalPaymentRequest(input: {
  organizationId: string;
  jobId: string;
  requirementId: string;
  recipients: { email: string; name?: string }[];
}): Promise<PortalNotificationResult> {
  if (input.recipients.length === 0) {
    return { ok: false, error: "At least one recipient is required." };
  }

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: {
      id: true,
      title: true,
      customerId: true,
      status: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          stageId: true,
          title: true,
          tasks: { select: { status: true, recoveryFlowId: true } },
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
      organization: { select: { name: true } },
    },
  });

  if (!job) {
    return { ok: false, error: "Job not found." };
  }
  if (!job.customerId) {
    return { ok: false, error: "Job customer is required." };
  }

  const requirement = job.paymentRequirements.find((r) => r.id === input.requirementId);
  if (!requirement?.paymentUrl) {
    return { ok: false, error: "Payment requirement has no portal payment URL." };
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
  if (!due.some((r) => r.id === requirement.id)) {
    return { ok: false, error: "Payment requirement is not currently due." };
  }

  const amountText =
    requirement.amountCents != null
      ? `$${(requirement.amountCents / 100).toFixed(2)}`
      : "the amount due";
  const payLabel = requirement.paymentUrlLabel?.trim() || "Pay now";

  let lastError: string | undefined;
  let sent = 0;

  for (const recipient of input.recipients) {
    const delivery = await sendEmail({
      to: recipient.email,
      subject: `Payment request — ${escapeHtml(job.title)}`,
      html: `
        <h1>Payment request</h1>
        <p>Hi ${escapeHtml(recipient.name || "there")},</p>
        <p><strong>${escapeHtml(job.organization.name)}</strong> requested payment for <strong>${escapeHtml(requirement.title)}</strong> (${amountText}) on <strong>${escapeHtml(job.title)}</strong>.</p>
        <p><a href="${requirement.paymentUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;margin:16px 0;">${escapeHtml(payLabel)}</a></p>
        <p style="font-size:14px;color:#666;">Or copy this link: ${requirement.paymentUrl}</p>
      `,
    });

    await recordDeliveryEvent({
      organizationId: input.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
      resourceType: "PAYMENT",
      resourceId: requirement.id,
      purpose: "PAYMENT_REQUEST",
      delivery,
      extraMetadata: { recipientEmail: recipient.email, paymentUrl: requirement.paymentUrl },
    });

    if (delivery.ok) sent += 1;
    else lastError = delivery.error;
  }

  if (sent === 0) {
    return { ok: false, error: lastError ?? "Could not send payment request." };
  }

  return { ok: true, portalUrl: requirement.paymentUrl };
}

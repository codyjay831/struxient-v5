import { db } from "./db";
import { escapeHtml, escapeHtmlWithBreaks } from "./html-escape";
import { getResendFromAddress, getResendClient } from "./resend-from";

export type LeadNotificationPayload = {
  organizationId: string;
  leadId: string;
  contactName: string;
  email: string;
  phone: string;
  requestType: string;
};

export type QuoteAcceptanceNotificationPayload = {
  organizationId: string;
  quoteId: string;
  acceptedByName: string;
  totalCents: number;
};

export type QuoteSentNotificationPayload = {
  organizationId: string;
  quoteId: string;
  recipients: { email: string; name?: string }[];
  customMessage?: string;
  organizationDisplayName: string;
  shareUrl: string;
  expiresAt?: Date | null;
};

export type QuoteChangeRequestNotificationPayload = {
  organizationId: string;
  quoteId: string;
  message: string;
  submittedFromIp?: string;
};

export type ChangeOrderSentNotificationPayload = {
  organizationId: string;
  changeOrderId: string;
  recipients: { email: string; name?: string }[];
  customMessage?: string;
  organizationDisplayName: string;
  shareUrl: string;
  expiresAt?: Date | null;
};

export type ChangeOrderAcceptedNotificationPayload = {
  organizationId: string;
  changeOrderId: string;
  acceptedByName: string;
  deltaCents: number;
};

export type TeamInviteNotificationPayload = {
  organizationId: string;
  recipientEmail: string;
  organizationDisplayName: string;
  inviteUrl: string;
  invitedRole: string;
  expiresAt: Date;
};

/**
 * Triggered when a new lead is submitted via the public intake form.
 */
export async function notifyLeadSubmitted(payload: LeadNotificationPayload) {
  console.log(
    `[Notification] New lead submitted for org=${payload.organizationId} lead=${payload.leadId}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    // 1. Notify organization staff (Owners and Admins)
    const staffMembers = await db.membership.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: true },
    });

    const staffEmails = staffMembers.map((m) => m.user.email).filter(Boolean) as string[];

    if (staffEmails.length > 0) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: staffEmails,
        subject: `New Lead: ${escapeHtml(payload.contactName)}`,
        html: `
          <h1>New Lead Received</h1>
          <p><strong>Name:</strong> ${escapeHtml(payload.contactName)}</p>
          <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(payload.phone)}</p>
          <p><strong>Request Type:</strong> ${escapeHtml(payload.requestType)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/leads/${payload.leadId}">View Lead in Dashboard</a></p>
        `,
      });
    }

    // 2. Send confirmation email to the customer
    if (payload.email) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: payload.email,
        subject: "We received your request",
        html: `
          <h1>Thank you for your request</h1>
          <p>Hi ${escapeHtml(payload.contactName)},</p>
          <p>We've received your request for <strong>${escapeHtml(payload.requestType)}</strong> and we'll get back to you soon.</p>
          <p>Best regards,<br/>The Team</p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send lead notifications:", error);
  }
}

/**
 * Triggered when a customer accepts a quote via the public portal.
 */
export async function notifyQuoteAccepted(payload: QuoteAcceptanceNotificationPayload) {
  console.log(
    `[Notification] Quote accepted for org=${payload.organizationId} quote=${payload.quoteId}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    // 1. Notify organization staff
    const staffMembers = await db.membership.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: true },
    });

    const staffEmails = staffMembers.map((m) => m.user.email).filter(Boolean) as string[];

    if (staffEmails.length > 0) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: staffEmails,
        subject: `Quote Accepted: ${escapeHtml(payload.acceptedByName)}`,
        html: `
          <h1>Quote Accepted</h1>
          <p><strong>Accepted By:</strong> ${escapeHtml(payload.acceptedByName)}</p>
          <p><strong>Total:</strong> $${(payload.totalCents / 100).toFixed(2)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/quotes/${payload.quoteId}">View Quote in Dashboard</a></p>
        `,
      });
    }

    // 2. Send confirmation to the customer (if we have their email)
    const quote = await db.quote.findUnique({
      where: { id: payload.quoteId },
      include: { customer: true, lead: true },
    });

    const customerEmail = quote?.customer?.email || quote?.lead?.email;

    if (customerEmail) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: customerEmail,
        subject: "Quote Accepted",
        html: `
          <h1>Quote Accepted</h1>
          <p>Thank you for accepting the quote. We'll be in touch soon to schedule the work.</p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send quote notifications:", error);
  }
}

/**
 * Triggered when staff send a quote to a customer.
 */
export async function notifyQuoteSent(payload: QuoteSentNotificationPayload) {
  console.log(
    `[Notification] Quote sent for org=${payload.organizationId} quote=${payload.quoteId} recipients=${payload.recipients.length}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    const expiryText = payload.expiresAt
      ? `This link expires on ${payload.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
      : "This link does not expire.";

    const customMessageHtml = payload.customMessage
      ? `<div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb; color: #374151; font-style: italic;">
          ${escapeHtmlWithBreaks(payload.customMessage)}
        </div>`
      : "";

    // 1. Send proposal link to each recipient
    for (const recipient of payload.recipients) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: recipient.email,
        subject: `Your proposal from ${escapeHtml(payload.organizationDisplayName)}`,
        html: `
          <h1>Your proposal is ready</h1>
          <p>Hi ${escapeHtml(recipient.name || "there")},</p>
          <p>Your proposal from <strong>${escapeHtml(payload.organizationDisplayName)}</strong> is ready to review.</p>
          ${customMessageHtml}
          <p><a href="${payload.shareUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">View Proposal</a></p>
          <p style="font-size: 14px; color: #666;">Or copy this link: ${payload.shareUrl}</p>
          <p style="font-size: 14px; color: #666;">${expiryText}</p>
          <p>You can review the details, download a PDF, and accept the proposal directly from the link above.</p>
          <p>Best regards,<br/>${escapeHtml(payload.organizationDisplayName)}</p>
        `,
      });
    }

    // 2. CC staff (Owners and Admins) for visibility
    const staffMembers = await db.membership.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: true },
    });

    const staffEmails = staffMembers.map((m) => m.user.email).filter(Boolean) as string[];
    const recipientListText = payload.recipients
      .map((r) => `${escapeHtml(r.name || "")} &lt;${escapeHtml(r.email)}&gt;`)
      .join(", ");

    if (staffEmails.length > 0) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: staffEmails,
        subject: `Quote sent to ${payload.recipients.length} recipient(s)`,
        html: `
          <h1>Quote Sent</h1>
          <p>The quote has been sent to: <strong>${recipientListText}</strong></p>
          ${payload.customMessage ? `<p><strong>Custom message included:</strong></p><blockquote style="border-left: 4px solid #e5e7eb; padding-left: 16px; color: #666;">${escapeHtmlWithBreaks(payload.customMessage)}</blockquote>` : ""}
          <p><strong>Proposal Link:</strong> ${payload.shareUrl}</p>
          <p style="font-size: 14px; color: #666;">${expiryText}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/quotes/${payload.quoteId}">View Quote in Dashboard</a></p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send quote sent notifications:", error);
  }
}

/**
 * Triggered when a customer requests changes to a quote via the public portal.
 */
export async function notifyQuoteChangeRequested(payload: QuoteChangeRequestNotificationPayload) {
  console.log(
    `[Notification] Quote change requested for org=${payload.organizationId} quote=${payload.quoteId}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    const staffMembers = await db.membership.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: true },
    });

    const staffEmails = staffMembers.map((m) => m.user.email).filter(Boolean) as string[];

    if (staffEmails.length > 0) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: staffEmails,
        subject: "Customer Requested Changes to Quote",
        html: `
          <h1>Change Request Received</h1>
          <p>A customer has requested changes to a quote:</p>
          <blockquote style="border-left: 4px solid #e5e7eb; padding-left: 16px; margin: 16px 0; color: #374151;">
            ${escapeHtmlWithBreaks(payload.message)}
          </blockquote>
          ${payload.submittedFromIp ? `<p style="font-size: 14px; color: #666;">Submitted from IP: ${payload.submittedFromIp}</p>` : ""}
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/quotes/${payload.quoteId}">View Quote in Dashboard</a></p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send change request notifications:", error);
  }
}

export async function notifyChangeOrderSent(payload: ChangeOrderSentNotificationPayload) {
  console.log(
    `[Notification] Change order sent for org=${payload.organizationId} changeOrder=${payload.changeOrderId}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    const expiryText = payload.expiresAt
      ? `This link expires on ${payload.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
      : "This link does not expire.";

    const customMessageHtml = payload.customMessage
      ? `<div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb; color: #374151; font-style: italic;">
          ${escapeHtmlWithBreaks(payload.customMessage)}
        </div>`
      : "";

    for (const recipient of payload.recipients) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: recipient.email,
        subject: `Change Order from ${escapeHtml(payload.organizationDisplayName)}`,
        html: `
          <h1>Your change order is ready</h1>
          <p>Hi ${escapeHtml(recipient.name || "there")},</p>
          <p><strong>${escapeHtml(payload.organizationDisplayName)}</strong> sent a change order for your review and acceptance.</p>
          ${customMessageHtml}
          <p><a href="${payload.shareUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">Review Change Order</a></p>
          <p style="font-size: 14px; color: #666;">Or copy this link: ${payload.shareUrl}</p>
          <p style="font-size: 14px; color: #666;">${expiryText}</p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send change order notifications:", error);
  }
}

export async function notifyChangeOrderAccepted(payload: ChangeOrderAcceptedNotificationPayload) {
  console.log(
    `[Notification] Change order accepted for org=${payload.organizationId} changeOrder=${payload.changeOrderId}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping email.");
    return;
  }

  try {
    const staffMembers = await db.membership.findMany({
      where: {
        organizationId: payload.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: true },
    });
    const staffEmails = staffMembers.map((m) => m.user.email).filter(Boolean) as string[];
    if (staffEmails.length > 0) {
      await getResendClient()!.emails.send({
        from: getResendFromAddress(),
        to: staffEmails,
        subject: `Change Order Accepted: ${escapeHtml(payload.acceptedByName)}`,
        html: `
          <h1>Change Order Accepted</h1>
          <p><strong>Accepted By:</strong> ${escapeHtml(payload.acceptedByName)}</p>
          <p><strong>Price Delta:</strong> $${(payload.deltaCents / 100).toFixed(2)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/jobs">View jobs in dashboard</a></p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send change order accepted notifications:", error);
  }
}

export async function notifyTeamInviteSent(payload: TeamInviteNotificationPayload) {
  console.log(
    `[Notification] Team invite sent for org=${payload.organizationId} email=${payload.recipientEmail}`,
  );

  if (!getResendClient()) {
    console.warn("[Notification] Resend API key not found, skipping invite email.");
    return;
  }

  try {
    await getResendClient()!.emails.send({
      from: getResendFromAddress(),
      to: payload.recipientEmail,
      subject: `You've been invited to ${escapeHtml(payload.organizationDisplayName)} on Struxient`,
      html: `
        <h1>You're invited to join ${escapeHtml(payload.organizationDisplayName)}</h1>
        <p>You were invited as <strong>${escapeHtml(payload.invitedRole)}</strong>.</p>
        <p><a href="${payload.inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 16px 0;">Accept invite</a></p>
        <p style="font-size: 14px; color: #666;">Or copy this link: ${payload.inviteUrl}</p>
        <p style="font-size: 14px; color: #666;">This invitation expires on ${payload.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
      `,
    });
  } catch (error) {
    console.error("[Notification] Failed to send team invite notification:", error);
  }
}

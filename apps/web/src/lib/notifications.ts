import { Resend } from "resend";
import { db } from "./db";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type SalesIntakeNotificationPayload = {
  organizationId: string;
  salesIntakeId: string;
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

/**
 * Triggered when a new sales intake is submitted via the public intake form.
 */
export async function notifySalesIntakeSubmitted(payload: SalesIntakeNotificationPayload) {
  console.log(`[Notification] New Sales Intake Submitted:`, payload);

  if (!resend) {
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
      await resend.emails.send({
        from: "Struxient <notifications@struxient.com>",
        to: staffEmails,
        subject: `New Sales Intake: ${payload.contactName}`,
        html: `
          <h1>New Sales Intake Received</h1>
          <p><strong>Name:</strong> ${payload.contactName}</p>
          <p><strong>Email:</strong> ${payload.email}</p>
          <p><strong>Phone:</strong> ${payload.phone}</p>
          <p><strong>Request Type:</strong> ${payload.requestType}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/sales/${payload.salesIntakeId}">View Sales Intake in Dashboard</a></p>
        `,
      });
    }

    // 2. Send confirmation email to the customer
    if (payload.email) {
      await resend.emails.send({
        from: "Struxient <notifications@struxient.com>",
        to: payload.email,
        subject: "We received your request",
        html: `
          <h1>Thank you for your request</h1>
          <p>Hi ${payload.contactName},</p>
          <p>We've received your request for <strong>${payload.requestType}</strong> and we'll get back to you soon.</p>
          <p>Best regards,<br/>The Team</p>
        `,
      });
    }
  } catch (error) {
    console.error("[Notification] Failed to send sales intake notifications:", error);
  }
}

/**
 * Triggered when a customer accepts a quote via the public portal.
 */
export async function notifyQuoteAccepted(payload: QuoteAcceptanceNotificationPayload) {
  console.log(`[Notification] Quote Accepted:`, payload);

  if (!resend) {
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
      await resend.emails.send({
        from: "Struxient <notifications@struxient.com>",
        to: staffEmails,
        subject: `Quote Accepted: ${payload.acceptedByName}`,
        html: `
          <h1>Quote Accepted</h1>
          <p><strong>Accepted By:</strong> ${payload.acceptedByName}</p>
          <p><strong>Total:</strong> $${(payload.totalCents / 100).toFixed(2)}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/quotes/${payload.quoteId}">View Quote in Dashboard</a></p>
        `,
      });
    }

    // 2. Send confirmation to the customer (if we have their email)
    const quote = await db.quote.findUnique({
      where: { id: payload.quoteId },
      include: { customer: true, salesIntake: true },
    });

    const customerEmail = quote?.customer?.email || quote?.salesIntake?.email;

    if (customerEmail) {
      await resend.emails.send({
        from: "Struxient <notifications@struxient.com>",
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

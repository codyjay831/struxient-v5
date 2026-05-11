/**
 * Stubs for email/SMS notifications.
 * In a real production app, these would integrate with a provider like Resend, SendGrid, or Twilio.
 */

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

/**
 * Triggered when a new lead is submitted via the public intake form.
 */
export async function notifyLeadSubmitted(payload: LeadNotificationPayload) {
  console.log(`[Notification Stub] New Lead Submitted:`, payload);
  
  // TODO: Send email to organization staff
  // TODO: Send confirmation email to the customer
}

/**
 * Triggered when a customer accepts a quote via the public portal.
 */
export async function notifyQuoteAccepted(payload: QuoteAcceptanceNotificationPayload) {
  console.log(`[Notification Stub] Quote Accepted:`, payload);
  
  // TODO: Send email to organization staff
  // TODO: Send confirmation email to the customer
}

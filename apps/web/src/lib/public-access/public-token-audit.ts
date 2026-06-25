type PublicTokenAuditEvent =
  | "quote.view"
  | "quote.accept"
  | "quote.request_changes"
  | "change_order.view"
  | "change_order.accept"
  | "change_order.request_changes"
  | "change_order.office_note";

export function auditPublicTokenEvent(event: PublicTokenAuditEvent, detail: Record<string, unknown>) {
  // Placeholder audit sink until dedicated security audit stream is finalized.
  console.info("[public-token-audit]", event, detail);
}


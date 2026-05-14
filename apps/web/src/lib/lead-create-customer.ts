import type { LeadChannel } from "@prisma/client";
import { CUSTOMER_FIELD_LIMITS } from "@/app/(workspace)/customers/customer-field-limits";

export type LeadRowForCustomerPrep = {
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** When omitted (e.g. older UI callers), public-request note shaping is skipped. */
  channel?: LeadChannel;
  /**
   * Legacy alias accepted for back-compat with callers that previously sent `source`
   * (LeadChannel enum). Treated as `channel` when both are absent.
   */
  source?: LeadChannel;
};

export type PreparedCustomerFromLead =
  | {
      ok: true;
      data: {
        displayName: string;
        companyName: null;
        email: string | null;
        phone: string | null;
        notes: string;
      };
    }
  | { ok: false; error: string };

function trimOrEmpty(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }
  return value.trim();
}

function trimOrNull(value: string | null | undefined): string | null {
  const t = trimOrEmpty(value);
  return t === "" ? null : t;
}

/** Same pragmatic rule as `createCustomerAction`. */
function isReasonableCustomerEmail(value: string): boolean {
  if (value.length > CUSTOMER_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const TRUNC_MARKER = "\n\n[truncated]";

function extractPublicIntakeSection(normalizedNotes: string, header: string): string | null {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^${escaped}:\\s*\\n([\\s\\S]*?)(?=\\n\\n[^\\n]+:\\s*\\n|$)`,
    "im",
  );
  const m = normalizedNotes.match(re);
  const raw = m?.[1]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function buildCustomerNotesFromLead(lead: LeadRowForCustomerPrep): string {
  const max = CUSTOMER_FIELD_LIMITS.notes;
  const leadNotesRaw = trimOrEmpty(lead.notes);
  const channel = lead.channel ?? lead.source;

  if (channel === "WEB_FORM" && leadNotesRaw.includes("[Public Intake Form]")) {
    const n = leadNotesRaw.replace(/\r\n/g, "\n");
    const preferredTiming = extractPublicIntakeSection(n, "Preferred timing");
    const requestType = extractPublicIntakeSection(n, "Request type");
    const requestDetails = extractPublicIntakeSection(n, "What you need help with");

    const parts = [
      `Created from public request (lead: "${lead.title}").`,
      "The service address from the request is saved with this customer.",
    ];
    if (preferredTiming) {
      parts.push(`Preferred timing: ${preferredTiming}`);
    }
    if (requestType) {
      parts.push(`Request type: ${requestType}`);
    }
    if (requestDetails) {
      parts.push(`What they need:\n${requestDetails}`);
    }

    const body = parts.join("\n\n");
    if (body.length <= max) {
      return body;
    }
    const keep = max - TRUNC_MARKER.length;
    if (keep < 1) {
      return TRUNC_MARKER.slice(0, max);
    }
    return body.slice(0, keep) + TRUNC_MARKER;
  }

  const provenance = `Created from lead: "${lead.title}".`;
  let body = provenance;
  if (leadNotesRaw.length > 0) {
    body = `${provenance}\n\n${leadNotesRaw}`;
  }
  if (body.length <= max) {
    return body;
  }
  const keep = max - TRUNC_MARKER.length;
  if (keep < 1) {
    return TRUNC_MARKER.slice(0, max);
  }
  return body.slice(0, keep) + TRUNC_MARKER;
}

/**
 * Pure mapping + validation for “create Customer from Lead”.
 * Used by the server action and the lead detail preview UI.
 */
export function prepareCustomerFromLead(lead: LeadRowForCustomerPrep): PreparedCustomerFromLead {
  const contact = trimOrEmpty(lead.contactName);
  const displayName = contact.length > 0 ? contact : trimOrEmpty(lead.title);
  if (!displayName) {
    return { ok: false, error: "This lead needs a title to derive a customer display name." };
  }
  if (displayName.length > CUSTOMER_FIELD_LIMITS.displayName) {
    return {
      ok: false,
      error: `Customer display name would exceed ${CUSTOMER_FIELD_LIMITS.displayName} characters. Shorten the lead title or contact name first.`,
    };
  }

  const email = trimOrNull(lead.email);
  if (email && !isReasonableCustomerEmail(email)) {
    return {
      ok: false,
      error:
        "This lead has an email that is not valid for a customer record. Fix it on Edit lead, or clear the email, then try again.",
    };
  }

  const phone = trimOrNull(lead.phone);
  if (phone && phone.length > CUSTOMER_FIELD_LIMITS.phone) {
    return {
      ok: false,
      error: `Phone is too long for a customer record (max ${CUSTOMER_FIELD_LIMITS.phone} characters). Shorten it on Edit lead first.`,
    };
  }

  const notes = buildCustomerNotesFromLead(lead);

  return {
    ok: true,
    data: {
      displayName,
      companyName: null,
      email,
      phone,
      notes,
    },
  };
}

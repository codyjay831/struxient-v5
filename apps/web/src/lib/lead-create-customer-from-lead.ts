import { CUSTOMER_FIELD_LIMITS } from "@/app/(workspace)/customers/customer-field-limits";

export type LeadRowForCustomerPrep = {
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
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

function buildCustomerNotesFromLead(lead: LeadRowForCustomerPrep): string {
  const provenance = `Created from lead ${lead.title}.`;
  const leadNotes = trimOrEmpty(lead.notes);
  let body = provenance;
  if (leadNotes.length > 0) {
    body = `${provenance}\n\n${leadNotes}`;
  }
  const max = CUSTOMER_FIELD_LIMITS.notes;
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

import { normalizeEmailForMatch, normalizePhoneDigits } from "./lead-customer-contact-normalize";

/** Bounded org-scoped customer scan used by match hints and promotion gate. */
export const CUSTOMER_MATCH_FETCH_CAP = 500;

export type CustomerMatchHint = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  matchOn: "email" | "phone" | "both";
};

/** Human-readable match reason chips for customer-match decision UI. */
export function customerMatchReasonLabels(matchOn: CustomerMatchHint["matchOn"]): string[] {
  if (matchOn === "both") {
    return ["Same email", "Same phone"];
  }
  if (matchOn === "email") {
    return ["Same email"];
  }
  return ["Same phone"];
}

export type LeadCustomerMatchHints =
  | { kind: "skipped-no-contact" }
  | {
      kind: "checked";
      matches: CustomerMatchHint[];
      /** How many org-scoped customer rows were scanned (bounded fetch). */
      scannedCustomerCount: number;
      /** Upper bound used for the `take` query (scan may miss customers beyond this window). */
      fetchCap: number;
    };

type CustomerRow = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Exact normalized email and/or phone match within the provided customer rows.
 * Callers must pass org-scoped customers only.
 */
export function findCustomerMatchHints(
  customers: CustomerRow[],
  leadEmail: string | null | undefined,
  leadPhone: string | null | undefined,
  fetchCap: number,
): LeadCustomerMatchHints {
  const leadNormEmail = normalizeEmailForMatch(leadEmail);
  const leadNormPhone = normalizePhoneDigits(leadPhone);

  if (!leadNormEmail && !leadNormPhone) {
    return { kind: "skipped-no-contact" };
  }

  const scannedCustomerCount = customers.length;

  const byId = new Map<string, CustomerMatchHint>();

  for (const c of customers) {
    const ce = normalizeEmailForMatch(c.email);
    const cp = normalizePhoneDigits(c.phone);
    const emailMatch = Boolean(leadNormEmail && ce && ce === leadNormEmail);
    const phoneMatch = Boolean(leadNormPhone && cp && cp === leadNormPhone);
    if (!emailMatch && !phoneMatch) {
      continue;
    }
    const matchOn: CustomerMatchHint["matchOn"] =
      emailMatch && phoneMatch ? "both" : emailMatch ? "email" : "phone";
    byId.set(c.id, {
      id: c.id,
      displayName: c.displayName,
      companyName: c.companyName,
      email: c.email,
      phone: c.phone,
      matchOn,
    });
  }

  const matches = [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }),
  );

  return { kind: "checked", matches, scannedCustomerCount, fetchCap };
}

/** True when an unlinked lead has exact normalized email/phone matches to review. */
export function hasBlockingCustomerMatch(hints: LeadCustomerMatchHints): boolean {
  return hints.kind === "checked" && hints.matches.length > 0;
}

export type CustomerMatchRow = CustomerRow;

/**
 * Derive match hints for a lead contact against a pre-fetched org customer list.
 * Callers must pass org-scoped customers only.
 */
export function customerMatchHintsForLead(
  customers: CustomerMatchRow[],
  leadEmail: string | null | undefined,
  leadPhone: string | null | undefined,
  fetchCap: number = CUSTOMER_MATCH_FETCH_CAP,
): LeadCustomerMatchHints {
  return findCustomerMatchHints(customers, leadEmail, leadPhone, fetchCap);
}

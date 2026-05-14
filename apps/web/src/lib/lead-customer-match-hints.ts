import { normalizeEmailForMatch, normalizePhoneDigits } from "./lead-customer-contact-normalize";

export type CustomerMatchHint = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  matchOn: "email" | "phone" | "both";
};

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

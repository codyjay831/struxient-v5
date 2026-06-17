import { db } from "@/lib/db";
import {
  CUSTOMER_MATCH_FETCH_CAP,
  customerMatchHintsForLead,
  hasBlockingCustomerMatch,
  type CustomerMatchRow,
  type LeadCustomerMatchHints,
} from "@/lib/lead-customer-match-hints";

export { hasBlockingCustomerMatch, CUSTOMER_MATCH_FETCH_CAP };

const customerSelect = {
  id: true,
  displayName: true,
  companyName: true,
  email: true,
  phone: true,
} as const;

/**
 * Org-scoped customer rows for match scanning. Bounded fetch — matches beyond the
 * cap are not considered (same limitation as the lead surface UI).
 */
export async function loadOrgCustomersForMatchGate(
  organizationId: string,
  fetchCap: number = CUSTOMER_MATCH_FETCH_CAP,
): Promise<CustomerMatchRow[]> {
  return db.customer.findMany({
    where: { organizationId },
    orderBy: { displayName: "asc" },
    take: fetchCap,
    select: customerSelect,
  });
}

export function evaluateCustomerMatchGate(input: {
  customerId: string | null;
  email: string | null | undefined;
  phone: string | null | undefined;
  orgCustomers: CustomerMatchRow[];
  fetchCap?: number;
}): LeadCustomerMatchHints {
  if (input.customerId != null) {
    return { kind: "skipped-no-contact" };
  }
  return customerMatchHintsForLead(
    input.orgCustomers,
    input.email,
    input.phone,
    input.fetchCap ?? CUSTOMER_MATCH_FETCH_CAP,
  );
}

export function shouldBlockQuotePromotionForCustomerMatch(input: {
  customerId: string | null;
  hints: LeadCustomerMatchHints;
}): boolean {
  return input.customerId == null && hasBlockingCustomerMatch(input.hints);
}

export const CUSTOMER_MATCH_BLOCK_MESSAGE =
  "A customer with matching contact info already exists. Link to the existing record before building a quote.";

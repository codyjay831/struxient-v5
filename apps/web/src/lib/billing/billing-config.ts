/**
 * Launch billing product constants. Override via env where noted.
 */

export const BILLING_TERMS_VERSION = "2026-06-15";

/** Card-required trial length in days. */
export function getTrialDays(): number {
  const raw = process.env.STRUXIENT_TRIAL_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 14;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

/** Stripe Price id for the single base plan (monthly). */
export function getBaseStripePriceId(): string | null {
  const id = process.env.STRUXIENT_BASE_PRICE_ID?.trim();
  return id || null;
}

/** Included AI billable units per subscription billing period. 1 unit ≈ 1k tokens. */
export function getIncludedAiUnits(): number {
  const raw = process.env.AI_INCLUDED_UNITS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 500;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
}

/** Overage price in cents per billable unit above included allowance. */
export function getAiOveragePricePerUnitCents(): number {
  const raw = process.env.AI_OVERAGE_PRICE_PER_UNIT_CENTS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 2;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
}

/** Display name for the single plan. */
export const BASE_PLAN_NAME = "Struxient Pro";

/** Marketing display price when Stripe price lookup is unavailable (USD cents). */
export function getBasePlanDisplayAmountCents(): number {
  const raw = process.env.STRUXIENT_BASE_PLAN_DISPLAY_CENTS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 9900;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9900;
}

export function isStripeBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && getBaseStripePriceId());
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Tokens per one billable unit for metering. */
export const TOKENS_PER_BILLABLE_UNIT = 1000;

/** Minimum billable units charged per successful AI request. */
export const MIN_BILLABLE_UNITS_PER_REQUEST = 1;

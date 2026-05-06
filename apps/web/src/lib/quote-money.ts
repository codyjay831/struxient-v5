import { Prisma } from "@prisma/client";

const MAX_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * Parses user-entered USD (whole dollars and up to two fractional digits) into integer cents.
 * Avoids floating-point: only digits, optional single ".", and at most two decimal places.
 */
export function parseUsdStringToCents(
  raw: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Unit price is required." };
  }
  const normalized = trimmed.replace(/^\$\s*/, "").replace(/,/g, "").trim();
  if (normalized === "" || normalized === "." || normalized === "-") {
    return { ok: false, error: "Enter a valid dollar amount (for example 1250 or 1250.50)." };
  }
  if (normalized.startsWith("-")) {
    return { ok: false, error: "Unit price cannot be negative." };
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return {
      ok: false,
      error: "Enter a valid dollar amount with at most two decimal places.",
    };
  }
  const [wholePart, fracPart = ""] = normalized.split(".");
  const whole = Number.parseInt(wholePart, 10);
  if (!Number.isFinite(whole)) {
    return { ok: false, error: "Enter a valid dollar amount." };
  }
  const frac = (fracPart + "00").slice(0, 2);
  const fracNum = Number.parseInt(frac, 10);
  if (!Number.isFinite(fracNum)) {
    return { ok: false, error: "Enter a valid dollar amount." };
  }
  const cents = whole * 100 + fracNum;
  if (cents < 0 || !Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    return { ok: false, error: "Unit price is out of range." };
  }
  return { ok: true, cents };
}

/**
 * Parses a positive quantity for quote lines. Stored as Decimal on the quote line row.
 */
export function parsePositiveQuantityString(
  raw: string,
): { ok: true; decimal: Prisma.Decimal } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Quantity is required." };
  }
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(trimmed);
  } catch {
    return { ok: false, error: "Quantity is not a valid number." };
  }
  if (!d.isFinite()) {
    return { ok: false, error: "Quantity must be a finite number." };
  }
  if (d.lte(0)) {
    return { ok: false, error: "Quantity must be greater than zero." };
  }
  return { ok: true, decimal: d };
}

/**
 * lineTotalCents = round_half_up(quantity × unitAmountCents) to the nearest cent.
 * quantity is a Decimal; unitAmountCents is an integer.
 */
export function computeLineTotalCents(
  quantity: Prisma.Decimal,
  unitAmountCents: number,
): { ok: true; lineTotalCents: number } | { ok: false; error: string } {
  const product = quantity.mul(new Prisma.Decimal(unitAmountCents));
  const rounded = product.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const n = rounded.toNumber();
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_CENTS) {
    return { ok: false, error: "Line total is out of range." };
  }
  return { ok: true, lineTotalCents: n };
}

import { normalizeEmailForMatch, normalizePhoneDigits } from "./lead-customer-contact-normalize";

/**
 * Heuristics for "Smart" lead readiness.
 * Moves beyond basic existence checks to ensure data quality before promotion.
 */

export function isSmartIdentity(contactName: string | null, companyName: string | null): boolean {
  const name = (companyName || contactName || "").trim();
  // Must be at least 2 characters and contain at least one letter or number
  return name.length >= 2 && /[a-zA-Z0-9]/.test(name);
}

export function isSmartEmail(email: string | null): boolean {
  const normalized = normalizeEmailForMatch(email);
  if (!normalized) return false;
  // Basic but effective email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isSmartPhone(phone: string | null): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  // Must have at least 10 digits to be a valid US/standard phone number
  return digits.length >= 10;
}

export function isSmartAddress(address: string | null): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  // A single period or symbol is not an address.
  // Real addresses usually have a house number (digit) and a street name (letter).
  // We also check for a minimum length.
  const hasDigit = /\d/.test(trimmed);
  const hasLetter = /[a-zA-Z]/.test(trimmed);
  return trimmed.length >= 5 && hasDigit && hasLetter;
}

export type LeadReadinessReport = {
  hasIdentity: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  isReady: boolean;
};

export function evaluateLeadReadiness(params: {
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isAddressVerified?: boolean;
}): LeadReadinessReport {
  const hasIdentity = isSmartIdentity(params.contactName, params.companyName);
  const hasEmail = isSmartEmail(params.email);
  const hasPhone = isSmartPhone(params.phone);
  // Address is met if it's verified (Google Place ID) OR passes heuristics
  const hasAddress = params.isAddressVerified || isSmartAddress(params.address);

  return {
    hasIdentity,
    hasEmail,
    hasPhone,
    hasAddress,
    isReady: hasIdentity && hasEmail && hasPhone && hasAddress,
  };
}

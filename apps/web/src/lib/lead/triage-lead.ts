import type { Prisma } from "@prisma/client";
import { LeadInput } from "../schemas/lead-input";
import { db } from "../db";
import { normalizeEmailForMatch, normalizePhoneDigits } from "../lead-customer-contact-normalize";

export interface LeadSignals {
  duplicateCandidateIds: string[];
  suggestedTemplateIds: string[];
  urgencyHint?: "LOW" | "MEDIUM" | "HIGH";
  [key: string]: unknown;
}

/**
 * Pure-ish function that produces signals for a lead based on its input.
 * Does DB lookups for dedupe candidates but doesn't modify anything.
 */
export async function triageLead(input: LeadInput, organizationId: string): Promise<LeadSignals> {
  const signals: LeadSignals = {
    duplicateCandidateIds: [],
    suggestedTemplateIds: input.request.suggestedTemplateIds || [],
  };

  // 1. Dedupe Candidates
  const normEmail = normalizeEmailForMatch(input.contact.email);
  const normPhone = normalizePhoneDigits(input.contact.phone);

  if (normEmail || normPhone) {
    const orFilters: Prisma.CustomerWhereInput[] = [];
    if (normEmail) {
      orFilters.push({ email: { equals: input.contact.email!, mode: "insensitive" } });
    }
    if (normPhone) {
      orFilters.push({ phone: { equals: input.contact.phone! } });
    }
    const matches = await db.customer.findMany({
      where: {
        organizationId,
        OR: orFilters,
      },
      select: { id: true },
    });
    signals.duplicateCandidateIds = matches.map((m) => m.id);
  }

  // 2. Urgency Hint (Simple heuristic for now)
  const combinedText = `${input.title} ${input.request.scope || ""} ${input.notes || ""}`.toLowerCase();
  if (
    combinedText.includes("emergency") ||
    combinedText.includes("urgent") ||
    combinedText.includes("asap") ||
    combinedText.includes("leaking") ||
    combinedText.includes("no water") ||
    combinedText.includes("no heat")
  ) {
    signals.urgencyHint = "HIGH";
  } else if (combinedText.includes("soon") || combinedText.includes("next week")) {
    signals.urgencyHint = "MEDIUM";
  } else {
    signals.urgencyHint = "LOW";
  }

  return signals;
}

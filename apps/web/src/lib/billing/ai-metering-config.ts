/**
 * When true, AI usage is logged with real tokens and shadow billable units
 * but period/grant counters (usedUnits, usedAiUnits) are not incremented.
 */
export function isAiMeteringShadowMode(): boolean {
  const raw = process.env.AI_METERING_SHADOW?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

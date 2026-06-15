/** Default beta access length in days when creating an invite. */
export function getDefaultBetaDays(): number {
  const raw = process.env.BETA_DEFAULT_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/** How long a beta signup invite link stays valid before acceptance. */
export function getBetaInviteExpiryDays(): number {
  const raw = process.env.BETA_INVITE_EXPIRY_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 14;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

/** Default AI units included during beta (1 unit ≈ 1k tokens). */
export function getDefaultBetaAiUnits(): number {
  const raw = process.env.BETA_DEFAULT_AI_UNITS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 50;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
}

export function buildBetaSignupUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return `${base}/signup?beta=${encodeURIComponent(token)}`;
}

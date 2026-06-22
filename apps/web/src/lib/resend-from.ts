import { Resend } from "resend";

const DEFAULT_FROM_NAME = "Struxient";
const DEFAULT_FROM_EMAIL = "notifications@struxient.com";

let resendClient: Resend | null | undefined;

/** Lazy Resend client — reads RESEND_API_KEY at call time (test-friendly). */
export function getResendClient(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  resendClient = apiKey ? new Resend(apiKey) : null;
  return resendClient;
}

/** Test helper to reset cached client after env changes. */
export function resetResendClientForTests(): void {
  resendClient = undefined;
}

/**
 * Resend "from" address for transactional email.
 * Set RESEND_FROM_EMAIL to a verified domain address (e.g. onboarding@resend.dev in dev).
 */
export function getResendFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  return `${name} <${email}>`;
}

export function getResendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
}

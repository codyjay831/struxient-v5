export const CUSTOMER_PORTAL_SESSION_COOKIE = "struxient_customer_portal_session";

/** Default portal browser session lifetime. */
export const CUSTOMER_PORTAL_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Default magic-link lifetime for portal sign-in. */
export const CUSTOMER_PORTAL_MAGIC_LINK_TTL_MS = 72 * 60 * 60 * 1000;

export const CUSTOMER_PORTAL_MAGIC_LINK_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: "customer-portal-magic-link",
} as const;

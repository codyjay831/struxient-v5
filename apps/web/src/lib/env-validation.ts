/**
 * Validates required production environment variables at startup.
 * Called from db.ts so misconfiguration fails fast on first DB access.
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing: string[] = [];

  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    missing.push("AUTH_SECRET (min 32 characters)");
  }
  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }
  if (process.env.STORAGE_PROVIDER !== "gcs") {
    missing.push("STORAGE_PROVIDER=gcs");
  }
  if (!process.env.GCS_BUCKET_NAME) {
    missing.push("GCS_BUCKET_NAME");
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    missing.push("NEXT_PUBLIC_APP_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid production environment variables: ${missing.join(", ")}`,
    );
  }
}

export function isBetaSignupEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return process.env.BETA_SIGNUP_ENABLED === "true";
}

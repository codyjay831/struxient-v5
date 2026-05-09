import { StaffRole } from "@prisma/client";
import { getRequestContextOrThrow } from "./auth-context";

export type CurrentSession = {
  userId: string;
  organizationId: string;
  role: StaffRole;
  isDevFallback: boolean;
};

/**
 * Returns the current app principal.
 * In development, returns a fallback principal if no real session exists.
 * In production, returns null if no real auth provider is wired yet.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  try {
    const ctx = await getRequestContextOrThrow();
    return {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      role: ctx.role,
      isDevFallback: ctx.authSource === "dev",
    };
  } catch {
    return null;
  }
}

/**
 * Throws an error if no session exists.
 */
export async function requireCurrentSession(): Promise<CurrentSession> {
  const ctx = await getRequestContextOrThrow();
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    role: ctx.role,
    isDevFallback: ctx.authSource === "dev",
  };
}

/**
 * Returns the active organizationId from the session.
 */
export async function requireOrganizationId(): Promise<string> {
  const session = await requireCurrentSession();
  return session.organizationId;
}

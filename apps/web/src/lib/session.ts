import { StaffRole } from "@prisma/client";
import { DEV_ORGANIZATION_ID, DEV_USER_ID } from "./dev-organization";

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
  // TODO: Implement real auth provider lookup here (e.g. Auth.js)
  
  if (process.env.NODE_ENV === "development") {
    return {
      userId: DEV_USER_ID,
      organizationId: DEV_ORGANIZATION_ID,
      role: StaffRole.OWNER,
      isDevFallback: true,
    };
  }

  return null;
}

/**
 * Throws an error if no session exists.
 */
export async function requireCurrentSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Unauthorized: No active session found.");
  }
  return session;
}

/**
 * Returns the active organizationId from the session.
 */
export async function requireOrganizationId(): Promise<string> {
  const session = await requireCurrentSession();
  return session.organizationId;
}

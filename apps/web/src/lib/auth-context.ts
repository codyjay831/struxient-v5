import { StaffRole, Job, Quote } from "@prisma/client";
import { DEV_ORGANIZATION_ID, DEV_USER_ID, DEV_ORGANIZATION_NAME, DEV_ORGANIZATION_SLUG } from "./dev-organization";
import { auth } from "@/auth";
import { db } from "./db";
import {
  denyUnlessCanManageCommercial,
  denyUnlessCanManageOrgSettings,
  denyUnlessCanMutate,
} from "./staff-authz";

export interface RequestContext {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  role: StaffRole;
  authSource: "dev" | "session";
}

/**
 * Central resolver for the current request's tenant and user context.
 * 
 * In development: Falls back to a seeded dev user/org if no session exists.
 * In production: Strictly requires a valid session from an auth provider.
 */
export async function getRequestContextOrThrow(): Promise<RequestContext> {
  const session = await auth();

  if (session?.user?.id) {
    const activeOrganizationId =
      typeof session.user.activeOrganizationId === "string" ? session.user.activeOrganizationId : null;

    const membership = await db.membership.findFirst({
      where: {
        userId: session.user.id,
        ...(activeOrganizationId ? { organizationId: activeOrganizationId } : {}),
      },
      include: { organization: true },
    });

    if (membership) {
      return {
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug || "",
        userId: session.user.id,
        role: membership.role,
        authSource: "session",
      };
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const orgExists = await db.organization.findUnique({
      where: { id: DEV_ORGANIZATION_ID },
      select: { id: true },
    });

    if (!orgExists) {
      throw new Error(
        "Development organization not found. Run `npx prisma db seed` in apps/web.",
      );
    }

    // Return the stable dev context for local development
    return {
      organizationId: DEV_ORGANIZATION_ID,
      organizationName: DEV_ORGANIZATION_NAME,
      organizationSlug: DEV_ORGANIZATION_SLUG,
      userId: DEV_USER_ID,
      role: StaffRole.OWNER,
      authSource: "dev",
    };
  }

  throw new Error("Unauthorized: No active session found and dev fallback is disabled in production.");
}

/**
 * Requires an authenticated staff member who can perform field-level mutations.
 * Blocks VIEWER and SUBCONTRACTOR.
 */
export async function getMutableRequestContextOrThrow(): Promise<RequestContext> {
  const ctx = await getRequestContextOrThrow();
  const denied = denyUnlessCanMutate(ctx.role);
  if (denied) {
    throw new Error(denied);
  }
  return ctx;
}

/**
 * Requires OFFICE, ADMIN, or OWNER for commercial workflows (leads, quotes, customers).
 */
export async function getCommercialRequestContextOrThrow(): Promise<RequestContext> {
  const ctx = await getRequestContextOrThrow();
  const denied = denyUnlessCanManageCommercial(ctx.role);
  if (denied) {
    throw new Error(denied);
  }
  return ctx;
}

/**
 * Requires OWNER or ADMIN for organization configuration changes.
 */
export async function getSettingsRequestContextOrThrow(): Promise<RequestContext> {
  const ctx = await getRequestContextOrThrow();
  const denied = denyUnlessCanManageOrgSettings(ctx.role);
  if (denied) {
    throw new Error(denied);
  }
  return ctx;
}

/**
 * Optional context resolver. Returns null if no context can be resolved.
 */
export async function getOptionalRequestContext(): Promise<RequestContext | null> {
  try {
    return await getRequestContextOrThrow();
  } catch {
    return null;
  }
}

/**
 * Verifies that a job belongs to the current organization context.
 */
export async function requireJobAccess(jobId: string): Promise<Job> {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
  });
  if (!job) {
    throw new Error("Job not found or access denied.");
  }
  return job;
}

/**
 * Verifies that a quote belongs to the current organization context.
 */
export async function requireQuoteAccess(quoteId: string): Promise<Quote> {
  const ctx = await getRequestContextOrThrow();
  const quote = await db.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
  });
  if (!quote) {
    throw new Error("Quote not found or access denied.");
  }
  return quote;
}


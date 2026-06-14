import { Job, Quote } from "@prisma/client";
import { db } from "./db";
import {
  denyUnlessCanManageCommercial,
  denyUnlessCanManageOrgSettings,
  denyUnlessCanMutate,
} from "./staff-authz";
import {
  getJobVisibilityWhere,
  getTaskVisibilityWhere,
} from "@/lib/authz/resource-access";
import {
  resolveActorContextOrThrow,
  type ActorContext,
} from "@/lib/authz/context";

export type RequestContext = ActorContext;

/**
 * Central resolver for the current request's tenant and user context.
 * 
 * In development: Falls back to a seeded dev user/org if no session exists.
 * In production: Strictly requires a valid session from an auth provider.
 */
export async function getRequestContextOrThrow(): Promise<RequestContext> {
  return resolveActorContextOrThrow();
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

export async function getCommercialRequestContextOrNull(): Promise<RequestContext | null> {
  try {
    return await getCommercialRequestContextOrThrow();
  } catch {
    return null;
  }
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
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      ...getJobVisibilityWhere(ctx.role, ctx.userId),
    },
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
  const denied = denyUnlessCanManageCommercial(ctx.role);
  if (denied) {
    throw new Error(denied);
  }
  const quote = await db.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
  });
  if (!quote) {
    throw new Error("Quote not found or access denied.");
  }
  return quote;
}

export async function requireTaskAccess(taskId: string) {
  const ctx = await getRequestContextOrThrow();
  const task = await db.jobTask.findFirst({
    where: {
      id: taskId,
      job: {
        organizationId: ctx.organizationId,
        ...getJobVisibilityWhere(ctx.role, ctx.userId),
      },
      ...getTaskVisibilityWhere(ctx.role, ctx.userId),
    },
    select: { id: true, jobId: true },
  });
  if (!task) {
    throw new Error("Task not found or access denied.");
  }
  return task;
}


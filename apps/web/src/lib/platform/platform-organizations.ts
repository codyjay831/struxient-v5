import {
  JobStatus,
  JobTaskStatus,
  LeadStatus,
  NotificationStatus,
  OrganizationInviteStatus,
  QuoteStatus,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import { isBetaGrantActive } from "@/lib/beta/beta-grant";
import { normalizePageQuery, toPageResult } from "./platform-pagination";
import { toRedactedAiFailure, toRedactedNotificationFailure } from "./platform-redaction";
import type {
  PlatformContext,
  PlatformOrganizationListItem,
  PlatformOrganizationSummary,
  PlatformPageQuery,
  PlatformPageResult,
} from "./platform-types";

export async function listPlatformOrganizations(
  _ctx: PlatformContext,
  query: PlatformPageQuery,
): Promise<PlatformPageResult<PlatformOrganizationListItem>> {
  const { page, pageSize, q } = normalizePageQuery(query);
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [totalCount, organizations] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { memberships: true, jobs: true } },
        memberships: {
          where: { role: StaffRole.OWNER },
          take: 3,
          select: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
  ]);

  const items: PlatformOrganizationListItem[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
    memberCount: org._count.memberships,
    jobCount: org._count.jobs,
    ownerNames: org.memberships
      .map((m) => m.user.name || m.user.email || "Unnamed")
      .filter(Boolean),
  }));

  return toPageResult(items, totalCount, page, pageSize);
}

const AI_WINDOW_DAYS = 30;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function countsByStatus<T extends string>(
  groups: Array<{ status: T; _count: { _all: number } }>,
): Promise<Record<string, number>> {
  return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
}

export async function getPlatformOrganizationSummary(
  _ctx: PlatformContext,
  organizationId: string,
): Promise<PlatformOrganizationSummary | null> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      createdAt: true,
      businessProfile: {
        select: { trades: true, teamSize: true },
      },
      memberships: {
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      organizationInvites: {
        where: {
          status: OrganizationInviteStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          normalizedEmail: true,
          role: true,
          expiresAt: true,
        },
      },
      subscription: {
        select: {
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
      betaGrant: {
        select: {
          expiresAt: true,
          aiEnabled: true,
          aiIncludedUnits: true,
          usedAiUnits: true,
          revokedAt: true,
        },
      },
    },
  });

  if (!organization) return null;

  const since = daysAgo(AI_WINDOW_DAYS);

  const [
    jobGroups,
    quoteGroups,
    leadGroups,
    taskGroups,
    recentAiFailures,
    aiFeatureGroups,
    recentNotificationFailures,
    recentPlatformAuditEvents,
    currentAiBillingPeriod,
    aiCostAggregate,
  ] = await Promise.all([
    db.job.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.quote.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.lead.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.jobTask.groupBy({
      by: ["status"],
      where: { job: { organizationId } },
      _count: { _all: true },
    }),
    db.aiUsageLog.findMany({
      where: { organizationId, status: "error" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        feature: true,
        provider: true,
        model: true,
        status: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    db.aiUsageLog.groupBy({
      by: ["feature", "status"],
      where: { organizationId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.notificationEvent.findMany({
      where: { organizationId, status: NotificationStatus.FAILED },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        title: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    db.platformAuditEvent.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        createdAt: true,
        actorType: true,
        actorUserId: true,
        actorEmailSnapshot: true,
        action: true,
        targetType: true,
        targetId: true,
        organizationId: true,
        reason: true,
        outcome: true,
        requestId: true,
        metadataJson: true,
      },
    }),
    db.aiBillingPeriod.findFirst({
      where: { organizationId },
      orderBy: { periodStart: "desc" },
      select: {
        periodStart: true,
        includedAllowanceUnits: true,
        usedUnits: true,
        overageUnits: true,
        overageAmountCents: true,
        invoiceStatus: true,
      },
    }),
    db.aiUsageLog.aggregate({
      where: { organizationId, status: "success", createdAt: { gte: since } },
      _sum: { estimatedCostCents: true },
    }),
  ]);

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    timezone: organization.timezone,
    createdAt: organization.createdAt,
    businessProfile: organization.businessProfile
      ? {
          trades: organization.businessProfile.trades,
          teamSize: organization.businessProfile.teamSize,
        }
      : null,
    memberships: organization.memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt,
    })),
    pendingInvites: organization.organizationInvites.map((invite) => ({
      id: invite.id,
      email: invite.normalizedEmail,
      role: invite.role,
      expiresAt: invite.expiresAt,
    })),
    jobCountsByStatus: await countsByStatus<JobStatus>(jobGroups),
    quoteCountsByStatus: await countsByStatus<QuoteStatus>(quoteGroups),
    leadCountsByStatus: await countsByStatus<LeadStatus>(leadGroups),
    taskCountsByStatus: await countsByStatus<JobTaskStatus>(taskGroups),
    recentAiFailures: recentAiFailures.map(toRedactedAiFailure),
    aiCountsByFeature: aiFeatureGroups.map((row) => ({
      feature: row.feature,
      status: row.status,
      count: row._count._all,
    })),
    recentNotificationFailures: recentNotificationFailures.map(toRedactedNotificationFailure),
    recentPlatformAuditEvents: recentPlatformAuditEvents.map((event) => ({
      ...event,
      metadataJson:
        event.metadataJson && typeof event.metadataJson === "object" && !Array.isArray(event.metadataJson)
          ? (event.metadataJson as Record<string, unknown>)
          : null,
    })),
    subscription: organization.subscription
      ? {
          status: organization.subscription.status,
          trialEndsAt: organization.subscription.trialEndsAt,
          currentPeriodEnd: organization.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: organization.subscription.cancelAtPeriodEnd,
        }
      : null,
    aiBillingPeriod: currentAiBillingPeriod
      ? {
          includedAllowanceUnits: currentAiBillingPeriod.includedAllowanceUnits,
          usedUnits: currentAiBillingPeriod.usedUnits,
          overageUnits: currentAiBillingPeriod.overageUnits,
          overageAmountCents: currentAiBillingPeriod.overageAmountCents,
          invoiceStatus: currentAiBillingPeriod.invoiceStatus,
        }
      : null,
    aiEstimatedCostCentsLast30Days: aiCostAggregate._sum.estimatedCostCents ?? 0,
    betaGrant: organization.betaGrant
      ? {
          expiresAt: organization.betaGrant.expiresAt,
          aiEnabled: organization.betaGrant.aiEnabled,
          aiIncludedUnits: organization.betaGrant.aiIncludedUnits,
          usedAiUnits: organization.betaGrant.usedAiUnits,
          revokedAt: organization.betaGrant.revokedAt,
          active: isBetaGrantActive(organization.betaGrant),
        }
      : null,
  };
}

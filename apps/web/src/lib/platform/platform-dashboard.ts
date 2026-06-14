import { NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { PlatformContext, PlatformDashboardSummary } from "./platform-types";

const RECENT_WINDOW_DAYS = 7;

function recentWindowStart(): Date {
  const date = new Date();
  date.setDate(date.getDate() - RECENT_WINDOW_DAYS);
  return date;
}

export async function getPlatformDashboardSummary(
  _ctx: PlatformContext,
): Promise<PlatformDashboardSummary> {
  const since = recentWindowStart();

  const [
    organizationCount,
    userCount,
    recentOrganizations,
    recentAuditEvents,
    recentAiFailureCount,
    recentNotificationFailureCount,
  ] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.organization.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { id: true, name: true, createdAt: true },
    }),
    db.platformAuditEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
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
    db.aiUsageLog.count({
      where: { status: "error", createdAt: { gte: since } },
    }),
    db.notificationEvent.count({
      where: { status: NotificationStatus.FAILED, createdAt: { gte: since } },
    }),
  ]);

  return {
    organizationCount,
    userCount,
    recentOrganizations,
    recentAiFailureCount,
    recentNotificationFailureCount,
    recentAuditEvents: recentAuditEvents.map((event) => ({
      ...event,
      metadataJson:
        event.metadataJson && typeof event.metadataJson === "object" && !Array.isArray(event.metadataJson)
          ? (event.metadataJson as Record<string, unknown>)
          : null,
    })),
  };
}

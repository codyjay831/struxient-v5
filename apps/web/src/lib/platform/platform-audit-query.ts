import { PlatformAuditOutcome } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePageQuery, toPageResult } from "./platform-pagination";
import type {
  PlatformAuditEventDto,
  PlatformAuditFilters,
  PlatformContext,
  PlatformPageResult,
} from "./platform-types";

const ALLOWED_OUTCOMES = new Set<string>(Object.values(PlatformAuditOutcome));

export function normalizePlatformAuditFilters(
  filters: PlatformAuditFilters,
): PlatformAuditFilters {
  const { page, pageSize } = normalizePageQuery(filters);
  return {
    page,
    pageSize,
    actorUserId: filters.actorUserId?.trim() || undefined,
    organizationId: filters.organizationId?.trim() || undefined,
    action: filters.action?.trim() || undefined,
    outcome:
      filters.outcome && ALLOWED_OUTCOMES.has(filters.outcome) ? filters.outcome : undefined,
  };
}

function toAuditDto(event: {
  id: string;
  createdAt: Date;
  actorType: string;
  actorUserId: string | null;
  actorEmailSnapshot: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  organizationId: string | null;
  reason: string | null;
  outcome: PlatformAuditEventDto["outcome"];
  requestId: string | null;
  metadataJson: unknown;
}): PlatformAuditEventDto {
  return {
    ...event,
    metadataJson:
      event.metadataJson &&
      typeof event.metadataJson === "object" &&
      !Array.isArray(event.metadataJson)
        ? (event.metadataJson as Record<string, unknown>)
        : null,
  };
}

export async function listPlatformAuditEvents(
  _ctx: PlatformContext,
  filters: PlatformAuditFilters,
): Promise<PlatformPageResult<PlatformAuditEventDto>> {
  const normalized = normalizePlatformAuditFilters(filters);
  const page = normalized.page ?? 1;
  const pageSize = normalized.pageSize ?? 25;

  const where = {
    ...(normalized.actorUserId ? { actorUserId: normalized.actorUserId } : {}),
    ...(normalized.organizationId ? { organizationId: normalized.organizationId } : {}),
    ...(normalized.action ? { action: normalized.action } : {}),
    ...(normalized.outcome ? { outcome: normalized.outcome } : {}),
  };

  const [totalCount, events] = await Promise.all([
    db.platformAuditEvent.count({ where }),
    db.platformAuditEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
  ]);

  return toPageResult(events.map(toAuditDto), totalCount, page, pageSize);
}

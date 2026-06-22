import {
  CustomerPortalAccessLevel,
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
  type Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";

const ACCESS_LEVEL_RANK: Record<CustomerPortalAccessLevel, number> = {
  VIEW_ONLY: 1,
  PROJECT_PARTICIPANT: 2,
  BILLING_CONTACT: 3,
  DECISION_MAKER: 4,
  PROPERTY_MANAGER: 4,
};

export function accessLevelAllows(
  viewerLevel: CustomerPortalAccessLevel,
  requiredLevel: CustomerPortalAccessLevel | null | undefined,
): boolean {
  if (!requiredLevel) return true;
  return ACCESS_LEVEL_RANK[viewerLevel] >= ACCESS_LEVEL_RANK[requiredLevel];
}

export async function markResourceCustomerVisible(
  input: {
    organizationId: string;
    customerId: string;
    jobId: string;
    resourceType: CustomerVisibleResourceType;
    resourceId: string;
    visibility?: CustomerVisibleResourceVisibility;
    visibleToAccessLevel?: CustomerPortalAccessLevel | null;
    title?: string | null;
    description?: string | null;
    createdByMembershipId: string;
    customerPortalAccessId?: string | null;
  },
  tx?: ExtendedTransactionClient,
): Promise<{ id: string }> {
  const client = tx ?? db;
  const existing = await client.customerVisibleResource.findFirst({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revokedAt: null,
    },
  });

  if (existing) {
    const updated = await client.customerVisibleResource.update({
      where: { id: existing.id },
      data: {
        visibility: input.visibility ?? CustomerVisibleResourceVisibility.CUSTOMER_VISIBLE,
        visibleToAccessLevel: input.visibleToAccessLevel ?? null,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        updatedAt: new Date(),
      },
    });
    return { id: updated.id };
  }

  const created = await client.customerVisibleResource.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      jobId: input.jobId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      visibility: input.visibility ?? CustomerVisibleResourceVisibility.CUSTOMER_VISIBLE,
      visibleToAccessLevel: input.visibleToAccessLevel ?? null,
      title: input.title ?? null,
      description: input.description ?? null,
      createdByMembershipId: input.createdByMembershipId,
      customerPortalAccessId: input.customerPortalAccessId ?? null,
    },
  });
  return { id: created.id };
}

export async function revokeCustomerVisibleResource(
  resourceId: string,
  organizationId: string,
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.customerVisibleResource.updateMany({
    where: { id: resourceId, organizationId, revokedAt: null },
    data: {
      visibility: CustomerVisibleResourceVisibility.REVOKED,
      revokedAt: new Date(),
    },
  });
}

export async function authorizeVisibleResource(
  input: {
    organizationId: string;
    customerId: string;
    jobId: string;
    resourceType: CustomerVisibleResourceType;
    resourceId: string;
    viewerAccessLevel: CustomerPortalAccessLevel;
  },
  tx?: ExtendedTransactionClient,
): Promise<{ id: string; visibility: CustomerVisibleResourceVisibility } | null> {
  const client = tx ?? db;
  const row = await client.customerVisibleResource.findFirst({
    where: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      jobId: input.jobId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revokedAt: null,
      visibility: { not: CustomerVisibleResourceVisibility.REVOKED },
    },
  });
  if (!row) return null;
  if (!accessLevelAllows(input.viewerAccessLevel, row.visibleToAccessLevel)) {
    return null;
  }
  return { id: row.id, visibility: row.visibility };
}

export async function listVisibleResourcesForJob(
  input: {
    organizationId: string;
    customerId: string;
    jobId: string;
    viewerAccessLevel: CustomerPortalAccessLevel;
    resourceTypes?: CustomerVisibleResourceType[];
  },
) {
  const rows = await db.customerVisibleResource.findMany({
    where: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      jobId: input.jobId,
      revokedAt: null,
      visibility: { not: CustomerVisibleResourceVisibility.REVOKED },
      ...(input.resourceTypes ? { resourceType: { in: input.resourceTypes } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.filter((row) => accessLevelAllows(input.viewerAccessLevel, row.visibleToAccessLevel));
}

export type VisibleResourceSummary = {
  id: string;
  resourceType: CustomerVisibleResourceType;
  resourceId: string;
  visibility: CustomerVisibleResourceVisibility;
  title: string | null;
  description: string | null;
  metadataJson?: Prisma.InputJsonValue;
};

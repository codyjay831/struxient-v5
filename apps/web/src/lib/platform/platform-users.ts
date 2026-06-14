import { db } from "@/lib/db";
import { normalizePageQuery, toPageResult } from "./platform-pagination";
import type {
  PlatformContext,
  PlatformPageQuery,
  PlatformPageResult,
  PlatformUserListItem,
} from "./platform-types";

export async function listPlatformUsers(
  _ctx: PlatformContext,
  query: PlatformPageQuery,
): Promise<PlatformPageResult<PlatformUserListItem>> {
  const { page, pageSize, q } = normalizePageQuery(query);
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [totalCount, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        lastActiveOrganizationId: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const lastActiveOrgIds = [
    ...new Set(
      users
        .map((user) => user.lastActiveOrganizationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const lastActiveOrgs =
    lastActiveOrgIds.length > 0
      ? await db.organization.findMany({
          where: { id: { in: lastActiveOrgIds } },
          select: { id: true, name: true },
        })
      : [];

  const orgNameById = new Map(lastActiveOrgs.map((org) => [org.id, org.name]));

  const items: PlatformUserListItem[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified != null,
    lastActiveOrganizationName: user.lastActiveOrganizationId
      ? (orgNameById.get(user.lastActiveOrganizationId) ?? null)
      : null,
    memberships: user.memberships.map((membership) => ({
      organizationId: membership.organization.id,
      organizationName: membership.organization.name,
      role: membership.role,
    })),
  }));

  return toPageResult(items, totalCount, page, pageSize);
}

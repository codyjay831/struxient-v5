import { StaffRole } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
  DEV_ORGANIZATION_SLUG,
  DEV_USER_ID,
} from "@/lib/dev-organization";
import { selectDeterministicMembership } from "./membership-selection";

export interface ActorContext {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  role: StaffRole;
  authSource: "dev" | "session";
}

export async function resolveActorContextOrThrow(): Promise<ActorContext> {
  const session = await auth();

  if (session?.user?.id) {
    const userRow = await db.user.findUnique({
      where: { id: session.user.id },
      select: { lastActiveOrganizationId: true },
    });
    const preferredOrganizationId =
      userRow?.lastActiveOrganizationId ??
      (typeof session.user.activeOrganizationId === "string"
        ? session.user.activeOrganizationId
        : null);

    const memberships = await db.membership.findMany({
      where: { userId: session.user.id },
      include: { organization: true },
    });

    const selected = selectDeterministicMembership<(typeof memberships)[number]>(
      memberships,
      preferredOrganizationId,
    );

    if (selected) {
      return {
        organizationId: selected.organizationId,
        organizationName: selected.organization.name,
        organizationSlug: selected.organization.slug ?? "",
        userId: session.user.id,
        role: selected.role,
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

    return {
      organizationId: DEV_ORGANIZATION_ID,
      organizationName: DEV_ORGANIZATION_NAME,
      organizationSlug: DEV_ORGANIZATION_SLUG,
      userId: DEV_USER_ID,
      role: StaffRole.OWNER,
      authSource: "dev",
    };
  }

  throw new Error(
    "Unauthorized: No active session found and dev fallback is disabled in production.",
  );
}

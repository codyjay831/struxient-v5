import { PrismaClient, StaffRole } from "@prisma/client";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
  DEV_ORGANIZATION_SLUG,
  DEV_USER_ID,
} from "./dev-organization";
import {
  effectivePublicRequestSettingsFromRow,
  type EffectivePublicRequestSettings,
} from "@/lib/public-request-settings-effective";

const prismaClientSingleton = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env and set DATABASE_URL for your environment."
    );
  }
  return new PrismaClient();
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

function getPrisma(): PrismaClient {
  if (!globalThis.prisma) {
    globalThis.prisma = prismaClientSingleton();
  }
  return globalThis.prisma;
}

/**
 * Lazily instantiates Prisma so `next build` can load route modules without DATABASE_URL.
 * The first real query still requires DATABASE_URL and fails with the error above if unset.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop) as unknown;
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Temporary development-only tenant selection until auth and org context exist.
 * Uses a fixed development organization id aligned with prisma/seed.ts — not RBAC.
 */
export async function getDevOrganizationOrThrow() {
  const existing = await db.organization.findUnique({
    where: { id: DEV_ORGANIZATION_ID },
  });
  if (existing) {
    if (!existing.slug) {
      await db.organization.update({
        where: { id: DEV_ORGANIZATION_ID },
        data: { slug: DEV_ORGANIZATION_SLUG },
      });
      return db.organization.findUniqueOrThrow({
        where: { id: DEV_ORGANIZATION_ID },
      });
    }
    return existing;
  }
  return db.organization.create({
    data: {
      id: DEV_ORGANIZATION_ID,
      name: DEV_ORGANIZATION_NAME,
      slug: DEV_ORGANIZATION_SLUG,
    },
  });
}

/**
 * Development-only helper to ensure a dev user and membership exist.
 * Gated by NODE_ENV !== "production".
 */
export async function ensureDevUserAndMembership() {
  if (process.env.NODE_ENV === "production") return;

  const org = await getDevOrganizationOrThrow();

  const devUser = await db.user.upsert({
    where: { id: DEV_USER_ID },
    update: { email: "dev@struxient.local", name: "Dev User" },
    create: {
      id: DEV_USER_ID,
      email: "dev@struxient.local",
      name: "Dev User",
    },
  });

  await db.membership.upsert({
    where: {
      userId_organizationId: {
        userId: devUser.id,
        organizationId: org.id,
      },
    },
    update: { role: StaffRole.OWNER },
    create: {
      userId: devUser.id,
      organizationId: org.id,
      role: StaffRole.OWNER,
    },
  });
}

export type PublicRequestIntakeBundle = {
  organizationDisplayName: string;
  companySlug: string;
  intake: EffectivePublicRequestSettings;
};

/**
 * Public `/request/[slug]` payload: org display name, slug, and effective intake settings.
 * Returns null when no organization matches the slug.
 */
export async function getPublicRequestIntakeBundleBySlug(
  slug: string,
): Promise<PublicRequestIntakeBundle | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const org = await db.organization.findFirst({
    where: { slug: normalized },
    select: {
      name: true,
      slug: true,
      publicRequestSettings: {
        select: {
          enabled: true,
          formTitle: true,
          introMessage: true,
          emergencyWarningText: true,
          submitButtonText: true,
          requestTypeOptionsJson: true,
        },
      },
    },
  });
  if (!org?.slug) {
    return null;
  }
  const intake = effectivePublicRequestSettingsFromRow(org.publicRequestSettings);
  return {
    organizationDisplayName: org.name,
    companySlug: org.slug,
    intake,
  };
}

import { PrismaClient } from "@prisma/client";
import { DEV_ORGANIZATION_ID, DEV_ORGANIZATION_NAME } from "./dev-organization";

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
    return existing;
  }
  return db.organization.create({
    data: {
      id: DEV_ORGANIZATION_ID,
      name: DEV_ORGANIZATION_NAME,
    },
  });
}

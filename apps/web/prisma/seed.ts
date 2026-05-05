import { PrismaClient } from "@prisma/client";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
} from "../src/lib/dev-organization";

const prisma = new PrismaClient();

/** Development seed data only — not production records. */
async function main() {
  console.log("[dev seed] Starting development seed…");

  const devOrg = await prisma.organization.upsert({
    where: { id: DEV_ORGANIZATION_ID },
    update: { name: DEV_ORGANIZATION_NAME },
    create: {
      id: DEV_ORGANIZATION_ID,
      name: DEV_ORGANIZATION_NAME,
    },
  });

  console.log(`[dev seed] Organization: ${devOrg.name} (${devOrg.id})`);

  const devCustomers = [
    {
      id: "dev-customer-acme",
      displayName: "Acme Corp",
      companyName: "Acme Corporation",
      email: "contact@acme.com",
      phone: "555-0100",
      notes: "[dev seed] Primary test customer.",
      organizationId: devOrg.id,
    },
    {
      id: "dev-customer-globex",
      displayName: "Globex Corporation",
      companyName: "Globex Corp",
      email: "info@globex.com",
      phone: "555-0200",
      notes: "[dev seed] Secondary test customer.",
      organizationId: devOrg.id,
    },
    {
      id: "dev-customer-soylent",
      displayName: "Soylent Corp",
      companyName: "Soylent Corporation",
      email: "hello@soylent.com",
      phone: "555-0300",
      notes: "[dev seed] Tertiary test customer.",
      organizationId: devOrg.id,
    },
  ] as const;

  for (const row of devCustomers) {
    await prisma.customer.upsert({
      where: { id: row.id },
      update: {
        displayName: row.displayName,
        companyName: row.companyName,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        organizationId: row.organizationId,
      },
      create: row,
    });
  }

  console.log("[dev seed] Completed (idempotent upserts).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

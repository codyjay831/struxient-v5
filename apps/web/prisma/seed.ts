/**
 * Dev seed (post-Signal-Engine clean-break).
 *
 * Bootstraps a single development organization, owner membership, legacy stage rows,
 * trade-contractor Scope Library presets, and linked journey fixtures across the
 * lead → quote → line items → tasks → checkpoint → job spine:
 *
 *   - Intake-only lead (NEW)
 *   - Customer attached, ready to quote (TRIAGING)
 *   - Single-line draft in progress
 *   - Multi-trade kitchen draft (Scope Library)
 *   - Panel upgrade sent to customer (SENT + checkpoint)
 *   - Master bath approved, ready to activate (APPROVED + checkpoint)
 *   - Re-roof + skylight activated job (signal handshake demo)
 *
 * Stage rows are dynamic and per-org under the Signal Engine model.
 */

import { LeadChannel, Prisma, PrismaClient, StaffRole } from "@prisma/client";
import { seedTradeLineItemPresets } from "./seeds/trade-line-item-presets";
import { seedJourneyFixtures } from "./seeds/journey-fixtures";
import { DEFAULT_INTAKE_FORM_SCHEMA } from "../src/lib/intake/default-intake-form";

const prisma = new PrismaClient();

const DEV_ORG_ID = "dev-org-id";
const DEV_ORG_NAME = "Dev Contractor LLC";
const DEV_ORG_SLUG = "dev-contractor";
const DEV_USER_ID = "dev-user-id";
const DEV_USER_EMAIL = "owner@dev.local";
const DEV_USER_NAME = "Dev Owner";

const LEGACY_STAGE_NAMES: ReadonlyArray<string> = [
  "Pre-Construction",
  "Permitting",
  "Mobilization",
  "Site Prep",
  "Rough-In",
  "Inspection",
  "Finishes",
  "Walkthrough",
  "Closeout",
];

async function seedDevOrganization() {
  await prisma.organization.upsert({
    where: { id: DEV_ORG_ID },
    update: { name: DEV_ORG_NAME, slug: DEV_ORG_SLUG },
    create: { id: DEV_ORG_ID, name: DEV_ORG_NAME, slug: DEV_ORG_SLUG },
  });
}

async function seedPublicRequestSettings() {
  await prisma.publicRequestSettings.upsert({
    where: { organizationId: DEV_ORG_ID },
    update: { enabled: true },
    create: {
      organizationId: DEV_ORG_ID,
      enabled: true,
    },
  });
}

async function seedDefaultIntakeFormDefinition() {
  const slug = "default";
  const existing = await prisma.intakeFormDefinition.findUnique({
    where: { organizationId_slug: { organizationId: DEV_ORG_ID, slug } },
    select: { id: true },
  });
  if (existing) {
    await prisma.intakeFormDefinition.update({
      where: { id: existing.id },
      data: {
        name: "Service Request",
        channel: LeadChannel.WEB_FORM,
        isPublic: true,
        isDefault: true,
        archivedAt: null,
        schema: DEFAULT_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }
  await prisma.intakeFormDefinition.create({
    data: {
      organizationId: DEV_ORG_ID,
      slug,
      name: "Service Request",
      channel: LeadChannel.WEB_FORM,
      isPublic: true,
      isDefault: true,
      schema: DEFAULT_INTAKE_FORM_SCHEMA as unknown as Prisma.InputJsonValue,
    },
  });
}

async function seedDevOwnerUserAndMembership() {
  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: { email: DEV_USER_EMAIL, name: DEV_USER_NAME },
    create: { id: DEV_USER_ID, email: DEV_USER_EMAIL, name: DEV_USER_NAME },
  });

  const existing = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: DEV_USER_ID, organizationId: DEV_ORG_ID } },
  });
  if (!existing) {
    await prisma.membership.create({
      data: {
        userId: DEV_USER_ID,
        organizationId: DEV_ORG_ID,
        role: StaffRole.OWNER,
      },
    });
  }
}

async function seedLegacyStages() {
  for (let i = 0; i < LEGACY_STAGE_NAMES.length; i++) {
    const id = `legacy-${DEV_ORG_ID}-${i}`;
    await prisma.stage.upsert({
      where: { id },
      update: {
        organizationId: DEV_ORG_ID,
        name: LEGACY_STAGE_NAMES[i],
        sortOrder: i,
        archivedAt: null,
      },
      create: {
        id,
        organizationId: DEV_ORG_ID,
        name: LEGACY_STAGE_NAMES[i],
        sortOrder: i,
      },
    });
  }
}

async function main() {
  console.log("Seeding dev organization, owner membership, and Stage rows…");
  await seedDevOrganization();
  await seedDevOwnerUserAndMembership();
  await seedLegacyStages();

  console.log("Seeding public request settings + default intake form definition…");
  await seedPublicRequestSettings();
  await seedDefaultIntakeFormDefinition();

  console.log("Seeding trade-contractor Scope Library presets…");
  const presets = await seedTradeLineItemPresets(prisma, DEV_ORG_ID);
  console.log(
    `  ${presets.tradesSeeded} trades, ${presets.lineItemsSeeded} line items, ${presets.tasksSeeded} tasks`,
  );

  console.log("Seeding linked journey fixtures (leads → quotes → job)…");
  const journey = await seedJourneyFixtures(prisma, {
    organizationId: DEV_ORG_ID,
    organizationName: DEV_ORG_NAME,
    actorUserId: DEV_USER_ID,
  });
  console.log(
    `  ${journey.customers} customers, ${journey.leads} leads`,
  );
  for (const [key, summary] of Object.entries(journey.quotes)) {
    const jobNote = "jobId" in summary && summary.jobId ? ` job=${summary.jobId}` : "";
    console.log(
      `  quote[${key}] lines=${summary.lineCount} total=$${(summary.totalCents / 100).toFixed(2)}${jobNote}`,
    );
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

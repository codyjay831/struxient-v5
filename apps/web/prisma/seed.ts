/**
 * Dev seed (post-Signal-Engine clean-break).
 *
 * Bootstraps a single development organization, owner membership, the 9 legacy
 * stage rows the trade-preset seeds depend on (`legacy-${orgId}-${i}`), the
 * trade-contractor Scope Library presets, and two demo draft quotes:
 *
 *   1. Kitchen Remodel — multi-trade scope materialized from the Scope Library.
 *   2. Roof + Skylight — exercises the signal handshake end-to-end:
 *      `dev-trade-roofing-full-tearoff-reroof` provides "roof-prepped" and
 *      `dev-trade-roofing-skylight-install-fixed` requires it. Activating the
 *      demo job and completing the dry-in task should unblock the skylight
 *      install task.
 *
 * Stage rows are dynamic and per-org under the new Signal Engine model.
 */

import { LeadChannel, LeadStatus, Prisma, PrismaClient, QuoteStatus, StaffRole } from "@prisma/client";
import { seedTradeLineItemPresets } from "./seeds/trade-line-item-presets";
import { seedKitchenRemodelDemoQuote } from "./seeds/demo-quote-kitchen-remodel";
import { DEFAULT_INTAKE_FORM_SCHEMA } from "../src/lib/intake/default-intake-form";

const prisma = new PrismaClient();

const DEV_ORG_ID = "dev-org-id";
const DEV_ORG_NAME = "Dev Contractor LLC";
const DEV_ORG_SLUG = "dev-contractor";
const DEV_USER_ID = "dev-user-id";
const DEV_USER_EMAIL = "owner@dev.local";
const DEV_USER_NAME = "Dev Owner";
const DEV_CUSTOMER_ID = "dev-customer-seed";

const ROOF_SKYLIGHT_QUOTE_ID = "dev-quote-roof-skylight";

/**
 * Stage rows the trade-preset seeds index by position (`legacy-${orgId}-${i}`).
 * Names mirror the historical 9-stage canon so existing trade preset
 * `BUCKET_TO_LEGACY_ID` mappings stay correct.
 */
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

/**
 * Public Request Settings — enables the public intake door at
 * `/request/dev-contractor` and gives the form sensible defaults.
 */
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

/**
 * Default WEB_FORM IntakeFormDefinition — what the public form renders when no
 * custom form has been published. Mirrors `DEFAULT_INTAKE_FORM_SCHEMA` so the
 * fallback path and the seeded path render identically.
 */
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

async function seedDevCustomer() {
  await prisma.customer.upsert({
    where: { id: DEV_CUSTOMER_ID },
    update: {
      organizationId: DEV_ORG_ID,
      displayName: "Demo Customer",
      email: "demo.customer@example.com",
    },
    create: {
      id: DEV_CUSTOMER_ID,
      organizationId: DEV_ORG_ID,
      displayName: "Demo Customer",
      email: "demo.customer@example.com",
    },
  });
}

/**
 * Roof + Skylight handshake demo. Materializes both roofing templates onto a
 * fresh draft quote so the cross-line `roof-prepped` signal is wired and the
 * "Install fixed skylight" task waits on the dry-in task.
 */
async function seedRoofSkylightHandshakeDemoQuote() {
  await prisma.quote.upsert({
    where: { id: ROOF_SKYLIGHT_QUOTE_ID },
    update: {
      organizationId: DEV_ORG_ID,
      customerId: DEV_CUSTOMER_ID,
      status: QuoteStatus.DRAFT,
      title: "Roof + Skylight — Signal Handshake Demo",
      customerDocumentTitle: "Proposal: Re-Roof + Skylight Addition",
      internalNotes:
        "[dev seed] Demonstrates the Signal Engine — re-roof's dry-in task provides `roof-prepped`, which the skylight install task requires.",
    },
    create: {
      id: ROOF_SKYLIGHT_QUOTE_ID,
      organizationId: DEV_ORG_ID,
      customerId: DEV_CUSTOMER_ID,
      status: QuoteStatus.DRAFT,
      title: "Roof + Skylight — Signal Handshake Demo",
      customerDocumentTitle: "Proposal: Re-Roof + Skylight Addition",
      internalNotes:
        "[dev seed] Demonstrates the Signal Engine — re-roof's dry-in task provides `roof-prepped`, which the skylight install task requires.",
    },
  });

  await prisma.quoteLineItem.deleteMany({
    where: { quoteId: ROOF_SKYLIGHT_QUOTE_ID },
  });

  const lines: { templateId: string; quantityOverride?: string }[] = [
    { templateId: "dev-trade-roofing-full-tearoff-reroof" },
    { templateId: "dev-trade-roofing-skylight-install-fixed" },
  ];

  let runningSubtotalCents = 0;

  for (let i = 0; i < lines.length; i++) {
    const config = lines[i];
    const template = await prisma.lineItemTemplate.findUnique({
      where: { id: config.templateId, organizationId: DEV_ORG_ID },
      include: { defaultExecutionTasks: true },
    });
    if (!template) {
      console.warn(`[roof-skylight seed] missing template: ${config.templateId}`);
      continue;
    }

    const quantity = new Prisma.Decimal(config.quantityOverride ?? template.defaultQuantity);
    const lineTotalCents = quantity
      .mul(new Prisma.Decimal(template.defaultUnitAmountCents))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    runningSubtotalCents += lineTotalCents;

    const createdLine = await prisma.quoteLineItem.create({
      data: {
        quoteId: ROOF_SKYLIGHT_QUOTE_ID,
        sortOrder: i,
        description: template.description,
        customerScopeTitle: template.defaultCustomerScopeTitle,
        customerScopeDescription: template.defaultCustomerScopeDescription,
        customerIncludedNotes: template.defaultCustomerIncludedNotes,
        customerExcludedNotes: template.defaultCustomerExcludedNotes,
        customerPresentationGroup: template.defaultCustomerPresentationGroup,
        quantity,
        unitAmountCents: template.defaultUnitAmountCents,
        lineTotalCents,
        internalNotes: template.defaultInternalNotes,
        sourceLineItemTemplateId: template.id,
      },
    });

    if (template.defaultExecutionTasks.length > 0) {
      await prisma.quoteLineExecutionTask.createMany({
        data: template.defaultExecutionTasks.map((tt) => ({
          quoteLineItemId: createdLine.id,
          sourceLineItemTemplateTaskId: tt.id,
          sourceTaskTemplateId: tt.sourceTaskTemplateId,
          sourceType: tt.sourceType,
          title: tt.title,
          stageId: tt.stageId,
          category: tt.category,
          instructions: tt.instructions,
          providesSignals: tt.providesSignals,
          requiresSignals: tt.requiresSignals,
          hardSignal: tt.hardSignal,
          sortOrder: tt.sortOrder,
        })),
      });
    }
  }

  await prisma.quote.update({
    where: { id: ROOF_SKYLIGHT_QUOTE_ID },
    data: { subtotalCents: runningSubtotalCents, totalCents: runningSubtotalCents },
  });

  return { quoteId: ROOF_SKYLIGHT_QUOTE_ID, lineCount: lines.length, totalCents: runningSubtotalCents };
}

async function seedSampleLeads() {
  const leads = [
    {
      id: "seed-lead-1",
      organizationId: DEV_ORG_ID,
      channel: LeadChannel.WEB_FORM,
      status: LeadStatus.NEW,
      contact: {
        name: "John Doe",
        email: "john.doe@example.com",
        phone: "555-0101",
      },
      request: {
        type: "Roof Leak",
        neededByBucket: "ASAP",
        scope: "Small leak in the master bedroom ceiling after last night's storm.",
      },
      signals: {
        urgencyHint: "HIGH",
      },
    },
    {
      id: "seed-lead-2",
      organizationId: DEV_ORG_ID,
      channel: LeadChannel.MANUAL,
      status: LeadStatus.TRIAGING,
      contact: {
        name: "Jane Smith",
        email: "jane.smith@example.com",
        phone: "555-0102",
      },
      request: {
        type: "Electrical Panel",
        neededByBucket: "THIS_WEEK",
        scope: "Looking to upgrade from 100A to 200A service.",
      },
      signals: {
        notes: "Called in from Yelp. Seems like a serious buyer.",
      },
    },
    {
      id: "seed-lead-3",
      organizationId: DEV_ORG_ID,
      channel: LeadChannel.WEB_FORM,
      status: LeadStatus.QUALIFIED,
      contact: {
        name: "Bob Brown",
        email: "bob.brown@example.com",
        phone: "555-0103",
      },
      request: {
        type: "Kitchen Remodel",
        neededByBucket: "THIS_MONTH",
        scope: "Full gut remodel. Interested in high-end finishes.",
      },
      signals: {
        suggestedTemplateIds: ["dev-trade-plumbing-fixture-install"],
      },
    },
    {
      id: "seed-lead-4",
      organizationId: DEV_ORG_ID,
      channel: LeadChannel.MANUAL,
      status: LeadStatus.CONVERTED,
      contact: {
        name: "Alice Green",
        email: "alice.green@example.com",
        phone: "555-0104",
      },
      request: {
        type: "Bathroom Tile",
        neededByBucket: "FLEXIBLE",
        scope: "Retiling the guest bathroom floor and shower surround.",
      },
      signals: {
        notes: "Walk-in lead. Already has a quote started.",
      },
    },
  ];

  for (const lead of leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: {
        ...lead,
        contact: lead.contact as unknown as Prisma.InputJsonValue,
        request: lead.request as unknown as Prisma.InputJsonValue,
        signals: lead.signals as unknown as Prisma.InputJsonValue,
      },
      create: {
        ...lead,
        contact: lead.contact as unknown as Prisma.InputJsonValue,
        request: lead.request as unknown as Prisma.InputJsonValue,
        signals: lead.signals as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function main() {
  console.log("Seeding dev organization, owner membership, and Stage rows…");
  await seedDevOrganization();
  await seedDevOwnerUserAndMembership();
  await seedLegacyStages();
  await seedDevCustomer();

  console.log("Seeding public request settings + default intake form definition…");
  await seedPublicRequestSettings();
  await seedDefaultIntakeFormDefinition();

  console.log("Seeding trade-contractor Scope Library presets…");
  const presets = await seedTradeLineItemPresets(prisma, DEV_ORG_ID);
  console.log(
    `  ${presets.tradesSeeded} trades, ${presets.lineItemsSeeded} line items, ${presets.tasksSeeded} tasks`,
  );

  console.log("Seeding Kitchen Remodel demo quote…");
  const kitchen = await seedKitchenRemodelDemoQuote(prisma, DEV_ORG_ID, DEV_CUSTOMER_ID);
  console.log(
    `  quoteId=${kitchen.quoteId} lines=${kitchen.lineCount} total=${(kitchen.totalCents / 100).toFixed(2)}`,
  );

  console.log("Seeding Roof + Skylight signal-handshake demo quote…");
  const roofSkylight = await seedRoofSkylightHandshakeDemoQuote();
  console.log(
    `  quoteId=${roofSkylight.quoteId} lines=${roofSkylight.lineCount} total=${(roofSkylight.totalCents / 100).toFixed(2)}`,
  );

  console.log("Seeding sample leads…");
  await seedSampleLeads();

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

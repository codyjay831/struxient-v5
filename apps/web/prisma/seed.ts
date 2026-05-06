import {
  ExecutionStageKey,
  LineItemTemplateTaskSource,
  Prisma,
  PrismaClient,
  LeadSource,
  LeadStatus,
  QuoteStatus,
  TaskTemplateCategory,
} from "@prisma/client";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
  DEV_ORGANIZATION_SLUG,
} from "../src/lib/dev-organization";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
  DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
} from "../src/lib/public-request-settings-defaults";
import {
  QUOTE_LINE_LOCKED_STAGE_LABELS,
  seedTradeLineItemPresets,
} from "./seeds/trade-line-item-presets";
import { seedKitchenRemodelDemoQuote } from "./seeds/demo-quote-kitchen-remodel";

const prisma = new PrismaClient();

/** Development seed data only — not production records. */
async function main() {
  console.log("[dev seed] Starting development seed…");

  const devOrg = await prisma.organization.upsert({
    where: { id: DEV_ORGANIZATION_ID },
    update: { name: DEV_ORGANIZATION_NAME, slug: DEV_ORGANIZATION_SLUG },
    create: {
      id: DEV_ORGANIZATION_ID,
      name: DEV_ORGANIZATION_NAME,
      slug: DEV_ORGANIZATION_SLUG,
    },
  });

  console.log(`[dev seed] Organization: ${devOrg.name} (${devOrg.id})`);

  const existingPublicSettings = await prisma.publicRequestSettings.findUnique({
    where: { organizationId: devOrg.id },
  });
  if (!existingPublicSettings) {
    await prisma.publicRequestSettings.create({
      data: {
        organizationId: devOrg.id,
        enabled: true,
        formTitle: DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
        introMessage: DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
        submitButtonText: DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
        requestTypeOptionsJson: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
      },
    });
  }

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

  const convertedAt = new Date("2026-05-01T15:00:00.000Z");
  const devLeads = [
    {
      id: "dev-lead-open-website",
      organizationId: devOrg.id,
      customerId: null as string | null,
      status: LeadStatus.OPEN,
      source: LeadSource.WEBSITE,
      sourceDetail: "Contact form — commercial roof replacement",
      title: "Website: roof replacement inquiry",
      contactName: "Jordan Lee",
      email: "jordan.lee@example.com",
      phone: "555-0401",
      notes: "[dev seed] Open lead; not linked to a customer.",
      convertedAt: null as Date | null,
    },
    {
      id: "dev-lead-qualifying-referral",
      organizationId: devOrg.id,
      customerId: null,
      status: LeadStatus.QUALIFYING,
      source: LeadSource.REFERRAL,
      sourceDetail: "Referred by Riverside Builders",
      title: "Referral: tenant improvement fit-out",
      contactName: "Alex Morgan",
      email: "alex.morgan@example.com",
      phone: "555-0402",
      notes: "[dev seed] In qualification; duplicate checks are future work.",
      convertedAt: null,
    },
    {
      id: "dev-lead-converted-acme",
      organizationId: devOrg.id,
      customerId: "dev-customer-acme",
      status: LeadStatus.CONVERTED,
      source: LeadSource.PHONE,
      sourceDetail: null,
      title: "Phone intake — Acme follow-up",
      contactName: "Pat Acme",
      email: "contact@acme.com",
      phone: "555-0100",
      notes: "[dev seed] Linked to dev-customer-acme for read-path testing.",
      convertedAt,
    },
    {
      id: "dev-lead-open-walkin",
      organizationId: devOrg.id,
      customerId: null,
      status: LeadStatus.OPEN,
      source: LeadSource.WALK_IN,
      sourceDetail: null,
      title: "Walk-in: service call scheduling",
      contactName: null,
      email: null,
      phone: "555-0403",
      notes: "[dev seed] Minimal contact fields.",
      convertedAt: null,
    },
  ] as const;

  for (const row of devLeads) {
    await prisma.lead.upsert({
      where: { id: row.id },
      update: {
        organizationId: row.organizationId,
        customerId: row.customerId,
        status: row.status,
        source: row.source,
        sourceDetail: row.sourceDetail,
        title: row.title,
        contactName: row.contactName,
        email: row.email,
        phone: row.phone,
        notes: row.notes,
        convertedAt: row.convertedAt,
      },
      create: row,
    });
  }

  const devQuoteRows = [
    {
      id: "dev-quote-title-only",
      organizationId: devOrg.id,
      customerId: null as string | null,
      leadId: null as string | null,
      status: QuoteStatus.DRAFT,
      title: "[dev seed] Title-only draft quote",
      internalNotes:
        "[dev seed] No customer or lead; title satisfies the draft-only rule for orphan shells.",
      subtotalCents: 0,
      totalCents: 0,
    },
    {
      id: "dev-quote-lead-website",
      organizationId: devOrg.id,
      customerId: null,
      leadId: "dev-lead-open-website",
      status: QuoteStatus.DRAFT,
      title: "[dev seed] Lead-only draft (website roof inquiry)",
      internalNotes: "[dev seed] Linked to dev-lead-open-website for read-path testing.",
      subtotalCents: 0,
      totalCents: 0,
    },
    {
      id: "dev-quote-customer-globex",
      organizationId: devOrg.id,
      customerId: "dev-customer-globex",
      leadId: null,
      status: QuoteStatus.DRAFT,
      title: "[dev seed] Customer-only draft (Globex)",
      internalNotes: "[dev seed] Linked to dev-customer-globex for read-path testing.",
      subtotalCents: 0,
      totalCents: 0,
    },
    {
      id: "dev-quote-archived-sample",
      organizationId: devOrg.id,
      customerId: null,
      leadId: null,
      status: QuoteStatus.ARCHIVED,
      title: "[dev seed] Archived sample quote",
      internalNotes: "[dev seed] Archived status for badge testing—no customer or lead.",
      subtotalCents: 0,
      totalCents: 0,
    },
    {
      id: "dev-quote-acme-with-lines",
      organizationId: devOrg.id,
      customerId: "dev-customer-acme",
      leadId: "dev-lead-converted-acme",
      status: QuoteStatus.DRAFT,
      title: "[dev seed] Acme quote with line items",
      internalNotes:
        "[dev seed] Linked to dev-customer-acme and dev-lead-converted-acme (consistent pair).",
      subtotalCents: 85_000,
      totalCents: 85_000,
    },
  ] as const;

  for (const q of devQuoteRows) {
    await prisma.quoteLineItem.deleteMany({ where: { quoteId: q.id } });
    await prisma.quote.upsert({
      where: { id: q.id },
      update: {
        organizationId: q.organizationId,
        customerId: q.customerId,
        leadId: q.leadId,
        status: q.status,
        title: q.title,
        internalNotes: q.internalNotes,
        subtotalCents: q.subtotalCents,
        totalCents: q.totalCents,
      },
      create: {
        id: q.id,
        organizationId: q.organizationId,
        customerId: q.customerId,
        leadId: q.leadId,
        status: q.status,
        title: q.title,
        internalNotes: q.internalNotes,
        subtotalCents: q.subtotalCents,
        totalCents: q.totalCents,
      },
    });
  }

  await prisma.quoteLineItem.deleteMany({
    where: { quoteId: "dev-quote-acme-with-lines" },
  });
  const devTaskTemplateSeeds = [
    {
      id: "dev-task-template-seed-panel-photos",
      title: "[dev seed] Photo existing main panel",
      stageKey: ExecutionStageKey.site_visit,
      category: TaskTemplateCategory.PHOTO_EVIDENCE,
      instructions: "Wide shot of the panel interior and label; note any visible defects.",
    },
    {
      id: "dev-task-template-seed-permit-intake",
      title: "[dev seed] Submit permit application",
      stageKey: ExecutionStageKey.permitting,
      category: TaskTemplateCategory.PERMIT,
      instructions: "Use jurisdiction checklist; attach site photos and single-line when required.",
    },
    {
      id: "dev-task-template-seed-closeout-walk",
      title: "[dev seed] Customer walkthrough",
      stageKey: ExecutionStageKey.closeout,
      category: TaskTemplateCategory.CUSTOMER_COMMUNICATION,
      instructions: null as string | null,
    },
  ] as const;

  for (const row of devTaskTemplateSeeds) {
    await prisma.taskTemplate.upsert({
      where: { id: row.id },
      update: {
        organizationId: devOrg.id,
        title: row.title,
        stageKey: row.stageKey,
        category: row.category,
        instructions: row.instructions,
        archivedAt: null,
      },
      create: {
        id: row.id,
        organizationId: devOrg.id,
        title: row.title,
        stageKey: row.stageKey,
        category: row.category,
        instructions: row.instructions,
      },
    });
  }

  const devLineTemplateWithExecutionId = "dev-line-template-seed-with-execution";
  await prisma.lineItemTemplateTask.deleteMany({
    where: { lineItemTemplateId: devLineTemplateWithExecutionId },
  });
  await prisma.lineItemTemplate.upsert({
    where: { id: devLineTemplateWithExecutionId },
    update: {
      organizationId: devOrg.id,
      description: "[dev seed] Sample saved line item with default execution",
      defaultQuantity: new Prisma.Decimal("1"),
      defaultUnitAmountCents: 500_00,
      defaultInternalNotes: "[dev seed] Two default tasks below (one from reusable, one custom).",
      archivedAt: null,
    },
    create: {
      id: devLineTemplateWithExecutionId,
      organizationId: devOrg.id,
      description: "[dev seed] Sample saved line item with default execution",
      defaultQuantity: new Prisma.Decimal("1"),
      defaultUnitAmountCents: 500_00,
      defaultInternalNotes: "[dev seed] Two default tasks below (one from reusable, one custom).",
    },
  });
  await prisma.lineItemTemplateTask.createMany({
    data: [
      {
        id: "dev-line-template-task-from-reusable",
        lineItemTemplateId: devLineTemplateWithExecutionId,
        sourceType: LineItemTemplateTaskSource.TASK_TEMPLATE,
        sourceTaskTemplateId: "dev-task-template-seed-panel-photos",
        title: "[dev seed] Photo existing main panel",
        stageKey: ExecutionStageKey.site_visit,
        category: TaskTemplateCategory.PHOTO_EVIDENCE,
        instructions:
          "Wide shot of the panel interior and label; note any visible defects.",
        sortOrder: 0,
      },
      {
        id: "dev-line-template-task-custom",
        lineItemTemplateId: devLineTemplateWithExecutionId,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        sourceTaskTemplateId: null,
        title: "[dev seed] Confirm roof access ladder location",
        stageKey: ExecutionStageKey.intake_review,
        category: TaskTemplateCategory.GENERAL,
        instructions: "Office calls ahead; note any HOA gate codes in internal notes.",
        sortOrder: 0,
      },
    ],
  });

  await prisma.quoteLineItem.createMany({
    data: [
      {
        id: "dev-line-acme-roof",
        quoteId: "dev-quote-acme-with-lines",
        sortOrder: 0,
        description: "[dev seed] Commercial roof labor (sample line)",
        quantity: new Prisma.Decimal("4"),
        unitAmountCents: 15_000,
        lineTotalCents: 60_000,
        internalNotes: "[dev seed] Estimator-facing note on a sample line.",
      },
      {
        id: "dev-line-acme-materials",
        quoteId: "dev-quote-acme-with-lines",
        sortOrder: 1,
        description: "[dev seed] Materials allowance",
        quantity: new Prisma.Decimal("1"),
        unitAmountCents: 25_000,
        lineTotalCents: 25_000,
        internalNotes: null,
      },
    ],
  });

  await prisma.quoteLineExecutionTask.deleteMany({
    where: { quoteLineItemId: "dev-line-acme-roof" },
  });
  await prisma.quoteLineExecutionTask.create({
    data: {
      id: "dev-quote-line-exec-acme-roof",
      quoteLineItemId: "dev-line-acme-roof",
      sourceLineItemTemplateTaskId: null,
      sourceTaskTemplateId: null,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
      title: "[dev seed] Confirm roof access for estimator",
      stageKey: ExecutionStageKey.intake_review,
      category: TaskTemplateCategory.GENERAL,
      instructions: "Optional dev seed row for quote-line draft execution.",
      sortOrder: 0,
    },
  });

  const tradeSeedResult = await seedTradeLineItemPresets(prisma, devOrg.id);
  console.log(
    `[dev seed] Trade presets: ${tradeSeedResult.tradesSeeded} trades, ` +
      `${tradeSeedResult.lineItemsSeeded} line items, ` +
      `${tradeSeedResult.tasksSeeded} default execution tasks.`,
  );
  for (const [bucketId, count] of Object.entries(tradeSeedResult.stageDistribution)) {
    const label = QUOTE_LINE_LOCKED_STAGE_LABELS[
      bucketId as keyof typeof QUOTE_LINE_LOCKED_STAGE_LABELS
    ];
    console.log(`[dev seed]   - ${label}: ${count} task${count === 1 ? "" : "s"}`);
  }

  const demoQuoteResult = await seedKitchenRemodelDemoQuote(
    prisma,
    devOrg.id,
    "dev-customer-acme",
  );
  console.log(
    `[dev seed] Demo quote: "${demoQuoteResult.quoteId}" created with ${demoQuoteResult.lineCount} lines.`,
  );

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

import {
  ExecutionStageKey,
  LineItemTemplateTaskSource,
  Prisma,
  PrismaClient,
  LeadSource,
  LeadStatus,
  QuoteStatus,
  StaffRole,
  TaskTemplateCategory,
  JobStatus,
  JobTaskStatus,
  JobVisitStatus,
  AttachmentStatus,
  JobIssueType,
  JobIssueSeverity,
  JobIssueStatus,
  JobPaymentRequirementStatus,
  JobActivityType,
  JobStageBlockType,
} from "@prisma/client";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  DEV_ORGANIZATION_ID,
  DEV_ORGANIZATION_NAME,
  DEV_ORGANIZATION_SLUG,
  DEV_USER_ID,
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

  const devUser = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: { email: "dev@struxient.local", name: "Dev User" },
    create: {
      id: DEV_USER_ID,
      email: "dev@struxient.local",
      name: "Dev User",
    },
  });

  console.log(`[dev seed] User: ${devUser.name} (${devUser.id})`);

  const devMembership = await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: devUser.id,
        organizationId: devOrg.id,
      },
    },
    update: { role: StaffRole.OWNER },
    create: {
      userId: devUser.id,
      organizationId: devOrg.id,
      role: StaffRole.OWNER,
    },
  });

  console.log(`[dev seed] Membership: ${devMembership.role} in ${devOrg.name}`);

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

  // --- EXECUTION SHOWCASE DEMO SCENARIO ---
  console.log("[dev seed] Starting Execution Showcase demo scenario…");

  const demoCustomer = await prisma.customer.upsert({
    where: { id: "dev-customer-demo-execution" },
    update: {
      displayName: "Demo Customer — Execution Showcase",
      companyName: "Execution Showcase Corp",
      email: "demo@execution.struxient",
      phone: "555-0999",
      organizationId: devOrg.id,
    },
    create: {
      id: "dev-customer-demo-execution",
      displayName: "Demo Customer — Execution Showcase",
      companyName: "Execution Showcase Corp",
      email: "demo@execution.struxient",
      phone: "555-0999",
      organizationId: devOrg.id,
    },
  });

  const demoLeads = [
    {
      id: "dev-lead-unlinked-demo",
      title: "Demo Lead — Unlinked (Needs Customer)",
      status: LeadStatus.OPEN,
      source: LeadSource.WEBSITE,
      contactName: "Unlinked User",
      email: "unlinked@example.com",
      organizationId: devOrg.id,
    },
    {
      id: "dev-lead-linked-no-quote",
      title: "Demo Lead — Linked (Ready for Quote)",
      status: LeadStatus.QUALIFYING,
      source: LeadSource.REFERRAL,
      customerId: demoCustomer.id,
      contactName: "No Quote User",
      organizationId: devOrg.id,
    },
    {
      id: "dev-lead-linked-draft-quote",
      title: "Demo Lead — Linked (Has Draft Quote)",
      status: LeadStatus.QUALIFYING,
      source: LeadSource.PHONE,
      customerId: demoCustomer.id,
      contactName: "Draft Quote User",
      organizationId: devOrg.id,
    },
  ];

  for (const lead of demoLeads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: lead,
      create: lead,
    });
  }

  const demoQuote = await prisma.quote.upsert({
    where: { id: "dev-quote-demo-execution" },
    update: {
      title: "Demo Quote — Execution Showcase",
      status: QuoteStatus.APPROVED,
      customerId: demoCustomer.id,
      leadId: "dev-lead-linked-draft-quote",
      totalCents: 1250000,
      organizationId: devOrg.id,
    },
    create: {
      id: "dev-quote-demo-execution",
      title: "Demo Quote — Execution Showcase",
      status: QuoteStatus.APPROVED,
      customerId: demoCustomer.id,
      leadId: "dev-lead-linked-draft-quote",
      totalCents: 1250000,
      organizationId: devOrg.id,
    },
  });

  console.log("[dev seed] Demo leads and quote created.");

  const demoJob = await prisma.job.upsert({
    where: { id: "dev-job-demo-execution" },
    update: {
      title: "Demo Job — Execution Showcase",
      status: JobStatus.ACTIVE,
      quoteId: demoQuote.id,
      customerId: demoCustomer.id,
      leadId: "dev-lead-linked-draft-quote",
      organizationId: devOrg.id,
    },
    create: {
      id: "dev-job-demo-execution",
      title: "Demo Job — Execution Showcase",
      status: JobStatus.ACTIVE,
      quoteId: demoQuote.id,
      customerId: demoCustomer.id,
      leadId: "dev-lead-linked-draft-quote",
      organizationId: devOrg.id,
    },
  });

  // Clean up existing stages/tasks for idempotency
  await prisma.jobTask.deleteMany({ where: { jobId: demoJob.id } });
  await prisma.jobStage.deleteMany({ where: { jobId: demoJob.id } });

  const stagePreCon = await prisma.jobStage.create({
    data: {
      id: "dev-stage-pre-con",
      jobId: demoJob.id,
      blockType: JobStageBlockType.SHARED,
      stageKey: ExecutionStageKey.pre_install,
      title: "Pre-Construction",
      sortOrder: 10,
    },
  });

  const stageInstall = await prisma.jobStage.create({
    data: {
      id: "dev-stage-install",
      jobId: demoJob.id,
      blockType: JobStageBlockType.SHARED,
      stageKey: ExecutionStageKey.installation,
      title: "Installation",
      sortOrder: 20,
    },
  });

  const stageCloseout = await prisma.jobStage.create({
    data: {
      id: "dev-stage-closeout",
      jobId: demoJob.id,
      blockType: JobStageBlockType.SHARED,
      stageKey: ExecutionStageKey.closeout,
      title: "Final Inspection & Closeout",
      sortOrder: 30,
    },
  });

  console.log("[dev seed] Demo job and stages created.");

  const demoTasks = [
    {
      id: "dev-task-ready",
      jobId: demoJob.id,
      jobStageId: stagePreCon.id,
      title: "Demo Task — Ready to Complete",
      category: TaskTemplateCategory.GENERAL,
      stageKey: ExecutionStageKey.pre_install,
      status: JobTaskStatus.TODO,
      sortOrder: 1,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
    {
      id: "dev-task-note",
      jobId: demoJob.id,
      jobStageId: stagePreCon.id,
      title: "Demo Task — Needs Note Proof",
      category: TaskTemplateCategory.GENERAL,
      stageKey: ExecutionStageKey.pre_install,
      status: JobTaskStatus.TODO,
      sortOrder: 2,
      completionRequirementsJson: { noteRequired: true },
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
    {
      id: "dev-task-photo",
      jobId: demoJob.id,
      jobStageId: stageInstall.id,
      title: "Demo Task — Needs Photo Proof",
      category: TaskTemplateCategory.PHOTO_EVIDENCE,
      stageKey: ExecutionStageKey.installation,
      status: JobTaskStatus.TODO,
      sortOrder: 1,
      completionRequirementsJson: { photoRequired: true },
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
    {
      id: "dev-task-completed",
      jobId: demoJob.id,
      jobStageId: stagePreCon.id,
      title: "Demo Task — Completed with Activity",
      category: TaskTemplateCategory.GENERAL,
      stageKey: ExecutionStageKey.pre_install,
      status: JobTaskStatus.DONE,
      completedAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
      completedByUserId: devUser.id,
      completionNote: "Completed successfully during pre-con walk.",
      sortOrder: 0,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
    {
      id: "dev-task-blocked-issue",
      jobId: demoJob.id,
      jobStageId: stageInstall.id,
      title: "Demo Task — Blocked by Issue",
      category: TaskTemplateCategory.GENERAL,
      stageKey: ExecutionStageKey.installation,
      status: JobTaskStatus.TODO,
      sortOrder: 2,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
    {
      id: "dev-task-blocked-payment",
      jobId: demoJob.id,
      jobStageId: stageInstall.id,
      title: "Demo Task — Blocked by Payment",
      category: TaskTemplateCategory.GENERAL,
      stageKey: ExecutionStageKey.installation,
      status: JobTaskStatus.TODO,
      sortOrder: 3,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
    },
  ];

  for (const task of demoTasks) {
    await prisma.jobTask.create({ data: task });
  }

  console.log("[dev seed] Demo tasks created.");

  await prisma.jobIssue.deleteMany({ where: { jobId: demoJob.id } });
  const demoIssue = await prisma.jobIssue.create({
    data: {
      id: "dev-issue-blocking",
      organizationId: devOrg.id,
      jobId: demoJob.id,
      jobTaskId: "dev-task-blocked-issue",
      type: JobIssueType.SITE_CONDITION,
      severity: JobIssueSeverity.BLOCKS_WORK,
      status: JobIssueStatus.OPEN,
      title: "Demo Issue — Site Access Blocked",
      description: "Main gate code changed; waiting for customer to provide new code.",
      createdByUserId: devUser.id,
    },
  });

  await prisma.jobPaymentRequirement.deleteMany({ where: { jobId: demoJob.id } });
  const paymentDeposit = await prisma.jobPaymentRequirement.create({
    data: {
      id: "dev-payment-deposit",
      organizationId: devOrg.id,
      jobId: demoJob.id,
      title: "Demo Deposit — Blocks Installation",
      amountCents: 500000,
      status: JobPaymentRequirementStatus.DUE,
      requiredBeforeStageId: stageInstall.id,
      notes: "50% deposit required before installation begins.",
    },
  });

  const paymentPaid = await prisma.jobPaymentRequirement.create({
    data: {
      id: "dev-payment-paid",
      organizationId: devOrg.id,
      jobId: demoJob.id,
      title: "Demo Paid Requirement — Does Not Block",
      amountCents: 10000,
      status: JobPaymentRequirementStatus.PAID,
      paidAt: new Date(Date.now() - 86400000 * 5),
      notes: "Initial consultation fee.",
    },
  });

  console.log("[dev seed] Demo issues and payments created.");

  await prisma.jobVisit.deleteMany({ where: { jobId: demoJob.id } });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 14, 0);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0);
  const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 11, 0);

  await prisma.jobVisit.createMany({
    data: [
      {
        id: "dev-visit-today",
        organizationId: devOrg.id,
        jobId: demoJob.id,
        scheduledStartAt: today,
        scheduledEndAt: new Date(today.getTime() + 3600000 * 2),
        status: JobVisitStatus.SCHEDULED,
        notes: "Today's demo visit.",
      },
      {
        id: "dev-visit-tomorrow",
        organizationId: devOrg.id,
        jobId: demoJob.id,
        scheduledStartAt: tomorrow,
        scheduledEndAt: new Date(tomorrow.getTime() + 3600000 * 4),
        status: JobVisitStatus.SCHEDULED,
        notes: "Upcoming visit for tomorrow.",
      },
      {
        id: "dev-visit-yesterday",
        organizationId: devOrg.id,
        jobId: demoJob.id,
        scheduledStartAt: yesterday,
        scheduledEndAt: new Date(yesterday.getTime() + 3600000),
        status: JobVisitStatus.SCHEDULED,
        notes: "Missed visit from yesterday.",
      },
      {
        id: "dev-visit-completed",
        organizationId: devOrg.id,
        jobId: demoJob.id,
        scheduledStartAt: lastWeek,
        scheduledEndAt: new Date(lastWeek.getTime() + 3600000 * 3),
        status: JobVisitStatus.COMPLETED,
        notes: "Successfully completed visit from last week.",
      },
    ],
  });

  await prisma.jobActivity.deleteMany({ where: { jobId: demoJob.id } });
  await prisma.jobActivity.createMany({
    data: [
      {
        organizationId: devOrg.id,
        jobId: demoJob.id,
        type: JobActivityType.TASK_COMPLETED,
        title: "Task completed: Demo Task — Completed with Activity",
        details: "Outcome: Completed successfully during pre-con walk.",
        actorUserId: devUser.id,
        createdAt: new Date(Date.now() - 86400000 * 2),
      },
      {
        organizationId: devOrg.id,
        jobId: demoJob.id,
        type: JobActivityType.PAYMENT_REQUIREMENT_CREATED,
        title: "Payment requirement created: Demo Deposit — Blocks Installation",
        details: "Amount: $5,000.00",
        actorUserId: devUser.id,
        createdAt: new Date(Date.now() - 86400000 * 4),
      },
      {
        organizationId: devOrg.id,
        jobId: demoJob.id,
        type: JobActivityType.ISSUE_CREATED,
        title: "Issue reported: Demo Issue — Site Access Blocked",
        details: "Severity: BLOCKS_WORK",
        actorUserId: devUser.id,
        createdAt: new Date(Date.now() - 86400000 * 1),
      },
    ],
  });

  console.log("[dev seed] Demo visits and activities created.");

  await prisma.attachment.deleteMany({ where: { jobId: demoJob.id } });
  const attachmentReady = await prisma.attachment.create({
    data: {
      id: "dev-attachment-ready",
      organizationId: devOrg.id,
      jobId: demoJob.id,
      jobTaskId: "dev-task-completed",
      fileName: "demo-proof.jpg",
      fileKey: "dev-attachment-ready-demo-proof.jpg",
      contentType: "image/jpeg",
      fileSize: 1024,
      status: AttachmentStatus.READY,
      uploadedByUserId: devUser.id,
    },
  });

  const attachmentPending = await prisma.attachment.create({
    data: {
      id: "dev-attachment-pending",
      organizationId: devOrg.id,
      jobId: demoJob.id,
      jobTaskId: "dev-task-photo",
      fileName: "pending-upload.jpg",
      fileKey: "dev-attachment-pending-pending-upload.jpg",
      contentType: "image/jpeg",
      fileSize: 2048,
      status: AttachmentStatus.PENDING,
      uploadedByUserId: devUser.id,
    },
  });

  // Create a dummy file for the READY attachment in local storage
  const uploadDir = join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, attachmentReady.fileKey), "dummy-image-content");

  console.log("[dev seed] Demo attachments and dummy file created.");

  console.log("[dev seed] Execution Showcase demo scenario completed.");
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

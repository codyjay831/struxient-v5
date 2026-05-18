/**
 * Linked dev journey fixtures — lead → quote → lines/tasks → checkpoints → job.
 *
 * Stable ids for idempotent `prisma db seed`. Each fixture exercises a derived
 * commercial-progress / quote-readiness step in the product.
 */

import { LeadChannel, LeadStatus, Prisma, QuoteStatus, type PrismaClient } from "@prisma/client";
import { seedKitchenRemodelDemoQuote } from "./demo-quote-kitchen-remodel";
import {
  materializeQuoteLinesFromTemplates,
  upsertQuoteShell,
} from "./seed-quote-materialization";
import { seedQuoteApprovedWithCheckpoint, seedQuoteSentWithCheckpoint } from "./seed-checkpoints";
import { activateQuoteJobForSeed } from "./seed-job-activation";

export const JOURNEY = {
  customers: {
    walsh: "dev-customer-walsh",
    novak: "dev-customer-novak",
    martinez: "dev-customer-martinez",
    patel: "dev-customer-patel",
    foster: "dev-customer-foster",
    chen: "dev-customer-chen",
  },
  leads: {
    intake: "journey-lead-intake",
    ready: "journey-lead-ready",
    starter: "journey-lead-starter",
    kitchen: "journey-lead-kitchen",
    panel: "journey-lead-panel",
    bathroom: "journey-lead-bathroom",
    roof: "journey-lead-roof",
  },
  quotes: {
    starter: "dev-quote-starter-draft",
    kitchen: "dev-quote-kitchen-remodel",
    panel: "dev-quote-panel-upgrade",
    bathroom: "dev-quote-bathroom-tile",
    roof: "dev-quote-roof-skylight",
  },
  job: {
    roof: "dev-job-roof-skylight",
  },
} as const;

const LEGACY_LEAD_IDS = ["seed-lead-1", "seed-lead-2", "seed-lead-3", "seed-lead-4"] as const;
const LEGACY_CUSTOMER_ID = "dev-customer-seed";

type LeadSeedRow = {
  id: string;
  status: LeadStatus;
  channel: LeadChannel;
  customerId?: string | null;
  contact: Record<string, unknown>;
  request: Record<string, unknown>;
  signals?: Record<string, unknown>;
  convertedAt?: Date | null;
};

async function upsertCustomers(prisma: PrismaClient, organizationId: string) {
  const rows = [
    {
      id: JOURNEY.customers.walsh,
      displayName: "Sandra Walsh",
      email: "sandra.walsh@example.com",
    },
    {
      id: JOURNEY.customers.novak,
      displayName: "Tom Novak",
      email: "tom.novak@example.com",
    },
    {
      id: JOURNEY.customers.martinez,
      displayName: "Elena Martinez",
      email: "elena.martinez@example.com",
    },
    {
      id: JOURNEY.customers.patel,
      displayName: "Raj Patel",
      email: "raj.patel@example.com",
    },
    {
      id: JOURNEY.customers.foster,
      displayName: "Megan Foster",
      email: "megan.foster@example.com",
    },
    {
      id: JOURNEY.customers.chen,
      displayName: "David Chen",
      email: "david.chen@example.com",
    },
  ];

  for (const row of rows) {
    await prisma.customer.upsert({
      where: { id: row.id },
      update: { organizationId, displayName: row.displayName, email: row.email },
      create: { id: row.id, organizationId, displayName: row.displayName, email: row.email },
    });
  }
}

async function upsertLeads(prisma: PrismaClient, organizationId: string) {
  const leads: LeadSeedRow[] = [
    {
      id: JOURNEY.leads.intake,
      status: LeadStatus.NEW,
      channel: LeadChannel.WEB_FORM,
      contact: {
        name: "Chris Rivera",
        email: "chris.rivera@example.com",
      },
      request: {
        type: "Roof leak",
        neededByBucket: "ASAP",
        scope: "Active leak in the primary bedroom after last night's storm.",
      },
      signals: { urgencyHint: "HIGH" },
    },
    {
      id: JOURNEY.leads.ready,
      status: LeadStatus.TRIAGING,
      channel: LeadChannel.MANUAL,
      customerId: JOURNEY.customers.walsh,
      contact: {
        name: "Sandra Walsh",
        email: "sandra.walsh@example.com",
        phone: "555-0142",
      },
      request: {
        type: "Guest bathroom tile",
        neededByBucket: "THIS_MONTH",
        scope: "Retile guest bath floor and shower surround; homeowner supplied tile.",
      },
      signals: { notes: "Walk-in referral. Ready to start a quote once photos arrive." },
    },
    {
      id: JOURNEY.leads.starter,
      status: LeadStatus.QUALIFIED,
      channel: LeadChannel.WEB_FORM,
      customerId: JOURNEY.customers.novak,
      contact: {
        name: "Tom Novak",
        email: "tom.novak@example.com",
        phone: "555-0178",
      },
      request: {
        type: "Kitchen lighting",
        neededByBucket: "THIS_MONTH",
        scope: "Add recessed cans over island and prep zone before cabinet install.",
      },
    },
    {
      id: JOURNEY.leads.kitchen,
      status: LeadStatus.QUALIFIED,
      channel: LeadChannel.WEB_FORM,
      customerId: JOURNEY.customers.martinez,
      contact: {
        name: "Elena Martinez",
        email: "elena.martinez@example.com",
        phone: "555-0191",
      },
      request: {
        type: "Kitchen remodel",
        neededByBucket: "THIS_MONTH",
        scope: "Full gut kitchen with new cabinets, counters, lighting, and rough MEP updates.",
      },
      signals: {
        suggestedTemplateIds: ["dev-trade-electrical-kitchen-remodel-rough-in"],
      },
    },
    {
      id: JOURNEY.leads.panel,
      status: LeadStatus.QUALIFIED,
      channel: LeadChannel.MANUAL,
      customerId: JOURNEY.customers.patel,
      contact: {
        name: "Raj Patel",
        email: "raj.patel@example.com",
        phone: "555-0165",
      },
      request: {
        type: "Service upgrade",
        neededByBucket: "THIS_WEEK",
        scope: "Upgrade 100A panel to 200A before EV charger install.",
      },
    },
    {
      id: JOURNEY.leads.bathroom,
      status: LeadStatus.QUALIFIED,
      channel: LeadChannel.MANUAL,
      customerId: JOURNEY.customers.foster,
      contact: {
        name: "Megan Foster",
        email: "megan.foster@example.com",
        phone: "555-0133",
      },
      request: {
        type: "Master bath refresh",
        neededByBucket: "FLEXIBLE",
        scope: "New tile, paint, and fixture swap in master bath.",
      },
    },
    {
      id: JOURNEY.leads.roof,
      status: LeadStatus.QUALIFIED,
      channel: LeadChannel.MANUAL,
      customerId: JOURNEY.customers.chen,
      contact: {
        name: "David Chen",
        email: "david.chen@example.com",
        phone: "555-0188",
      },
      request: {
        type: "Re-roof + skylight",
        neededByBucket: "THIS_MONTH",
        scope: "Architectural re-roof with one new fixed skylight over stair landing.",
      },
    },
  ];

  for (const lead of leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: {
        organizationId,
        status: lead.status,
        channel: lead.channel,
        customerId: lead.customerId ?? null,
        contact: lead.contact as unknown as Prisma.InputJsonValue,
        request: lead.request as unknown as Prisma.InputJsonValue,
        signals: (lead.signals ?? null) as unknown as Prisma.InputJsonValue,
        convertedAt: lead.convertedAt ?? null,
      },
      create: {
        id: lead.id,
        organizationId,
        status: lead.status,
        channel: lead.channel,
        customerId: lead.customerId ?? null,
        contact: lead.contact as unknown as Prisma.InputJsonValue,
        request: lead.request as unknown as Prisma.InputJsonValue,
        signals: (lead.signals ?? null) as unknown as Prisma.InputJsonValue,
        convertedAt: lead.convertedAt ?? null,
      },
    });
  }
}

async function seedStarterDraftQuote(prisma: PrismaClient, organizationId: string) {
  await upsertQuoteShell(prisma, {
    quoteId: JOURNEY.quotes.starter,
    organizationId,
    customerId: JOURNEY.customers.novak,
    leadId: JOURNEY.leads.starter,
    title: "Kitchen lighting — starter scope",
    customerDocumentTitle: "Proposal: Recessed lighting package",
    internalNotes: "[dev seed] Single-line draft to exercise DRAFT_IN_PROGRESS.",
    status: QuoteStatus.DRAFT,
  });

  return materializeQuoteLinesFromTemplates(prisma, {
    quoteId: JOURNEY.quotes.starter,
    organizationId,
    lines: [
      {
        templateId: "dev-trade-electrical-recessed-lighting-circuit",
        quantityOverride: "6",
      },
    ],
  });
}

async function seedPanelSentQuote(
  prisma: PrismaClient,
  organizationId: string,
  organizationName: string,
) {
  await upsertQuoteShell(prisma, {
    quoteId: JOURNEY.quotes.panel,
    organizationId,
    customerId: JOURNEY.customers.patel,
    leadId: JOURNEY.leads.panel,
    title: "200A service upgrade",
    customerDocumentTitle: "Proposal: Panel upgrade for EV readiness",
    internalNotes: "[dev seed] Sent quote awaiting customer response.",
    status: QuoteStatus.DRAFT,
  });

  const materialized = await materializeQuoteLinesFromTemplates(prisma, {
    quoteId: JOURNEY.quotes.panel,
    organizationId,
    lines: [{ templateId: "dev-trade-electrical-service-panel-upgrade-200a" }],
  });

  await seedQuoteSentWithCheckpoint(prisma, {
    organizationId,
    organizationName,
    quoteId: JOURNEY.quotes.panel,
  });

  return materialized;
}

async function seedBathroomApprovedQuote(
  prisma: PrismaClient,
  organizationId: string,
  organizationName: string,
) {
  await upsertQuoteShell(prisma, {
    quoteId: JOURNEY.quotes.bathroom,
    organizationId,
    customerId: JOURNEY.customers.foster,
    leadId: JOURNEY.leads.bathroom,
    title: "Master bath tile & paint",
    customerDocumentTitle: "Proposal: Master bath refresh",
    internalNotes: "[dev seed] Approved quote ready for activation from the UI.",
    status: QuoteStatus.DRAFT,
  });

  const materialized = await materializeQuoteLinesFromTemplates(prisma, {
    quoteId: JOURNEY.quotes.bathroom,
    organizationId,
    lines: [
      { templateId: "dev-trade-drywall-hang-tape-finish-l4", quantityOverride: "140" },
      { templateId: "dev-trade-painting-interior-repaint-2coat", quantityOverride: "1" },
    ],
  });

  await seedQuoteSentWithCheckpoint(prisma, {
    organizationId,
    organizationName,
    quoteId: JOURNEY.quotes.bathroom,
  });
  await seedQuoteApprovedWithCheckpoint(prisma, {
    organizationId,
    organizationName,
    quoteId: JOURNEY.quotes.bathroom,
  });

  return materialized;
}

async function seedRoofSkylightJourney(
  prisma: PrismaClient,
  organizationId: string,
  organizationName: string,
  actorUserId: string | null,
) {
  await upsertQuoteShell(prisma, {
    quoteId: JOURNEY.quotes.roof,
    organizationId,
    customerId: JOURNEY.customers.chen,
    leadId: JOURNEY.leads.roof,
    title: "Re-roof + skylight",
    customerDocumentTitle: "Proposal: Architectural re-roof with fixed skylight",
    internalNotes:
      "[dev seed] Signal handshake demo — dry-in provides `roof-prepped`; skylight install requires it.",
    status: QuoteStatus.DRAFT,
  });

  const materialized = await materializeQuoteLinesFromTemplates(prisma, {
    quoteId: JOURNEY.quotes.roof,
    organizationId,
    lines: [
      { templateId: "dev-trade-roofing-full-tearoff-reroof" },
      { templateId: "dev-trade-roofing-skylight-install-fixed" },
    ],
  });

  await seedQuoteSentWithCheckpoint(prisma, {
    organizationId,
    organizationName,
    quoteId: JOURNEY.quotes.roof,
  });
  await seedQuoteApprovedWithCheckpoint(prisma, {
    organizationId,
    organizationName,
    quoteId: JOURNEY.quotes.roof,
  });

  await prisma.job.deleteMany({ where: { id: JOURNEY.job.roof } });

  const activation = await activateQuoteJobForSeed(prisma, {
    organizationId,
    quoteId: JOURNEY.quotes.roof,
    jobId: JOURNEY.job.roof,
    actorUserId,
  });

  return { ...materialized, jobId: activation.jobId, jobTaskCount: activation.taskCount };
}

export type JourneyFixturesResult = {
  leads: number;
  customers: number;
  quotes: Record<string, { lineCount: number; totalCents: number; jobId?: string }>;
};

export async function seedJourneyFixtures(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationName: string;
    actorUserId?: string | null;
  },
): Promise<JourneyFixturesResult> {
  const { organizationId, organizationName, actorUserId } = input;

  await prisma.lead.deleteMany({
    where: { id: { in: [...LEGACY_LEAD_IDS] }, organizationId },
  });

  await prisma.customer.deleteMany({
    where: { id: LEGACY_CUSTOMER_ID, organizationId },
  });

  await upsertCustomers(prisma, organizationId);
  await upsertLeads(prisma, organizationId);

  const kitchen = await seedKitchenRemodelDemoQuote(prisma, {
    organizationId,
    customerId: JOURNEY.customers.martinez,
    leadId: JOURNEY.leads.kitchen,
  });
  const starter = await seedStarterDraftQuote(prisma, organizationId);
  const panel = await seedPanelSentQuote(prisma, organizationId, organizationName);
  const bathroom = await seedBathroomApprovedQuote(prisma, organizationId, organizationName);
  const roof = await seedRoofSkylightJourney(prisma, organizationId, organizationName, actorUserId ?? null);

  return {
    leads: 7,
    customers: 6,
    quotes: {
      starter: starter,
      kitchen: { lineCount: kitchen.lineCount, totalCents: kitchen.totalCents },
      panel: { lineCount: panel.lineCount, totalCents: panel.totalCents },
      bathroom: { lineCount: bathroom.lineCount, totalCents: bathroom.totalCents },
      roof: {
        lineCount: roof.lineCount,
        totalCents: roof.totalCents,
        jobId: roof.jobId,
      },
    },
  };
}

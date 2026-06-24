/**
 * DB fixtures for Change Order execution delta integration tests.
 * Requires DATABASE_URL and dev seed (dev-org-id).
 */
import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  JobScopeItemStatus,
  JobTaskStatus,
  LineItemTemplateTaskSource,
  QuoteStatus,
  StaffRole,
  TaskTemplateCategory,
} from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ORGANIZATION_ID } from "@/lib/dev-organization";
import { createPublicAccessToken, hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";
import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import {
  changeOrderPaymentImpactToJson,
  type ChangeOrderPaymentImpact,
} from "@/lib/change-order/payment-impact-schema";
import {
  buildPaymentImpactForStrategy,
} from "@/lib/change-order/payment-impact-resolver";

export const OFFICE_ACTOR = {
  userId: "dev-user-id",
  organizationId: DEV_ORGANIZATION_ID,
  role: StaffRole.OFFICE,
};

function isCiEnvironment(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

export function getIntegrationTestSkipReason(): string | null {
  if (!process.env.DATABASE_URL?.trim()) {
    return "DATABASE_URL is not set. Set DATABASE_URL to run Change Order DB integration tests locally.";
  }
  return null;
}

export function failIntegrationTestIfMisconfigured(skipReason: string | null): void {
  if (!skipReason) return;
  if (isCiEnvironment()) {
    throw new Error(
      `CI misconfiguration: ${skipReason} Change Order integration tests must not skip in CI.`,
    );
  }
}

/** @deprecated Use requireDevOrgForIntegrationTest */
export async function requireDevOrg(): Promise<boolean> {
  const skipReason = getIntegrationTestSkipReason();
  if (skipReason) return false;
  try {
    const org = await db.organization.findUnique({ where: { id: DEV_ORGANIZATION_ID } });
    return Boolean(org);
  } catch {
    return false;
  }
}

export async function requireDevOrgForIntegrationTest(context: {
  skip: (message: string) => void;
}): Promise<boolean> {
  const skipReason = getIntegrationTestSkipReason();
  if (skipReason) {
    failIntegrationTestIfMisconfigured(skipReason);
    context.skip(skipReason);
    return false;
  }

  try {
    const org = await db.organization.findUnique({ where: { id: DEV_ORGANIZATION_ID } });
    if (!org) {
      const message = `Dev org ${DEV_ORGANIZATION_ID} not found — run \`npx prisma db seed\`.`;
      if (isCiEnvironment()) {
        throw new Error(`CI misconfiguration: ${message}`);
      }
      context.skip(message);
      return false;
    }
    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? `Database connection failed: ${error.message}`
        : "Database connection failed.";
    if (isCiEnvironment()) {
      throw error instanceof Error ? error : new Error(message);
    }
    context.skip(message);
    return false;
  }
}

export type ChangeOrderJobFixture = {
  quoteId: string;
  jobId: string;
  jobPlanVersion: number;
  scopeItemId: string;
  taskId: string;
  stageId: string;
};

export async function createChangeOrderJobFixture(label: string): Promise<ChangeOrderJobFixture> {
  const serviceLocation = await db.customerServiceLocation.findFirst({
    where: { organizationId: DEV_ORGANIZATION_ID },
    select: { id: true },
  });
  if (!serviceLocation) {
    throw new Error("Dev org missing service location — run prisma db seed");
  }

  const quote = await db.quote.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      title: `CO integration ${label}`,
      status: QuoteStatus.APPROVED,
      serviceLocationId: serviceLocation.id,
      subtotalCents: 100_000,
      totalCents: 100_000,
    },
    select: { id: true },
  });

  const job = await db.job.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      quoteId: quote.id,
      title: `CO integration job ${label}`,
      jobPlanVersion: 3,
    },
    select: { id: true, jobPlanVersion: true },
  });

  const stage = await db.jobStage.create({
    data: {
      jobId: job.id,
      title: "Main",
      sortOrder: 0,
    },
    select: { id: true },
  });

  const scopeItem = await db.jobScopeItem.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      jobId: job.id,
      description: "Existing scope",
      quantity: "1",
      unitPriceCents: 100_000,
      executionRelevant: true,
      status: JobScopeItemStatus.ACTIVE,
    },
    select: { id: true },
  });

  const task = await db.jobTask.create({
    data: {
      jobId: job.id,
      jobStageId: stage.id,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
      title: "Existing task",
      category: TaskTemplateCategory.GENERAL,
      status: JobTaskStatus.TODO,
      sortOrder: 0,
    },
    select: { id: true },
  });

  await db.jobTaskScope.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      jobTaskId: task.id,
      jobScopeItemId: scopeItem.id,
    },
  });

  return {
    quoteId: quote.id,
    jobId: job.id,
    jobPlanVersion: job.jobPlanVersion,
    scopeItemId: scopeItem.id,
    taskId: task.id,
    stageId: stage.id,
  };
}

export async function cleanupChangeOrderJobFixture(fixture: ChangeOrderJobFixture) {
  const changeOrders = await db.changeOrder.findMany({
    where: { organizationId: DEV_ORGANIZATION_ID, jobId: fixture.jobId },
    select: { id: true },
  });
  const changeOrderIds = changeOrders.map((row) => row.id);

  if (changeOrderIds.length > 0) {
    await db.changeOrderLine.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, changeOrderId: { in: changeOrderIds } },
    });
    await db.changeOrderCheckpoint.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, changeOrderId: { in: changeOrderIds } },
    });
    await db.executionPlanRevision.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, changeOrderId: { in: changeOrderIds } },
    });
    await db.changeOrderShareToken.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, changeOrderId: { in: changeOrderIds } },
    });
    await db.changeOrder.deleteMany({
      where: { organizationId: DEV_ORGANIZATION_ID, id: { in: changeOrderIds } },
    });
  }
  await db.jobPaymentRequirement.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, jobId: fixture.jobId },
  });
  await db.paymentScheduleItem.deleteMany({
    where: { quoteId: fixture.quoteId },
  });
  await db.jobTaskScope.deleteMany({
    where: { organizationId: DEV_ORGANIZATION_ID, jobTask: { jobId: fixture.jobId } },
  });
  await db.jobTask.deleteMany({ where: { jobId: fixture.jobId } });
  await db.jobScopeItem.deleteMany({ where: { jobId: fixture.jobId } });
  await db.jobStage.deleteMany({ where: { jobId: fixture.jobId } });
  await db.jobActivity.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, jobId: fixture.jobId } });
  await db.job.delete({ where: { id: fixture.jobId } });
  await db.quote.delete({ where: { id: fixture.quoteId } });
}

export function buildAddLine(description = "Battery backup") {
  return {
    operation: ChangeOrderLineOperation.ADD,
    description,
    quantity: "1",
    priceDeltaCents: 0,
    executionRelevant: true,
  };
}

export function buildDueBeforeAddedWorkPaymentImpactJson(
  priceDeltaCents: number,
): Record<string, unknown> {
  const built = buildPaymentImpactForStrategy({
    strategy: "DUE_BEFORE_ADDED_WORK",
    priceDeltaCents,
    requirements: [],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return changeOrderPaymentImpactToJson(built.impact);
}

export function buildDueBeforeAddedWorkPaymentImpact(
  priceDeltaCents: number,
): ChangeOrderPaymentImpact {
  const built = buildPaymentImpactForStrategy({
    strategy: "DUE_BEFORE_ADDED_WORK",
    priceDeltaCents,
    requirements: [],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return built.impact;
}

export async function seedJobPaymentRequirements(fixture: ChangeOrderJobFixture) {
  const depositSchedule = await db.paymentScheduleItem.create({
    data: {
      quoteId: fixture.quoteId,
      title: "Deposit",
      amountCents: 50_000,
      sortOrder: 0,
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
    },
  });
  const finalSchedule = await db.paymentScheduleItem.create({
    data: {
      quoteId: fixture.quoteId,
      title: "Final Balance",
      amountCents: 50_000,
      sortOrder: 1,
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
    },
  });
  const depositRequirement = await db.jobPaymentRequirement.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      jobId: fixture.jobId,
      title: "Deposit",
      amountCents: 50_000,
      status: JobPaymentRequirementStatus.PENDING,
      sourcePaymentScheduleItemId: depositSchedule.id,
    },
    select: { id: true, title: true, amountCents: true },
  });
  const finalRequirement = await db.jobPaymentRequirement.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      jobId: fixture.jobId,
      title: "Final Balance",
      amountCents: 50_000,
      status: JobPaymentRequirementStatus.PENDING,
      sourcePaymentScheduleItemId: finalSchedule.id,
    },
    select: { id: true, title: true, amountCents: true },
  });
  return { depositRequirement, finalRequirement };
}

export function buildAddToFinalPaymentImpactJson(params: {
  priceDeltaCents: number;
  targetPaymentRequirementId: string;
}): Record<string, unknown> {
  const built = buildPaymentImpactForStrategy({
    strategy: "ADD_TO_FINAL_PAYMENT",
    priceDeltaCents: params.priceDeltaCents,
    requirements: [
      {
        id: params.targetPaymentRequirementId,
        title: "Final Balance",
        amountCents: 50_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "schedule-final",
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
        createdAt: new Date(),
      },
    ],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return changeOrderPaymentImpactToJson({
    ...built.impact,
    targetPaymentRequirementId: params.targetPaymentRequirementId,
    resolvedPreview: {
      ...built.impact.resolvedPreview,
      targetPaymentRequirementId: params.targetPaymentRequirementId,
    },
  });
}

export function buildAddToNextPaymentImpactJson(params: {
  priceDeltaCents: number;
  targetPaymentRequirementId: string;
}): Record<string, unknown> {
  const built = buildPaymentImpactForStrategy({
    strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: params.priceDeltaCents,
    requirements: [
      {
        id: params.targetPaymentRequirementId,
        title: "Deposit",
        amountCents: 50_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "schedule-deposit",
        scheduleSortOrder: 0,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        createdAt: new Date(),
      },
    ],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return changeOrderPaymentImpactToJson({
    ...built.impact,
    targetPaymentRequirementId: params.targetPaymentRequirementId,
    resolvedPreview: {
      ...built.impact.resolvedPreview,
      targetPaymentRequirementId: params.targetPaymentRequirementId,
    },
  });
}

export function buildCreditPaymentImpactJson(params: {
  priceDeltaCents: number;
}): Record<string, unknown> {
  const built = buildPaymentImpactForStrategy({
    strategy: "CREDIT_REMAINING_BALANCE",
    priceDeltaCents: params.priceDeltaCents,
    requirements: [
      {
        id: "final-req",
        title: "Final Balance",
        amountCents: 50_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: null,
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
        createdAt: new Date(),
      },
    ],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return changeOrderPaymentImpactToJson(built.impact);
}

export async function markChangeOrderSent(changeOrderId: string) {
  await db.changeOrder.update({
    where: { id: changeOrderId },
    data: { status: ChangeOrderStatus.SENT },
  });
}

export async function createChangeOrderShareToken(changeOrderId: string) {
  const rawToken = createPublicAccessToken();
  await db.changeOrderShareToken.create({
    data: {
      organizationId: DEV_ORGANIZATION_ID,
      changeOrderId,
      token: hashPublicAccessToken(rawToken),
    },
  });
  return rawToken;
}

export async function countActiveScopeItems(jobId: string) {
  return db.jobScopeItem.count({
    where: { jobId, status: JobScopeItemStatus.ACTIVE },
  });
}

export async function countActiveTasks(jobId: string) {
  return db.jobTask.count({
    where: { jobId, status: { not: JobTaskStatus.CANCELED } },
  });
}

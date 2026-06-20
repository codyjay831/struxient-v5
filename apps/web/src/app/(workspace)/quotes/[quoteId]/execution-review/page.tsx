import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteCheckpointKind, QuoteStatus } from "@prisma/client";
import { quoteAllowsQuoteLineExecutionPlanning } from "@/lib/quote-status-workflow";
import {
  QuoteExecutionReviewPreviewView,
  type QuoteActivationStatus,
} from "@/components/quotes/quote-execution-review-preview-view";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { buildQuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import {
  buildQuoteActivationReadinessInput,
  buildQuoteExecutionReviewModelInputFromPlan,
  hasQuoteWidePlanTasks,
  type QuotePlanSurfaceTask,
} from "@/lib/quote-execution-plan-surface";
import {
  QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  buildQuotePlanPlanningInput,
  loadQuotePlanContext,
} from "@/lib/quote-plan/quote-plan-context";
import { computeQuotePlanningInputHash } from "@/lib/quote-plan/planning-input-hash";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function QuoteExecutionReviewPreviewPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  const qid = quoteId.trim();
  if (!qid) {
    notFound();
  }

  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Sales", href: "/leads" },
            { label: "Build execution plan" },
          ]}
        />
        <PageHeader title="Build execution plan" description="Prepare the work plan before job activation." />
        <AccessDeniedPanel description="This role cannot review quote execution plans." />
      </div>
    );
  }

  const [row, approvalCheckpoint, stages] = await Promise.all([
    db.quote.findFirst({
      where: { id: qid, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        totalCents: true,
        job: { select: { id: true } },
        paymentSchedule: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            title: true,
            amountCents: true,
            percentage: true,
            anchorType: true,
          },
        },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            id: true,
            description: true,
            sortOrder: true,
            executionRelevant: true,
            draftExecutionTasks: {
              select: { id: true },
            },
          },
        },
        executionPlan: {
          select: {
            id: true,
            status: true,
            planVersion: true,
            planningInputHash: true,
            planningInputSchemaVersion: true,
            tasks: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                id: true,
                title: true,
                stageId: true,
                stage: { select: { name: true } },
                category: true,
                instructions: true,
                sortOrder: true,
                protectedAt: true,
                humanEditedAt: true,
                providesSignals: true,
                requiresSignals: true,
                hardSignal: true,
                requirementsJson: true,
                partsRequiredJson: true,
                scopes: {
                  select: { quoteLineItemId: true },
                },
              },
            },
          },
        },
      },
    }),
    db.quoteCheckpoint.findFirst({
      where: {
        organizationId: ctx.organizationId,
        quoteId: qid,
        kind: QuoteCheckpointKind.APPROVAL,
      },
      orderBy: { sequence: "desc" },
      select: { id: true },
    }),
    db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!row) {
    notFound();
  }

  const planContext = await loadQuotePlanContext(qid, ctx.organizationId);
  const currentPlanningInputHash =
    planContext && row.executionPlan
      ? computeQuotePlanningInputHash(
          buildQuotePlanPlanningInput(planContext),
          row.executionPlan.planningInputSchemaVersion ?? QUOTE_PLAN_INPUT_SCHEMA_VERSION,
        )
      : null;

  const executionPlanningEditable = quoteAllowsQuoteLineExecutionPlanning(
    row.status,
    Boolean(row.job),
  );

  const surfaceLines = row.lineItems.map((line) => ({
    id: line.id,
    description: line.description,
    sortOrder: line.sortOrder,
    executionRelevant: line.executionRelevant,
  }));

  const planTasks: QuotePlanSurfaceTask[] =
    row.executionPlan?.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      stageId: task.stageId,
      stageName: task.stage?.name ?? null,
      category: task.category,
      instructions: task.instructions,
      sortOrder: task.sortOrder,
      protectedAt: task.protectedAt,
      humanEditedAt: task.humanEditedAt,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: task.hardSignal,
      requirementsJson: task.requirementsJson,
      partsRequiredJson: task.partsRequiredJson,
      scopeLineIds: task.scopes.map((scope) => scope.quoteLineItemId),
    })) ?? [];

  const hasPlanTasks = hasQuoteWidePlanTasks(planTasks);
  const lineLabelById = Object.fromEntries(row.lineItems.map((line) => [line.id, line.description]));
  const draftTaskCount = row.lineItems.reduce(
    (count, line) => count + line.draftExecutionTasks.length,
    0,
  );
  const scopeLines = row.lineItems.map((line) => ({
    id: line.id,
    description: line.description,
    executionRelevant: line.executionRelevant,
  }));

  const model = buildQuoteExecutionReviewPreviewModel(
    buildQuoteExecutionReviewModelInputFromPlan(
      { id: row.id, title: row.title, status: row.status },
      surfaceLines,
      planTasks,
    ),
  );

  const executionPlanTasks = planTasks.map((task) => ({
    id: task.id,
    title: task.title,
    stageName: task.stageName ?? "No stage",
    sortOrder: task.sortOrder,
    protectedAt: task.protectedAt ?? null,
    humanEditedAt: task.humanEditedAt ?? null,
    providesSignals: task.providesSignals,
    requiresSignals: task.requiresSignals,
    scopeLineIds: task.scopeLineIds,
  }));

  const planTasksForGaps = planTasks.map((task) => ({
    id: task.id,
    title: task.title,
    stageId: task.stageId,
    category: task.category,
  }));

  let activation: QuoteActivationStatus;
  if (row.job) {
    activation = { state: "activated", jobId: row.job.id };
  } else {
    const readiness = evaluateQuoteJobActivationReadiness(
      buildQuoteActivationReadinessInput({
        status: row.status,
        hasApprovalCheckpoint: Boolean(approvalCheckpoint),
        executionPlan: row.executionPlan
          ? {
              status: row.executionPlan.status,
              planVersion: row.executionPlan.planVersion,
              planningInputHash: row.executionPlan.planningInputHash,
              planningInputSchemaVersion: row.executionPlan.planningInputSchemaVersion,
            }
          : null,
        currentPlanningInputHash,
        lines: surfaceLines,
        planTasks,
        quoteTotalCents: row.totalCents,
        paymentSchedule: row.paymentSchedule.map((item) => ({
          id: item.id,
          title: item.title,
          anchorType: item.anchorType,
          amountCents: item.amountCents,
          percentage: item.percentage,
        })),
      }),
    );
    activation = readiness.ready
      ? { state: "ready_to_activate", readiness }
      : {
          state: "blocked",
          readiness,
          quoteIsApproved: row.status === QuoteStatus.APPROVED,
        };
  }

  const isStale =
    currentPlanningInputHash !== null &&
    row.executionPlan !== null &&
    currentPlanningInputHash !== row.executionPlan.planningInputHash;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales", href: "/leads" },
          { label: row.title, href: `/quotes/${qid}` },
          { label: "Build execution plan" },
        ]}
      />
      <PageHeader
        eyebrow="Sales to production handoff"
        title="Build execution plan"
        description={
          activation.state === "activated"
            ? `Job already exists for “${row.title}”. Changes on this quote no longer update the active job plan.`
            : row.status === QuoteStatus.APPROVED
              ? `Build the work plan for “${row.title}” before activating the job. Commercial terms are approved; activation copies planned stages, tasks, payments, and readiness checks into the job.`
              : `Plan how “${row.title}” will execute after customer approval.`
        }
        actions={
          <Link href={`/quotes/${qid}`} className={listLinkClass}>
            ← Back to quote
          </Link>
        }
      />

      <QuoteExecutionReviewPreviewView
        quoteId={qid}
        quoteTitle={row.title}
        executionPlanningEditable={executionPlanningEditable}
        model={model}
        activation={activation}
        hasPlanTasks={hasPlanTasks}
        planTasksForGaps={planTasksForGaps}
        executionPlanTasks={executionPlanTasks}
        lineLabelById={lineLabelById}
        executionPlanState={
          row.executionPlan
            ? {
                status: row.executionPlan.status,
                planVersion: row.executionPlan.planVersion,
                taskCount: row.executionPlan.tasks.length,
              }
            : null
        }
        isStale={isStale}
        stages={stages}
        scopeLines={scopeLines}
        draftTaskCount={draftTaskCount}
      />
    </div>
  );
}

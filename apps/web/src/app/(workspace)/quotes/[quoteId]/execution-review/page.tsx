import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteStatus } from "@prisma/client";
import { quoteAllowsQuoteLineExecutionPlanning } from "@/lib/quote-status-workflow";
import {
  QuoteExecutionReviewPreviewView,
  type QuoteActivationStatus,
} from "@/components/quotes/quote-execution-review-preview-view";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import { buildQuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";

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

  const ctx = await getRequestContextOrThrow();

  const [row, stages] = await Promise.all([
    db.quote.findFirst({
      where: { id: qid, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        job: { select: { id: true } },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            id: true,
            description: true,
            sortOrder: true,
            draftExecutionTasks: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                id: true,
                title: true,
                stageId: true,
                stage: { select: { name: true } },
                category: true,
                instructions: true,
                sortOrder: true,
                sourceType: true,
                sourceTaskTemplateId: true,
                sourceLineItemTemplateTaskId: true,
                providesSignals: true,
                requiresSignals: true,
                hardSignal: true,
                requirementsJson: true,
                partsRequiredJson: true,
              },
            },
          },
        },
      },
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

  const executionPlanningEditable = quoteAllowsQuoteLineExecutionPlanning(
    row.status,
    Boolean(row.job),
  );

  const draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]> = {};
  for (const line of row.lineItems) {
    draftTasksByLineId[line.id] = line.draftExecutionTasks.map((t) => ({
      id: t.id,
      title: t.title,
      stageId: t.stageId,
      stageName: t.stage?.name,
      category: t.category,
      instructions: t.instructions,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceTaskTemplateId: t.sourceTaskTemplateId,
      sourceLineItemTemplateTaskId: t.sourceLineItemTemplateTaskId,
      providesSignals: t.providesSignals,
      requiresSignals: t.requiresSignals,
      hardSignal: t.hardSignal,
      requirementsJson: t.requirementsJson,
      partsRequiredJson: t.partsRequiredJson,
    }));
  }

  const reusableTaskOptions: ReusableTaskPickerOption[] = executionPlanningEditable
    ? (
        await db.taskTemplate.findMany({
          where: { organizationId: ctx.organizationId, archivedAt: null },
          orderBy: { title: "asc" },
          select: { id: true, title: true, stage: { select: { name: true } }, category: true },
        })
      ).map((r) => ({
        id: r.id,
        title: r.title,
        stageLabel: r.stage?.name ?? "No stage",
        categoryLabel: getTaskTemplateCategoryLabel(r.category),
      }))
    : [];

  const model = buildQuoteExecutionReviewPreviewModel({
    id: row.id,
    title: row.title,
    status: row.status,
    lines: row.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      sortOrder: l.sortOrder,
      tasks: l.draftExecutionTasks.map((t) => ({
        id: t.id,
        title: t.title,
        stageId: t.stageId,
        stageName: t.stage?.name,
        category: t.category,
        providesSignals: t.providesSignals,
        requiresSignals: t.requiresSignals,
        hardSignal: t.hardSignal,
        sortOrder: t.sortOrder,
        requirementsJson: t.requirementsJson,
        partsRequiredJson: t.partsRequiredJson,
      })),
    })),
  });

  let activation: QuoteActivationStatus;
  if (row.job) {
    activation = { state: "activated", jobId: row.job.id };
  } else {
    const readiness = evaluateQuoteJobActivationReadiness({
      status: row.status,
      lines: row.lineItems.map((l) => ({
        id: l.id,
        description: l.description,
        tasks: l.draftExecutionTasks.map((t) => ({
          id: t.id,
          title: t.title,
          providesSignals: t.providesSignals,
          requiresSignals: t.requiresSignals,
          hardSignal: t.hardSignal,
        })),
      })),
    });
    activation = readiness.ready
      ? { state: "ready_to_activate", readiness }
      : {
          state: "blocked",
          readiness,
          quoteIsApproved: row.status === QuoteStatus.APPROVED,
        };
  }

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Proposals", href: "/quotes" },
          { label: row.title, href: `/quotes/${qid}` },
          { label: "Execution preview" },
        ]}
      />
      <PageHeader
        eyebrow="Sales · Internal planning"
        title="Execution preview"
        description={
          activation.state === "activated"
            ? `Job already exists for “${row.title}”. Internal planning here does not change tasks already on the job.`
            : row.status === QuoteStatus.APPROVED
              ? `Review internal draft execution for “${row.title}” before activating a job. Commercial terms are already approved; activation copies these stages and signals into a runtime job.`
              : `Preview how draft execution on “${row.title}” would become a job plan after activation. Activation is enabled once the quote is approved.`
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
        draftTasksByLineId={draftTasksByLineId}
        reusableTaskOptions={reusableTaskOptions}
        stages={stages}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { LineItemTemplateTaskSource } from "@prisma/client";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { LineItemTemplateDefaultExecutionPanel } from "@/components/scope-library/line-item-template-default-execution-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getTaskTemplateCategoryLabel } from "@/lib/task-template-category";
import type {
  DefaultExecutionStageGroup,
  DefaultExecutionTaskRow,
  ReusableTaskPickerOption,
} from "@/lib/line-item-template-default-execution-display";

export const dynamic = "force-dynamic";

export default async function LineItemTemplateDefaultExecutionPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const id = templateId.trim();
  if (!id) {
    notFound();
  }

  const ctx = await getRequestContextOrThrow();

  const preset = await db.lineItemTemplate.findFirst({
    where: { id, organizationId: ctx.organizationId, archivedAt: null },
    select: { id: true, description: true },
  });

  if (!preset) {
    notFound();
  }

  const [rawTasks, stages, reusableRows] = await Promise.all([
    db.lineItemTemplateTask.findMany({
      where: { lineItemTemplateId: id },
      include: { stage: { select: { name: true } } },
      orderBy: [{ sortOrder: "asc" }],
    }),
    db.stage.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.taskTemplate.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true, stageId: true, category: true, stage: { select: { name: true } } },
    }),
  ]);

  const tasksByStage = new Map<string | null, DefaultExecutionTaskRow[]>();
  
  // Initialize map with all stages plus a null key for tasks without a stage
  tasksByStage.set(null, []);
  for (const s of stages) {
    tasksByStage.set(s.id, []);
  }

  for (const t of rawTasks) {
    const row: DefaultExecutionTaskRow = {
      id: t.id,
      title: t.title,
      stageId: t.stageId,
      category: t.category,
      instructions: t.instructions,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceTaskTemplateId: t.sourceTaskTemplateId,
      sourceLineItemTemplateTaskId: null,
      providesSignals: t.providesSignals,
      requiresSignals: t.requiresSignals,
      hardSignal: t.hardSignal,
      requirementsJson: t.requirementsJson,
    };
    tasksByStage.get(t.stageId)?.push(row);
  }

  const stagesWithTasks: DefaultExecutionStageGroup[] = [];
  
  // First, add tasks with no stage
  const noStageTasks = tasksByStage.get(null) || [];
  if (noStageTasks.length > 0) {
    stagesWithTasks.push({
      stageId: null,
      label: "No stage",
      tasks: noStageTasks,
    });
  }

  // Then, add tasks grouped by stage in stage sortOrder
  for (const s of stages) {
    const tasks = tasksByStage.get(s.id) || [];
    if (tasks.length > 0) {
      stagesWithTasks.push({
        stageId: s.id,
        label: s.name,
        tasks,
      });
    }
  }

  const reusableOptions: ReusableTaskPickerOption[] = reusableRows.map((r) => ({
    id: r.id,
    title: r.title,
    stageLabel: r.stage?.name ?? "No stage",
    categoryLabel: getTaskTemplateCategoryLabel(r.category),
  }));

  const taskCount = rawTasks.length;
  const sourceSummary =
    taskCount === 0
      ? null
      : `${rawTasks.filter((t) => t.sourceType === LineItemTemplateTaskSource.TASK_TEMPLATE).length} from library · ${rawTasks.filter((t) => t.sourceType === LineItemTemplateTaskSource.CUSTOM).length} custom`;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Scope Library", href: "/scope-library" },
          { label: "Saved line item" },
          { label: "Default execution" },
        ]}
      />
      <PageHeader
        eyebrow="Sales · Scope Library"
        title="Default execution"
        description={
          <>
            <span className="font-medium text-foreground">{preset.description}</span>
            {taskCount > 0 && sourceSummary ? (
              <span className="mt-1 block text-xs font-normal text-foreground-muted">
                {taskCount} saved {taskCount === 1 ? "task" : "tasks"} · {sourceSummary}
              </span>
            ) : null}
          </>
        }
        actions={
          <Link
            href="/scope-library"
            className="text-sm font-medium text-foreground-muted underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
          >
            ← Saved line items
          </Link>
        }
      />
      <ScopeLibrarySectionNav active="presets" />
      <LineItemTemplateDefaultExecutionPanel
        lineItemTemplateId={preset.id}
        presetDescription={preset.description}
        stagesWithTasks={stagesWithTasks}
        reusableOptions={reusableOptions}
        stages={stages}
      />
    </div>
  );
}

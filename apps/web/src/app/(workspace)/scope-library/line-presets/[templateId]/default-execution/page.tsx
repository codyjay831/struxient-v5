import { notFound } from "next/navigation";
import Link from "next/link";
import { LineItemTemplateTaskSource } from "@prisma/client";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ScopeLibrarySectionNav } from "@/components/scope-library/scope-library-section-nav";
import { LineItemTemplateDefaultExecutionPanel } from "@/components/scope-library/line-item-template-default-execution-panel";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { EXECUTION_STAGE_KEYS_ORDERED, getExecutionStageLabel } from "@/lib/execution-stage-catalog";
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

  const org = await getDevOrganizationOrThrow();

  const preset = await db.lineItemTemplate.findFirst({
    where: { id, organizationId: org.id, archivedAt: null },
    select: { id: true, description: true },
  });

  if (!preset) {
    notFound();
  }

  const rawTasks = await db.lineItemTemplateTask.findMany({
    where: { lineItemTemplateId: id },
    orderBy: [{ sortOrder: "asc" }],
  });

  const tasksByStage = new Map<string, DefaultExecutionTaskRow[]>();
  for (const sk of EXECUTION_STAGE_KEYS_ORDERED) {
    tasksByStage.set(sk, []);
  }
  for (const t of rawTasks) {
    const row: DefaultExecutionTaskRow = {
      id: t.id,
      title: t.title,
      stageKey: t.stageKey,
      category: t.category,
      instructions: t.instructions,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceTaskTemplateId: t.sourceTaskTemplateId,
      sourceLineItemTemplateTaskId: null,
    };
    tasksByStage.get(t.stageKey)?.push(row);
  }

  const stagesWithTasks: DefaultExecutionStageGroup[] = EXECUTION_STAGE_KEYS_ORDERED.filter(
    (sk) => (tasksByStage.get(sk)?.length ?? 0) > 0,
  ).map((sk) => ({
    stageKey: sk,
    label: getExecutionStageLabel(sk),
    tasks: tasksByStage.get(sk) ?? [],
  }));

  const reusableRows = await db.taskTemplate.findMany({
    where: { organizationId: org.id, archivedAt: null },
    orderBy: { title: "asc" },
    select: { id: true, title: true, stageKey: true, category: true },
  });

  const reusableOptions: ReusableTaskPickerOption[] = reusableRows.map((r) => ({
    id: r.id,
    title: r.title,
    stageLabel: getExecutionStageLabel(r.stageKey),
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
      />
    </div>
  );
}

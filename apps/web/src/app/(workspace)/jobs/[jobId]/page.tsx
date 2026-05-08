import Link from "next/link";
import { notFound } from "next/navigation";
import { JobStageBlockType } from "@prisma/client";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import {
  formatJobStatus,
  formatJobTaskStatus,
  jobStatusBadgeTone,
  jobTaskStatusBadgeTone,
} from "@/lib/job-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { Briefcase, Layers, ListOrdered } from "lucide-react";
import { JobIssueManager } from "@/components/jobs/job-issue-manager";
import { JobPaymentManager } from "@/components/jobs/job-payment-manager";
import { JobActivityFeed } from "@/components/jobs/job-activity-feed";
import { JobIssueStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const id = jobId.trim();
  if (!id) {
    notFound();
  }

  const org = await getDevOrganizationOrThrow();

  const job = await db.job.findFirst({
    where: { id, organizationId: org.id },
    select: {
      id: true,
      title: true,
      status: true,
      activatedAt: true,
      createdAt: true,
      updatedAt: true,
      quoteId: true,
      quote: { select: { id: true, title: true, organizationId: true } },
      customer: { select: { id: true, displayName: true, organizationId: true } },
      lead: { select: { id: true, title: true, organizationId: true } },
      issues: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          type: true,
          severity: true,
          status: true,
          description: true,
          resolutionNote: true,
          resolvedAt: true,
          createdAt: true,
          jobStage: { select: { title: true } },
          jobTask: { select: { title: true } },
          followUpTask: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
      stages: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          id: true,
          stageKey: true,
          title: true,
          blockType: true,
          blockTitle: true,
          blockSortOrder: true,
          sourceQuoteLineItemId: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              instructions: true,
              sourceQuoteLineItemId: true,
            },
          },
        },
      },
      paymentRequirements: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          amountCents: true,
          status: true,
          notes: true,
          requiredBeforeStageId: true,
          requiredBeforeStage: { select: { title: true } },
          paidAt: true,
          waivedAt: true,
          canceledAt: true,
        },
      },
      activities: {
        orderBy: [{ createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          type: true,
          title: true,
          details: true,
          createdAt: true,
          actorUser: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!job) {
    notFound();
  }

  const safeQuote = job.quote && job.quote.organizationId === org.id ? job.quote : null;
  const safeCustomer =
    job.customer && job.customer.organizationId === org.id ? job.customer : null;
  const safeLead = job.lead && job.lead.organizationId === org.id ? job.lead : null;

  const primaryIdentity = safeLead?.title || safeCustomer?.displayName || job.title;
  const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;

  const sharedStages = job.stages.filter((s) => s.blockType === JobStageBlockType.SHARED);

  const separateStages = job.stages.filter(
    (s) => s.blockType === JobStageBlockType.SEPARATE_LINE_ITEM,
  );

  type SeparateBlock = {
    blockKey: string;
    blockTitle: string;
    blockSortOrder: number;
    stages: typeof separateStages;
  };

  const blockMap = new Map<string, SeparateBlock>();
  for (const stage of separateStages) {
    const key = stage.sourceQuoteLineItemId ?? `__orphan_${stage.id}`;
    const existing = blockMap.get(key);
    if (existing) {
      existing.stages.push(stage);
    } else {
      blockMap.set(key, {
        blockKey: key,
        blockTitle: stage.blockTitle ?? "Separate work block",
        blockSortOrder: stage.blockSortOrder,
        stages: [stage],
      });
    }
  }
  const separateBlocks: SeparateBlock[] = [...blockMap.values()].sort(
    (a, b) => a.blockSortOrder - b.blockSortOrder || a.blockTitle.localeCompare(b.blockTitle),
  );

  const totalTasks = job.stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const activatedLabel = new Date(job.activatedAt).toLocaleString();

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Work" },
          { label: "Jobs", href: "/jobs" },
          { label: primaryIdentity },
        ]}
      />
      <PageHeader
        title={primaryIdentity}
        eyebrow={
          secondaryIdentity ? (
            <span className="flex items-center gap-2">
              <span>Runtime job</span>
              <span className="text-foreground-subtle/50">·</span>
              <span className="text-foreground-subtle">Job title: {secondaryIdentity}</span>
            </span>
          ) : (
            "Runtime job"
          )
        }
        description="Stages and tasks were copied from the source quote at activation. Editing the source quote does not change tasks already on this job."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {safeQuote ? (
              <Link href={`/quotes/${safeQuote.id}`} className={listLinkClass}>
                Open source quote
              </Link>
            ) : null}
            <Link href="/jobs" className={listLinkClass}>
              ← Jobs list
            </Link>
          </div>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Job record
        </p>
        <p className="mt-2 break-all font-mono text-xs text-foreground-muted">{job.id}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label={formatJobStatus(job.status)} tone={jobStatusBadgeTone(job.status)} />
          <span className="text-xs text-foreground-muted">
            Activated <time dateTime={job.activatedAt.toISOString()}>{activatedLabel}</time>
          </span>
        </div>
        <dl className="mt-4 grid gap-3 text-xs text-foreground-muted sm:grid-cols-2">
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Customer</dt>
            <dd className="mt-0.5 text-foreground">
              {safeCustomer ? (
                <Link href={`/customers/${safeCustomer.id}`} className="underline-offset-4 hover:underline">
                  {safeCustomer.displayName}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Lead</dt>
            <dd className="mt-0.5 text-foreground">
              {safeLead ? (
                <Link href={`/leads/${safeLead.id}`} className="underline-offset-4 hover:underline">
                  {safeLead.title}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </WorkspacePanel>

      <section className="mb-8">
        <SectionHeading
          title="Execution overview"
          description="Counts reflect the snapshot copied at activation. Status changes and assignments will land in a later slice."
        />
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <SignalCard label="Stages" value={String(job.stages.length)} hint="Shared and separate combined." />
          </li>
          <li>
            <SignalCard label="Shared stages" value={String(sharedStages.length)} hint="Canonical phases across lines." />
          </li>
          <li>
            <SignalCard label="Separate work blocks" value={String(separateBlocks.length)} hint="One per source line." />
          </li>
        </ul>
      </section>
      
      <JobIssueManager
        jobId={job.id}
        initialIssues={job.issues}
        stages={job.stages}
      />

      <JobPaymentManager
        jobId={job.id}
        initialRequirements={job.paymentRequirements}
        stages={job.stages}
      />

      <JobActivityFeed activities={job.activities} />

      {totalTasks === 0 ? (
        <WorkspacePanel>
          <EmptyState
            icon={Briefcase}
            title="No execution tasks on this job"
            description="No stages or tasks were copied at activation. Activation requires at least one executable task on the source quote in this build."
          >
            {safeQuote ? (
              <Link href={`/quotes/${safeQuote.id}`} className={listLinkClass}>
                Open source quote
              </Link>
            ) : null}
          </EmptyState>
        </WorkspacePanel>
      ) : null}

      {sharedStages.length > 0 ? (
        <WorkspacePanel className="mb-6">
          <SectionHeading
            title="Shared stages"
            description="Tasks merged across quote lines using canonical phases. Order follows the canonical stage order, then line work order, then task order at activation."
          />
          <div className="space-y-6">
            {sharedStages.map((stage) => (
              <section key={stage.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  {stage.title}
                </h3>
                {stage.tasks.length === 0 ? (
                  <p className="text-xs text-foreground-muted">No tasks on this stage.</p>
                ) : (
                  <ul className="space-y-2">
                    {stage.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="rounded-md border border-border/80 bg-background/30 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{task.title}</p>
                            {task.instructions ? (
                              <p className="mt-1 text-xs text-foreground-muted">{task.instructions}</p>
                            ) : null}
                          </div>
                          <StatusBadge
                            label={formatJobTaskStatus(task.status)}
                            tone={jobTaskStatusBadgeTone(task.status)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}

      {separateBlocks.length > 0 ? (
        <WorkspacePanel>
          <SectionHeading
            title="Separate work blocks"
            description="Each block is one quoted scope kept apart from shared stages. Tasks were copied at activation and remain pinned to the source line."
          />
          <div className="space-y-6">
            {separateBlocks.map((block) => (
              <section
                key={block.blockKey}
                className="rounded-lg border border-border-strong bg-surface/80 px-4 py-4 ring-1 ring-ring/20"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Layers className="size-4 text-foreground-subtle" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">{block.blockTitle}</h3>
                </div>
                <div className="space-y-4 border-t border-border pt-3">
                  {block.stages.map((stage) => (
                    <div key={stage.id}>
                      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        {stage.title}
                      </p>
                      {stage.tasks.length === 0 ? (
                        <p className="mt-2 text-xs text-foreground-muted">No tasks on this stage.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {stage.tasks.map((task) => (
                            <li
                              key={task.id}
                              className="rounded border border-border/60 bg-background/40 px-2.5 py-1.5"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-foreground">{task.title}</p>
                                  {task.instructions ? (
                                    <p className="mt-1 text-xs text-foreground-muted">{task.instructions}</p>
                                  ) : null}
                                </div>
                                <StatusBadge
                                  label={formatJobTaskStatus(task.status)}
                                  tone={jobTaskStatusBadgeTone(task.status)}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel padding="compact" className="mt-6 border-dashed border-border bg-surface/80">
        <div className="flex gap-2">
          <ListOrdered className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground-muted">
            Read-only stages and tasks for now. Status changes, assignments, scheduling, and field workflow ship in
            later slices—nothing here mutates the source quote.
          </p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

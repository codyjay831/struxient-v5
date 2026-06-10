import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

import {
  formatJobStatus,
  jobStatusBadgeTone,
} from "@/lib/job-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { Briefcase, Info, Zap } from "lucide-react";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { deriveLeadTitle } from "@/lib/lead/lead-projection";
import { JobJobsitePanel } from "@/components/jobs/job-jobsite-panel";
import { JobIssueManager } from "@/components/jobs/job-issue-manager";
import { JobPaymentManager } from "@/components/jobs/job-payment-manager";
import { JobActivityFeed } from "@/components/jobs/job-activity-feed";
import { DailyJobLogManager } from "@/components/jobs/daily-job-log-manager";
import { JobVisitManager } from "@/components/jobs/job-visit-manager";
import { JobScheduleCleanupReview } from "@/components/jobs/job-schedule-cleanup-review";
import { JobArchiveButton } from "@/components/jobs/job-archive-button";
import {
  buildScheduleCleanupReviewItems,
  loadPendingScheduleCleanupEvents,
} from "@/lib/scheduling/job-cancel-cleanup";
import { JobTaskCard } from "@/components/jobs/job-task-card";
import { JobEventButton } from "@/components/jobs/job-event-button";
import { JobTaskAddButton } from "@/components/jobs/job-task-add-button";
import { JobIssueSeverity, JobIssueStatus, JobStatus } from "@prisma/client";
import { getLiveSignals } from "@/lib/signal-bus";
import {
  attachScheduleAnchorsToRequirements,
  buildPaymentDueContextFromJob,
  CORRECTIONS_STAGE_NAME,
  deriveTaskPaymentHold,
  getUnsettledEffectivelyDueRequirements,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";
import {
  buildJobExecutionContextFromJob,
  deriveJobExecutionHealth,
  isExecutionHealthBannerEnabled,
} from "@/lib/job-execution-health";
import { JobExecutionHealthBanner } from "@/components/jobs/job-execution-health-banner";
import { parseJobIssueCreateIntent } from "@/lib/job-issue-intent";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { jobId } = await params;
  const parsedSearchParams = await searchParams;
  const id = jobId.trim();
  if (!id) {
    notFound();
  }

  const ctx = await getRequestContextOrThrow();
  const createIssueIntent = parseJobIssueCreateIntent(parsedSearchParams);

  const [job, liveSignals, members] = await Promise.all([
    db.job.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        status: true,
        activatedAt: true,
        createdAt: true,
        updatedAt: true,
        quoteId: true,
        serviceLocationId: true,
        serviceLocation: {
          select: { id: true, organizationId: true, formattedAddress: true, addressLine1: true },
        },
        visits: {
          orderBy: [{ scheduledStartAt: "desc" }],
          select: {
            id: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
            status: true,
            assignedUserId: true,
            notes: true,
            assignedUser: { select: { name: true, email: true } },
          },
        },
        quote: { select: { id: true, title: true, organizationId: true } },
        customer: {
          select: {
            id: true,
            displayName: true,
            organizationId: true,
            serviceLocations: {
              orderBy: { isPrimary: "desc" },
              select: { formattedAddress: true, addressLine1: true, isPrimary: true },
            },
          },
        },
        lead: {
          select: {
            id: true,
            organizationId: true,
            contact: true,
            request: true,
            address: true,
            signals: true,
          },
        },
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
            recoveryFlow: {
              select: {
                id: true,
                status: true,
                tasks: {
                  orderBy: { recoveryFlowOrder: "asc" },
                  select: {
                    id: true,
                    title: true,
                    status: true,
                  }
                }
              }
            }
          },
        },
        stages: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            id: true,
            title: true,
            sortOrder: true,
            stageId: true,
            issues: {
              where: {
                status: JobIssueStatus.OPEN,
                severity: JobIssueSeverity.BLOCKS_WORK,
              },
              select: { id: true, status: true, severity: true },
            },
            tasks: {
              orderBy: [{ sortOrder: "asc" }],
              select: {
                id: true,
                title: true,
                status: true,
                category: true,
                instructions: true,
                completedAt: true,
                completionNote: true,
                completionRequirementsJson: true,
                dueAt: true,
                scheduledStartAt: true,
                scheduledEndAt: true,
                assignedUserId: true,
                providesSignals: true,
                requiresSignals: true,
                hardSignal: true,
                sortOrder: true,
                recoveryFlow: {
                  select: { jobIssueId: true },
                },
                recoveryFlowId: true,
                attachments: {
                  where: { status: "READY" },
                  select: {
                    id: true,
                    fileName: true,
                    fileKey: true,
                    contentType: true,
                  },
                },
                issues: {
                  where: { status: JobIssueStatus.OPEN },
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    status: true,
                    severity: true,
                    type: true,
                    createdAt: true,
                    createdByUser: { select: { name: true } },
                    recoveryFlow: {
                      select: {
                        id: true,
                        status: true,
                        tasks: {
                          select: {
                            id: true,
                            title: true,
                            status: true,
                          },
                        },
                      },
                    },
                  },
                },
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
            sourcePaymentScheduleItemId: true,
            requiredBeforeStage: { select: { title: true, sortOrder: true } },
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
            metadataJson: true,
            createdAt: true,
            actorUser: { select: { name: true, email: true } },
          },
        },
        dailyJobLogs: {
          orderBy: [{ logDate: "desc" }],
          take: 30,
          select: {
            id: true,
            logDate: true,
            summary: true,
            internalNotes: true,
            status: true,
            reviewedAt: true,
            reviewedByUser: { select: { name: true, email: true } },
          },
        },
      },
    }),
    getLiveSignals(id),
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!job) {
    notFound();
  }

  const safeQuote = job.quote && job.quote.organizationId === ctx.organizationId ? job.quote : null;
  const safeCustomer =
    job.customer && job.customer.organizationId === ctx.organizationId ? job.customer : null;
  const safeLead = job.lead && job.lead.organizationId === ctx.organizationId ? job.lead : null;
  const safeServiceLocation =
    job.serviceLocation && job.serviceLocation.organizationId === ctx.organizationId
      ? job.serviceLocation
      : null;

  const jobsiteAddressLine = resolveJobsiteLineForQuoteOrJob({
    serviceLocation: safeServiceLocation
      ? {
          formattedAddress: safeServiceLocation.formattedAddress,
          addressLine1: safeServiceLocation.addressLine1,
        }
      : null,
    customerLocations: safeCustomer?.serviceLocations ?? [],
    leadRow: safeLead
      ? {
          address: safeLead.address,
          signals: safeLead.signals,
        }
      : null,
  });
  const jobCustomerId = safeCustomer?.id ?? null;
  const jobLeadEditHref = safeLead ? `/leads/${safeLead.id}/edit` : null;

  const safeLeadTitle = safeLead ? deriveLeadTitle(safeLead.contact, safeLead.request) : null;
  const primaryIdentity = safeLeadTitle || safeCustomer?.displayName || job.title;
  const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;

  const totalTasks = job.stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const firstAddableStageId =
    job.stages.find((stage) => stage.title !== CORRECTIONS_STAGE_NAME)?.id ?? null;
  const activatedLabel = new Date(job.activatedAt).toLocaleString();

  const paymentScheduleAnchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
  );
  const paymentRequirementsWithAnchors = attachScheduleAnchorsToRequirements(
    job.paymentRequirements,
    paymentScheduleAnchors,
  );

  const paymentDueContext = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages.map((s) => ({
      id: s.id,
      sortOrder: s.sortOrder,
      stageId: s.stageId,
      title: s.title,
      tasks: s.tasks.map((t) => ({
        status: t.status,
        recoveryFlowId: t.recoveryFlowId,
      })),
    })),
    paymentRequirements: paymentRequirementsWithAnchors,
  });
  const effectivelyDueRequirements = getUnsettledEffectivelyDueRequirements(
    paymentRequirementsWithAnchors,
    paymentDueContext,
  );

  const pendingCleanupEvents =
    job.status === JobStatus.ARCHIVED
      ? await loadPendingScheduleCleanupEvents(job.id, ctx.organizationId)
      : [];
  const scheduleCleanupReviewItems = buildScheduleCleanupReviewItems(pendingCleanupEvents);

  const executionHealth = deriveJobExecutionHealth(
    buildJobExecutionContextFromJob(
      {
        id: job.id,
        status: job.status,
        stages: job.stages.map((s) => ({
          id: s.id,
          title: s.title,
          sortOrder: s.sortOrder,
          stageId: s.stageId,
          issues: s.issues,
          tasks: s.tasks.map((t) => ({
            id: t.id,
            status: t.status,
            completedAt: t.completedAt,
            completionNote: t.completionNote,
            completionRequirementsJson: t.completionRequirementsJson,
            attachments: t.attachments,
            requiresSignals: t.requiresSignals,
            recoveryFlowId: t.recoveryFlowId,
            recoveryFlow: t.recoveryFlow,
            sortOrder: t.sortOrder,
            issues: t.issues.map((i) => ({
              id: i.id,
              status: i.status,
              severity: i.severity,
            })),
          })),
        })),
        issues: job.issues.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          severity: i.severity,
          recoveryFlow: i.recoveryFlow,
        })),
        paymentRequirements: paymentRequirementsWithAnchors,
      },
      liveSignals,
    ),
  );
  const showExecutionHealthBanner = isExecutionHealthBannerEnabled();

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Work" },
          { label: "Jobs", href: "/jobs" },
          { label: primaryIdentity },
        ]}
      />
      {showExecutionHealthBanner && (
        <JobExecutionHealthBanner health={executionHealth} />
      )}
      <PageHeader
        title={primaryIdentity}
        eyebrow={
          secondaryIdentity ? (
            <span className="flex items-center gap-2">
              <span>{job.status === JobStatus.ARCHIVED ? "Archived job" : "Active job"}</span>
              <span className="text-foreground-subtle/50">·</span>
              <span className="text-foreground-subtle">Job title: {secondaryIdentity}</span>
            </span>
          ) : job.status === JobStatus.ARCHIVED ? (
            "Archived job"
          ) : (
            "Active job"
          )
        }
        description="This job was created from the approved quote. Manage the work plan, blockers, payments, schedule, and job activity from here."
        actions={
          <div className="flex flex-wrap items-end justify-end gap-2">
            {job.status === JobStatus.ACTIVE ? <JobArchiveButton jobId={job.id} /> : null}
            <JobEventButton 
              jobId={job.id} 
              tasks={job.stages.flatMap(s => s.tasks.map(t => ({ id: t.id, title: t.title, stageTitle: s.title })))} 
            />
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

      <JobJobsitePanel
        jobsiteAddressLine={jobsiteAddressLine}
        customerId={jobCustomerId}
        leadEditHref={jobLeadEditHref}
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
        <dl className="mt-4 grid gap-3 text-xs text-foreground-muted sm:grid-cols-3">
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
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Intake</dt>
            <dd className="mt-0.5 text-foreground">
              {safeLead ? (
                <Link href={`/leads/${safeLead.id}`} className="underline-offset-4 hover:underline">
                  {safeLeadTitle ?? "Opportunity"}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium uppercase tracking-wide text-foreground-subtle">Source quote</dt>
            <dd className="mt-0.5 text-foreground">
              {safeQuote ? (
                <Link href={`/quotes/${safeQuote.id}`} className="underline-offset-4 hover:underline">
                  {safeQuote.title}
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
          title="Readiness checks"
          description="Completed work unlocks upcoming tasks. Use this view to see which readiness checks are currently active."
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="col-span-1">
            <SignalCard label="Active checks" value={String(liveSignals.length)} hint="Current readiness checks on this job." />
          </div>
          <div className="col-span-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle mb-2">Active readiness checks</p>
              {liveSignals.length === 0 ? (
                <p className="text-xs text-foreground-muted italic">No readiness checks are active yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {liveSignals.map(s => (
                    <span key={s} className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-1 text-[10px] font-mono font-bold text-accent">
                      <Zap className="size-2.5" />
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      
      <JobIssueManager
        jobId={job.id}
        initialIssues={job.issues}
        stages={job.stages}
        createIssueIntent={createIssueIntent}
      />

      <JobPaymentManager
        jobId={job.id}
        initialRequirements={paymentRequirementsWithAnchors}
        stages={job.stages}
        effectivelyDueRequirementIds={effectivelyDueRequirements.map((r) => r.id)}
      />

      <JobScheduleCleanupReview
        jobId={job.id}
        jobStatus={job.status}
        reviewItems={scheduleCleanupReviewItems}
      />

      <JobVisitManager
        jobId={job.id}
        initialVisits={job.visits}
        members={members.map((membership) => ({
          id: membership.user.id,
          label: membership.user.name || membership.user.email || "Unnamed user",
        }))}
      />

      <JobActivityFeed activities={job.activities} />

      <DailyJobLogManager
        jobId={job.id}
        initialLogs={job.dailyJobLogs}
      />

      {job.stages.length === 0 ? (
        <WorkspacePanel>
          <EmptyState
            icon={Briefcase}
            title="No execution stages on this job"
            description="No stages were copied at activation. Open the source quote to review execution planning before adding work here."
          >
            {safeQuote ? (
              <Link href={`/quotes/${safeQuote.id}`} className={listLinkClass}>
                Open source quote
              </Link>
            ) : null}
          </EmptyState>
        </WorkspacePanel>
      ) : (
        <WorkspacePanel className="mb-6">
          <SectionHeading
            title="Execution stages"
            description="Tasks grouped by stage. Add ordinary work here, use field events for holds, and use Issue / Recovery when something blocks progress."
          />
          {totalTasks === 0 ? (
            <div className="mb-6 rounded-lg border border-dashed border-border bg-surface/60 px-4 py-3 text-xs leading-relaxed text-foreground-muted">
              No tasks yet on this job. Add the first step to the internal work plan below. This
              does not change the quote or customer-approved scope.
            </div>
          ) : null}
          <div className="space-y-8">
            {job.stages.map((stage) => (
              <section key={stage.id}>
                <div className="mb-3 flex items-center justify-between gap-4 border-b border-border pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {stage.title}
                  </h3>
                  {stage.title === CORRECTIONS_STAGE_NAME ? (
                    <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                      Recovery tasks only
                    </p>
                  ) : (
                    <JobTaskAddButton
                      jobId={job.id}
                      jobStageId={stage.id}
                      stageTitle={stage.title}
                      variant={
                        totalTasks === 0 && stage.id === firstAddableStageId
                          ? "empty"
                          : "stage"
                      }
                    />
                  )}
                </div>
                {stage.tasks.length === 0 ? (
                  <p className="text-xs text-foreground-muted">
                    {stage.title === CORRECTIONS_STAGE_NAME
                      ? "Correction tasks appear here when a recovery path is active."
                      : "No tasks on this stage yet."}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {stage.tasks.map((task, taskIndex) => {
                      const paymentHold = deriveTaskPaymentHold(
                        stage.id,
                        paymentRequirementsWithAnchors,
                        paymentDueContext,
                      );
                      const issueForRecovery = task.recoveryFlow?.jobIssueId
                        ? job.issues.find((i) => i.id === task.recoveryFlow?.jobIssueId)
                        : null;
                      const showRecoveryFallbackLabels =
                        stage.title === CORRECTIONS_STAGE_NAME && !!issueForRecovery;
                      const totalRecoveryTasks =
                        issueForRecovery?.recoveryFlow?.tasks.length ?? 0;
                      const stepNumber = showRecoveryFallbackLabels
                        ? issueForRecovery!.recoveryFlow!.tasks.findIndex((t) => t.id === task.id) + 1
                        : 0;
                      return (
                        <li key={task.id} id={`task-${task.id}`}>
                          {showRecoveryFallbackLabels && (
                            <div className="mb-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-[10px] text-foreground-muted">
                              <p>
                                <span className="font-bold uppercase tracking-wider text-foreground-subtle">Recovery for:</span>{" "}
                                <span className="font-medium text-foreground">
                                  {issueForRecovery?.jobTask?.title ?? issueForRecovery?.jobStage?.title ?? "Blocked task"}
                                </span>
                              </p>
                              <p className="mt-0.5">
                                <span className="font-bold uppercase tracking-wider text-foreground-subtle">Issue:</span>{" "}
                                <span className="font-medium text-foreground">{issueForRecovery?.title}</span>
                              </p>
                              <p className="mt-0.5">
                                <span className="font-bold uppercase tracking-wider text-foreground-subtle">Step:</span>{" "}
                                <span className="font-medium text-foreground">
                                  {`Step ${stepNumber > 0 ? stepNumber : taskIndex + 1} of ${totalRecoveryTasks > 0 ? totalRecoveryTasks : stage.tasks.length}`}
                                </span>
                              </p>
                            </div>
                          )}
                          <JobTaskCard
                            jobId={job.id}
                            jobStageId={stage.id}
                            stageTitle={stage.title}
                            jobContextLabel={
                              secondaryIdentity ? `${primaryIdentity} · ${secondaryIdentity}` : primaryIdentity
                            }
                            jobsiteAddressLine={jobsiteAddressLine}
                            customerId={jobCustomerId}
                            leadEditHref={jobLeadEditHref}
                            task={task}
                            liveSignals={liveSignals}
                            stageIssues={stage.issues}
                            paymentHold={paymentHold}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </WorkspacePanel>
      )}

      <WorkspacePanel padding="compact" className="mt-6 border-dashed border-border bg-surface/80">
        <div className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground-muted">
            Work plan changes on this job update internal execution only. They do not change the
            source quote, price, or customer-approved scope. Use{" "}
            <span className="font-medium text-foreground">Add task</span> for ordinary plan
            refinement, <span className="font-medium text-foreground">Record field event</span>{" "}
            for lightweight holds, and{" "}
            <span className="font-medium text-foreground">Issue / Recovery</span> when work is
            blocked by a problem.
          </p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

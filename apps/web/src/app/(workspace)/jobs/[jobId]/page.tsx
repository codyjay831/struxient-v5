import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

import {
  formatJobStatus,
  jobStatusBadgeTone,
} from "@/lib/job-display";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { Info, Zap } from "lucide-react";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { deriveLeadTitle } from "@/lib/lead/lead-projection";
import { JobJobsitePanel } from "@/components/jobs/job-jobsite-panel";
import { JobIssueManager } from "@/components/jobs/job-issue-manager";
import { JobPaymentManager } from "@/components/jobs/job-payment-manager";
import { JobActivityFeed } from "@/components/jobs/job-activity-feed";
import { DailyJobLogManager } from "@/components/jobs/daily-job-log-manager";
import { JobScheduleEventsPanel } from "@/components/jobs/job-schedule-events-panel";
import { JobWorkPackagePanel } from "@/components/jobs/job-work-package-panel";
import { JobScheduleCleanupReview } from "@/components/jobs/job-schedule-cleanup-review";
import { JobArchiveButton } from "@/components/jobs/job-archive-button";
import {
  buildScheduleCleanupReviewItems,
  loadPendingScheduleCleanupEvents,
} from "@/lib/scheduling/job-cancel-cleanup";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";
import { JobEventButton } from "@/components/jobs/job-event-button";
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
import {
  JobExecutionEmptyState,
} from "@/components/jobs/job-execution-work-plan-view";
import { JobExecutionShell } from "@/components/jobs/job-execution-shell";
import {
  buildJobExecutionViewModel,
  parseJobExecutionViewMode,
} from "@/lib/job-execution-view-model";
import { parseJobIssueCreateIntent } from "@/lib/job-issue-intent";
import { resolveSiteDetailsForServiceLocation } from "@/lib/site-details/resolver";
import { siteDetailsPayloadFromResolved } from "@/lib/site-details/presentation";
import { jobChangeOrdersPath } from "@/lib/change-order-flow";
import { quoteAuthoringHref } from "@/lib/opportunity-tab-routing";

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
  const jobVisibilityWhere = getJobVisibilityWhere(ctx.role, ctx.userId);
  const createIssueIntent = parseJobIssueCreateIntent(parsedSearchParams);

  const [job, liveSignals] = await Promise.all([
    db.job.findFirst({
      where: { id, organizationId: ctx.organizationId, ...jobVisibilityWhere },
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
          select: {
            id: true,
            organizationId: true,
            formattedAddress: true,
            addressLine1: true,
            apn: true,
            detailsStatus: true,
            utility: { select: { name: true } },
            jurisdiction: { select: { name: true } },
          },
        },
        workPackages: {
          orderBy: [{ displayOrder: "asc" }],
          select: {
            id: true,
            title: true,
            workType: true,
            plannedStartDate: true,
            plannedEndDate: true,
            tasks: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
        scheduleEvents: {
          orderBy: [{ startAt: "desc" }],
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            startAt: true,
            endAt: true,
            completionOutcome: true,
            taskLinks: {
              select: {
                jobTask: {
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
        quote: { select: { id: true, title: true, leadId: true, organizationId: true } },
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
                schedulingRequirement: true,
                assignedUserId: true,
                workPackageId: true,
                providesSignals: true,
                requiresSignals: true,
                hardSignal: true,
                sortOrder: true,
                recoveryFlow: {
                  select: { jobIssueId: true },
                },
                recoveryFlowId: true,
                scheduleEventLinks: {
                  orderBy: [{ jobScheduleEvent: { startAt: "desc" } }],
                  select: {
                    jobScheduleEvent: {
                      select: {
                        id: true,
                        title: true,
                        status: true,
                        startAt: true,
                        endAt: true,
                      },
                    },
                  },
                },
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
  const resolvedSiteDetails = safeServiceLocation
    ? await resolveSiteDetailsForServiceLocation(
        db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0],
        { organizationId: ctx.organizationId, serviceLocationId: safeServiceLocation.id },
      )
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
  const executionView = parseJobExecutionViewMode(parsedSearchParams.executionView);

  const executionViewModel = buildJobExecutionViewModel({
    job: {
      id: job.id,
      status: job.status,
      stages: job.stages,
      issues: job.issues.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        severity: i.severity,
        recoveryFlow: i.recoveryFlow,
      })),
      paymentRequirements: paymentRequirementsWithAnchors,
    },
    workPackages: job.workPackages,
    scheduleEvents: job.scheduleEvents,
    liveSignals,
    paymentRequirements: paymentRequirementsWithAnchors,
  });

  const paymentHoldByStageId = Object.fromEntries(
    job.stages.map((stage) => [
      stage.id,
      deriveTaskPaymentHold(stage.id, paymentRequirementsWithAnchors, paymentDueContext),
    ]),
  );

  const jobContextLabel =
    secondaryIdentity ? `${primaryIdentity} · ${secondaryIdentity}` : primaryIdentity;

  return (
    <div className="mx-auto max-w-5xl">
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
              <span className="text-foreground-subtle">{secondaryIdentity}</span>
            </span>
          ) : job.status === JobStatus.ARCHIVED ? (
            "Archived job"
          ) : (
            "Active job"
          )
        }
        actions={
          <div className="flex flex-wrap items-end justify-end gap-2">
            {job.status === JobStatus.ACTIVE ? <JobArchiveButton jobId={job.id} /> : null}
            <JobEventButton 
              jobId={job.id} 
              tasks={job.stages.flatMap(s => s.tasks.map(t => ({ id: t.id, title: t.title, stageTitle: s.title })))} 
            />
            {safeQuote ? (
              <Link
                href={quoteAuthoringHref({ quoteId: safeQuote.id, leadId: safeQuote.leadId })}
                className={listLinkClass}
              >
                Source quote
              </Link>
            ) : null}
            <Link href="/jobs" className={listLinkClass}>
              ← Jobs
            </Link>
          </div>
        }
      />

      <JobJobsitePanel
        jobsiteAddressLine={jobsiteAddressLine}
        customerId={jobCustomerId}
        leadEditHref={jobLeadEditHref}
        siteDetails={
          resolvedSiteDetails ? siteDetailsPayloadFromResolved(resolvedSiteDetails) : null
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
                <Link
                  href={quoteAuthoringHref({ quoteId: safeQuote.id, leadId: safeQuote.leadId })}
                  className="underline-offset-4 hover:underline"
                >
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

      <WorkspacePanel id="execution-delta-actions">
        <SectionHeading
          title="Update what changed"
          description="Field reality changes fast. Start here to update execution, capture recovery work, or route commercial scope changes into a formal Change Order."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="#execution-stages" className={listLinkClass}>
            Update job plan
          </a>
          <a href="#job-issues" className={listLinkClass}>
            Create recovery work
          </a>
          <a href="#job-payments" className={listLinkClass}>
            Review payment impact
          </a>
          {safeQuote ? (
            <Link href={jobChangeOrdersPath(job.id)} className={listLinkClass}>
              Change scope (Change Order)
            </Link>
          ) : null}
        </div>
      </WorkspacePanel>

      <section id="job-issues">
        <JobIssueManager
          jobId={job.id}
          initialIssues={job.issues}
          stages={job.stages}
          createIssueIntent={createIssueIntent}
        />
      </section>

      <section id="job-payments">
        <JobPaymentManager
          jobId={job.id}
          initialRequirements={paymentRequirementsWithAnchors}
          stages={job.stages}
          effectivelyDueRequirementIds={effectivelyDueRequirements.map((r) => r.id)}
        />
      </section>

      <JobScheduleCleanupReview
        jobId={job.id}
        jobStatus={job.status}
        reviewItems={scheduleCleanupReviewItems}
      />

      <JobWorkPackagePanel
        jobId={job.id}
        workPackages={job.workPackages}
        tasks={job.stages.flatMap((stage) =>
          stage.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            stageTitle: stage.title,
            workPackageId: task.workPackageId,
            status: task.status,
          })),
        )}
      />

      <JobScheduleEventsPanel
        jobId={job.id}
        events={job.scheduleEvents}
        tasks={job.stages.flatMap((stage) =>
          stage.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
          })),
        )}
      />

      <JobActivityFeed activities={job.activities} />

      <DailyJobLogManager
        jobId={job.id}
        initialLogs={job.dailyJobLogs}
      />

      <section id="execution-stages">
      {job.stages.length === 0 ? (
        <JobExecutionEmptyState
          quoteHref={
            safeQuote
              ? quoteAuthoringHref({ quoteId: safeQuote.id, leadId: safeQuote.leadId })
              : null
          }
        />
      ) : (
        <JobExecutionShell
          initialView={executionView}
          viewModel={executionViewModel}
          stages={job.stages}
          jobIssues={job.issues}
          liveSignals={liveSignals}
          totalTasks={totalTasks}
          firstAddableStageId={firstAddableStageId}
          jobContextLabel={jobContextLabel}
          jobsiteAddressLine={jobsiteAddressLine}
          customerId={jobCustomerId}
          leadEditHref={jobLeadEditHref}
          getPaymentHoldByStageId={paymentHoldByStageId}
        />
      )}
      </section>

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

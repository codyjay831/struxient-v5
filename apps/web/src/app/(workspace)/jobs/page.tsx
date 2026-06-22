import Link from "next/link";
import { JobStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";

import { jobDetailPath } from "@/lib/job-path";
import { formatJobStatus, jobStatusBadgeTone } from "@/lib/job-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { ButtonLink } from "@/components/ui/button";
import { Briefcase } from "lucide-react";
import { quoteAuthoringHref } from "@/lib/opportunity-tab-routing";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const ctx = await getRequestContextOrThrow();

  const jobVisibilityWhere = getJobVisibilityWhere(ctx.role, ctx.userId);

  const [jobs, totalCount, activeCount, archivedCount] = await Promise.all([
    db.job.findMany({
      where: { organizationId: ctx.organizationId, ...jobVisibilityWhere },
      orderBy: [{ activatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        activatedAt: true,
        quoteId: true,
        quote: { select: { id: true, title: true, leadId: true, organizationId: true } },
        customer: { select: { id: true, displayName: true, organizationId: true } },
        lead: { select: { id: true, title: true, organizationId: true } },
        _count: { select: { tasks: true, stages: true } },
      },
    }),
    db.job.count({ where: { organizationId: ctx.organizationId, ...jobVisibilityWhere } }),
    db.job.count({ where: { organizationId: ctx.organizationId, status: JobStatus.ACTIVE, ...jobVisibilityWhere } }),
    db.job.count({ where: { organizationId: ctx.organizationId, status: JobStatus.ARCHIVED, ...jobVisibilityWhere } }),
  ]);


  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader variant="compact" title="Jobs" />

      <section className="mb-8">
        <SectionHeading title="Overview" />
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <SignalCard label="Jobs (all)" value={String(totalCount)} hint="Rows in this org." />
          </li>
          <li>
            <SignalCard label="Active jobs" value={String(activeCount)} hint="Activated, not archived." />
          </li>
          <li>
            <SignalCard label="Archived jobs" value={String(archivedCount)} hint="Read-only here." />
          </li>
        </ul>
      </section>

      {totalCount === 0 ? (
        <WorkspacePanel>
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Approve a quote and activate it to create the first job."
          >
            <ButtonLink href="/leads" variant="muted" size="sm">
              Open sales
            </ButtonLink>
          </EmptyState>
        </WorkspacePanel>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {jobs.map((job) => {
            const activated = new Date(job.activatedAt).toLocaleString();
            const safeQuote =
              job.quote && job.quote.organizationId === ctx.organizationId ? job.quote : null;
            const safeCustomer =
              job.customer && job.customer.organizationId === ctx.organizationId ? job.customer : null;
            const safeLead =
              job.lead && job.lead.organizationId === ctx.organizationId ? job.lead : null;

            
            const primaryIdentity = safeLead?.title || safeCustomer?.displayName || job.title;
            const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;

            const contextBits: string[] = [];
            if (safeCustomer) {
              contextBits.push(`Customer: ${safeCustomer.displayName}`);
            }
            if (safeLead) {
              contextBits.push(`Opportunity: ${safeLead.title}`);
            }
            if (contextBits.length === 0) {
              contextBits.push("No customer or lead linked");
            }
            return (
              <li key={job.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col">
                      <Link
                        href={jobDetailPath(job.id)}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {primaryIdentity}
                      </Link>
                      {secondaryIdentity && (
                        <span className="text-[10px] font-medium uppercase tracking-tight text-foreground-subtle">
                          Job title: {secondaryIdentity}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">{contextBits.join(" · ")}</p>
                    {safeQuote ? (
                      <p className="mt-1 text-xs text-foreground-muted">
                        From quote:{" "}
                        <Link
                          href={quoteAuthoringHref({
                            quoteId: safeQuote.id,
                            leadId: safeQuote.leadId,
                          })}
                          className="underline decoration-border underline-offset-4 hover:decoration-foreground"
                        >
                          {safeQuote.title}
                        </Link>
                      </p>
                    ) : null}
                    <dl className="mt-2 grid gap-1 text-xs text-foreground-muted sm:grid-cols-3">
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                          Activated
                        </dt>
                        <dd className="mt-0.5 text-foreground">{activated}</dd>
                      </div>
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                          Stages
                        </dt>
                        <dd className="mt-0.5 text-foreground">{job._count.stages}</dd>
                      </div>
                      <div>
                        <dt className="font-medium uppercase tracking-wide text-foreground-subtle">
                          Tasks
                        </dt>
                        <dd className="mt-0.5 text-foreground">{job._count.tasks}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge label={formatJobStatus(job.status)} tone={jobStatusBadgeTone(job.status)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

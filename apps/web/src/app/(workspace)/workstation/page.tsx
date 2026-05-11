import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import {
  queryWorkstationWorkItems,
  getWorkstationSummary,
  compareWorkstationSalesIntakeOrder,
  type WorkstationWorkItem,
  type WorkstationLens,
  type WorkstationFilterCategory,
} from "@/lib/workstation-query";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { WorkstationSalesIntakePanel } from "@/components/workstation/workstation-sales-intake-panel";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { db } from "@/lib/db";
import { JobTaskStatus } from "@prisma/client";
import { getSalesIntakeCommercialProgress } from "@/lib/sales-commercial-progress";
import {
  formatSalesIntakeSource,
  formatSalesIntakeStatus,
  salesIntakeStatusBadgeTone,
} from "@/lib/sales-intake-display";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { jobsiteLineFromSalesIntake } from "@/lib/jobsite-address";
import { intakeSnapshotForCustomerFromSalesIntake } from "@/lib/customer-service-location-from-sales-intake";
import type { SalesIntakeServiceAddressContext } from "@/app/(workspace)/sales/sales-workspace-actions";
import { 
  WorkstationFocusCard, 
  WorkstationQueueItem, 
  WorkstationClearedState,
  WorkstationFilterBar 
} from "@/components/workstation/workstation-ui";
import { Plus, Search, ListOrdered } from "lucide-react";

export const dynamic = "force-dynamic";

const quickActionClass =
  "flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-4 text-xs font-bold uppercase tracking-widest text-foreground transition-all hover:border-border-strong hover:bg-foreground/[0.02] sm:py-3";

export default async function WorkstationTodayLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;
  const lens = (typeof sp.lens === "string" ? sp.lens : "attention") as WorkstationLens;
  const filter = (typeof sp.filter === "string" ? sp.filter : "all") as WorkstationFilterCategory;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId);

  const summary = getWorkstationSummary(allItems);

  // Filter by lens
  let filteredItems = allItems;
  if (lens !== "all") {
    filteredItems = allItems.filter((i) => i.lens === lens);
  }

  // Filter by category
  if (filter !== "all") {
    filteredItems = filteredItems.filter((i) => i.filterCategory === filter);
  }

  const selectedItem = selectedId ? allItems.find((i) => i.id === selectedId) : null;

  // Helper to build hrefs that preserve lens/filter
  const buildItemHref = (item: WorkstationWorkItem) => {
    const p = new URLSearchParams();
    if (lens !== "attention") p.set("lens", lens);
    if (filter !== "all") p.set("filter", filter);
    p.set("selectedId", item.id);
    p.set("selectedKind", item.kind);
    return `?${p.toString()}`;
  };

  // Prioritize for the selected view
  const prioritizedItems = [...filteredItems].sort(compareWorkstationSalesIntakeOrder);

  const focusItem = prioritizedItems[0];
  const queueItems = prioritizedItems.slice(1);

  return (
    <div className="space-y-8">
      <WorkstationFilterBar currentFilter={filter} currentLens={lens} />

      {/* Quick Actions */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/sales/new" className={quickActionClass}>
          <Plus className="size-4" />
          New Intake
        </Link>
        <Link href="/sales?tab=proposals&new=true" className={quickActionClass}>
          <Plus className="size-4" />
          New Quote
        </Link>
        <Link href="/jobs" className={quickActionClass}>
          <ListOrdered className="size-4" />
          Browse Jobs
        </Link>
      </section>

      {prioritizedItems.length > 0 ? (
        <div className="space-y-12">
          {/* Primary Focus */}
          {focusItem && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                  Primary Focus
                </h3>
              </div>
              <WorkstationFocusCard 
                item={{
                  ...focusItem,
                  href: buildItemHref(focusItem)
                }} 
                isSelected={selectedId === focusItem.id} 
              />
            </section>
          )}

          {/* Secondary Queue */}
          {queueItems.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                  Queue
                </h3>
              </div>
              <div className="grid gap-2">
                {queueItems.map((item) => (
                  <WorkstationQueueItem 
                    key={item.id} 
                    item={{
                      ...item,
                      href: buildItemHref(item)
                    }} 
                    isSelected={selectedId === item.id} 
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <WorkstationClearedState lens={lens} filter={filter} />
      )}

      {selectedItem && (
        <div id="selected-item-panel" className="scroll-mt-6">
          <WorkstationWorkPanel item={selectedItem}>
            {selectedItem.kind === "task" && (
              <TaskDetailWrapper taskId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "job" && (
              <JobDetailWrapper jobId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "sales-intake" && (
              <SalesIntakeDetailWrapper salesIntakeId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "quote" && (
              <QuoteDetailWrapper quoteId={selectedItem.recordId} />
            )}
          </WorkstationWorkPanel>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="grid gap-6 border-t border-border pt-12 lg:grid-cols-2">
        <WorkspacePanel id="reserved-areas" padding="compact" className="bg-foreground/[0.01]">
          <SectionHeading title={WORKSTATION_COPY.reservedAreas.title} description={WORKSTATION_COPY.reservedAreas.description} />
          <div className="flex flex-wrap gap-2">
            <Link href="/workstation/tasks" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.tasksLabel}
            </Link>
            <Link href="/workstation/jobs" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.jobsLabel}
            </Link>
            <Link href="/workstation/schedule" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.scheduleLabel}
            </Link>
          </div>
        </WorkspacePanel>

        <HandoffPanel
          title="Authoritative record routes"
          description="Quotes and sales intakes sit under Sales; customer rows under Relationships; job and schedule placeholders under Work."
        >
          <Link href="/sales?tab=proposals" className={handoffMutedLinkClass}>
            Quotes
          </Link>
          <Link href="/customers" className={handoffMutedLinkClass}>
            Customers
          </Link>
          <Link href="/jobs" className={handoffPrimaryLinkClass}>
            Job records
          </Link>
          <Link href="/schedule" className={handoffMutedLinkClass}>
            Schedule
          </Link>
        </HandoffPanel>
      </div>
    </div>
  );
}

async function TaskDetailWrapper({ taskId }: { taskId: string }) {
  const ctx = await getRequestContextOrThrow();
  const payload = await loadJobTaskExecutionPayload(taskId, ctx.organizationId);

  if (!payload) return null;

  return <TaskWorkSurface {...payload} clearWorkstationSelectionOnComplete />;
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    include: {
      stages: true,
      tasks: {
        where: { status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!job) return null;

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: { 
      jobId: job.id, 
      status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] },
      job: { organizationId: ctx.organizationId }
    },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={job.tasks[0]?.title}
    />
  );
}

const WORKSTATION_CUSTOMER_LINK_FETCH_CAP = 500;

async function SalesIntakeDetailWrapper({ salesIntakeId }: { salesIntakeId: string }) {
  const ctx = await getRequestContextOrThrow();

  const salesIntake = await db.salesIntake.findFirst({
    where: { id: salesIntakeId, organizationId: ctx.organizationId },

    select: {
      id: true,
      status: true,
      title: true,
      contactName: true,
      email: true,
      phone: true,
      notes: true,
      source: true,
      customerId: true,
      createdAt: true,
      publicIntakeServiceLocation: true,
      customer: { select: { id: true, displayName: true } },
      visitRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!salesIntake) return null;

  const jobsiteAddressLine = jobsiteLineFromSalesIntake({
    publicIntakeServiceLocation: salesIntake.publicIntakeServiceLocation,
    notes: salesIntake.notes,
  });

  const linkedQuotes = await db.quote.findMany({
    where: { salesIntakeId: salesIntake.id, organizationId: ctx.organizationId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      updatedAt: true,
      _count: { select: { lineItems: true } },
      job: { select: { id: true, status: true, organizationId: true } },
    },
  });

  const progress = getSalesIntakeCommercialProgress({
    salesIntake: {
      status: salesIntake.status,
      customerId: salesIntake.customerId,
      email: salesIntake.email,
      phone: salesIntake.phone,
    },
    quotes: linkedQuotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job: q.job && q.job.organizationId === ctx.organizationId ? { id: q.job.id, status: q.job.status } : null,
    })),
  });

  const hasCustomer = salesIntake.customerId !== null;
  let customersForLink: { id: string; displayName: string }[] | undefined;
  if (!hasCustomer) {
    const rows = await db.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { displayName: "asc" },
      take: WORKSTATION_CUSTOMER_LINK_FETCH_CAP,
      select: { id: true, displayName: true },
    });
    customersForLink = rows.map((c) => ({ id: c.id, displayName: c.displayName }));
  }


  const surfaceQuotes = linkedQuotes
    .filter((q) => q.status !== "ARCHIVED")
    .map((q) => ({
      id: q.id,
      title: q.title,
      statusLabel: formatQuoteStatus(q.status),
      statusTone: quoteStatusBadgeTone(q.status),
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      href: `/sales?tab=proposals/${q.id}`,
    }));

  /* Embed QuoteWorkSurface(standard) inside the Sales Intake Quote tab when an active
   * quote exists. Same loader used by the Workstation quote drawer + full
   * Quote page so all containers see identical readiness state. */
  const activeQuoteId = progress.activeQuote?.id ?? null;
  const activeQuoteWorkSurface = activeQuoteId
    ? await loadQuoteWorkSurface(activeQuoteId, ctx.organizationId)
    : null;

  /* Pre-load Service address context for the Sales Intake workspace Customer Info
   * block (same shape the Sales Intake full page passes). */
  const intakeSnapshot = intakeSnapshotForCustomerFromSalesIntake({
    publicIntakeServiceLocation: salesIntake.publicIntakeServiceLocation,
    notes: salesIntake.notes,
  });
  const intakeForBlock = intakeSnapshot
    ? {
        defaultDisplayAddress:
          intakeSnapshot.formattedAddress.trim() ||
          intakeSnapshot.addressLine1.trim(),
        structuredJson: JSON.stringify(intakeSnapshot),
      }
    : { defaultDisplayAddress: "", structuredJson: "" };

  let serviceAddressContext: SalesIntakeServiceAddressContext;
  if (salesIntake.customerId) {
    const customerLocations = await db.customerServiceLocation.findMany({
      where: { customerId: salesIntake.customerId, organizationId: ctx.organizationId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        formattedAddress: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        googlePlaceId: true,
        latitude: true,
        longitude: true,
        source: true,
        isPrimary: true,
        createdFromSalesIntake: { select: { id: true, title: true, source: true } },
      },
    });
    serviceAddressContext = {
      customer: {
        customerId: salesIntake.customerId,
        customerHref: `/customers/${salesIntake.customerId}`,
        serviceLocations: customerLocations.map((loc) => ({
          id: loc.id,
          formattedAddress: loc.formattedAddress,
          addressLine1: loc.addressLine1,
          addressLine2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
          googlePlaceId: loc.googlePlaceId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          source: loc.source,
          isPrimary: loc.isPrimary,
          createdFromSalesIntake: loc.createdFromSalesIntake
            ? {
                id: loc.createdFromSalesIntake.id,
                title: loc.createdFromSalesIntake.title,
                source: loc.createdFromSalesIntake.source,
              }
            : null,
        })),
      },
      intake: intakeForBlock,
    };
  } else {
    serviceAddressContext = { customer: null, intake: intakeForBlock };
  }


  return (
    <WorkstationSalesIntakePanel
      salesIntakeId={salesIntake.id}
      salesIntakeTitle={salesIntake.title}
      contactName={salesIntake.contactName}
      email={salesIntake.email}
      phone={salesIntake.phone}
      notes={salesIntake.notes}
      statusValue={salesIntake.status}
      statusLabel={formatSalesIntakeStatus(salesIntake.status)}
      statusTone={salesIntakeStatusBadgeTone(salesIntake.status)}
      sourceLabel={formatSalesIntakeSource(salesIntake.source)}
      source={salesIntake.source}
      createdAtLabel={salesIntake.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
      customerId={salesIntake.customerId}
      customerDisplayName={salesIntake.customer?.displayName ?? null}
      customerHref={salesIntake.customer ? `/customers/${salesIntake.customer.id}` : null}
      customersForLink={customersForLink}
      linkedQuotes={surfaceQuotes}
      progress={progress}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      jobsiteAddressLine={jobsiteAddressLine}
      serviceAddressContext={serviceAddressContext}
      visitRequests={salesIntake.visitRequests.map((vr) => ({
        id: vr.id,
        requestedDate: vr.requestedDate,
        requestedDateLabel: vr.requestedDate
          ? vr.requestedDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null,
        requestedWindow: vr.requestedWindow,
        confirmedDate: vr.confirmedDate,
        status: vr.status,
        notes: vr.notes,
        createdAt: vr.createdAt,
      }))}
    />
  );
}

async function QuoteDetailWrapper({ quoteId }: { quoteId: string }) {
  const ctx = await getRequestContextOrThrow();
  const result = await loadQuoteWorkSurface(quoteId, ctx.organizationId);

  if (!result) return null;

  return (
    <QuoteWorkSurface
      mode="compact"
      quote={result.quote}
      readiness={result.readiness}
      workspaceTabs={result.workspaceTabs}
    />
  );
}

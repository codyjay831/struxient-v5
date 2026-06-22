import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SignalCard } from "@/components/ui/signal-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import {
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
} from "@/lib/quote-display";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";
import { CustomerServiceLocationsPanel } from "@/components/customers/customer-service-locations-panel";
import { deriveLeadTitle } from "@/lib/lead/lead-projection";
import { Phone, UserRound, Mail, History, Briefcase, FileText, ChevronRight, ArrowUpRight } from "lucide-react";
import { resolveSiteDetailsForServiceLocation } from "@/lib/site-details/resolver";
import { siteDetailsPayloadFromResolved } from "@/lib/site-details/presentation";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";
import { quoteAuthoringHref } from "@/lib/opportunity-tab-routing";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const emptySearchParams: { from?: string; section?: string } = {};
  const [{ customerId }, sq] = await Promise.all([
    params,
    searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  const fromWorkstation = sq.from === "workstation";
  const returnSection = typeof sq.section === "string" ? sq.section : "investigate";
  const returnHref = fromWorkstation ? workstationReturnHref(returnSection) : undefined;
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Customer profile"
          actions={
            <Link href="/customers" className={listLinkClass}>
              ← Customers
            </Link>
          }
        />
        <AccessDeniedPanel description="This role cannot access customer profiles." />
      </div>
    );
  }
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      organizationId: ctx.organizationId,
    },
  });

  const serviceLocations = customer
    ? await db.customerServiceLocation.findMany({
        where: {
          customerId: customer.id,
          organizationId: ctx.organizationId,
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          createdFromLead: {
            select: { id: true, contact: true, request: true, channel: true },
          },
        },
      })
    : [];
  const resolvedSiteDetailsRows = await Promise.all(
    serviceLocations.map(async (loc) => ({
      id: loc.id,
      siteDetails: await resolveSiteDetailsForServiceLocation(
        db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0],
        { organizationId: ctx.organizationId, serviceLocationId: loc.id },
      ),
    })),
  );
  const resolvedSiteDetailsByLocationId = new Map(
    resolvedSiteDetailsRows
      .filter((row) => row.siteDetails != null)
      .map((row) => [row.id, row.siteDetails as NonNullable<typeof row.siteDetails>]),
  );

  if (!customer) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Customer not found"
          actions={
            <>
              {returnHref ? (
                <Link href={returnHref} className={listLinkClass}>
                  ← Workstation
                </Link>
              ) : null}
              <Link href="/customers" className={listLinkClass}>
                ← Customers
              </Link>
            </>
          }
        />
        <EmptyState
          icon={UserRound}
          title="Customer not found"
          description="The customer may have been removed, or you may not have access to it."
        >
          <Link href="/customers" className={listLinkClass}>
            Back to customers
          </Link>
        </EmptyState>
      </div>
    );
  }

  const createdLabel = new Date(customer.createdAt).toLocaleString();
  const updatedLabel = new Date(customer.updatedAt).toLocaleString();

  const linkedLeads = await db.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      customerId: customer.id,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      source: true,
      contactName: true,
      email: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      convertedAt: true,
    },
  });

  const linkedQuotes = await db.quote.findMany({
    where: {
      organizationId: ctx.organizationId,
      customerId: customer.id,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      updatedAt: true,
      leadId: true,
    },
  });

  const linkedJobs = await db.job.findMany({
    where: {
      organizationId: ctx.organizationId,
      customerId: customer.id,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });

  const openQuotes = linkedQuotes.filter((q) => q.status === "SENT" || q.status === "APPROVED");
  const openJobs = linkedJobs.filter((j) => j.status === "ACTIVE");

  const lastContact = [
    customer.updatedAt,
    ...linkedLeads.map((l) => l.updatedAt),
    ...linkedQuotes.map((q) => q.updatedAt),
    ...linkedJobs.map((j) => j.updatedAt),
  ].reduce((max, curr) => (curr > max ? curr : max), customer.createdAt);

  const lastContactLabel = new Date(lastContact).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  /* Steer users back to the Sales workspace for active sales work. The Sales
     workspace is the primary place to build/send quotes, capture address, and
     activate jobs — the customer profile is the saved history view. If there
     is an in-progress opportunity, primary CTA is "Open opportunity", not "Create quote". */
  const activeLead = linkedLeads.find(
    (l) => l.status === "NEW" || l.status === "TRIAGING",
  ) ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {customer.displayName}
            </h1>
            {customer.companyName && (
              <span className="rounded-md bg-foreground/[0.03] px-2 py-0.5 text-xs font-medium text-foreground-muted border border-border">
                {customer.companyName}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-muted">
            {customer.phone && (
              <a
                href={`tel:${customer.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Phone className="size-3.5" />
                {formatPhoneForDisplay(customer.phone)}
              </a>
            )}
            {customer.email && (
              <a
                href={`mailto:${encodeURIComponent(customer.email)}`}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Mail className="size-3.5" />
                {customer.email}
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeLead && (
            <Link
              href={`/leads/${activeLead.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              Open active opportunity
              <ArrowUpRight className="ml-1.5 size-3.5" />
            </Link>
          )}
          <Link href={`/customers/${customer.id}/edit`} className={listLinkClass}>
            Edit profile
          </Link>
          <Link
            href={`/leads/new?customerId=${encodeURIComponent(customer.id)}`}
            className={listLinkClass}
          >
            New request
          </Link>
        </div>
      </div>

      {/* ── At a glance ───────────────────────────────────────────────────── */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SignalCard
          label="Open jobs"
          value={String(openJobs.length)}
          hint={openJobs.length > 0 ? openJobs[0].title : undefined}
        />
        <SignalCard
          label="Open quotes"
          value={String(openQuotes.length)}
          hint={openQuotes.length > 0 ? openQuotes[0].title : undefined}
        />
        <SignalCard
          label="Last contact"
          value={lastContactLabel}
        />
        <SignalCard
          label="Balance"
          value="—"
          hint="Payments coming soon"
        />
        <SignalCard
          label="Next visit"
          value="—"
          hint="Schedule coming soon"
        />
      </div>

      {/* ── Main content sections ─────────────────────────────────────────── */}
      <div className="space-y-12">
        {/* Active Work Section */}
        {(openJobs.length > 0 || openQuotes.length > 0) && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Briefcase className="size-4 text-foreground-subtle" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Active work
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {openJobs.length > 0 && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="bg-foreground/[0.02] px-4 py-2 border-b border-border">
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                      Open Jobs ({openJobs.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {openJobs.map((j) => (
                      <li key={j.id}>
                        <Link
                          href={`/jobs/${j.id}`}
                          className="flex items-center justify-between px-4 py-3 hover:bg-foreground/[0.01] transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground truncate">
                            {j.title}
                          </span>
                          <ChevronRight className="size-4 text-foreground-subtle" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openQuotes.length > 0 && (
                <div className="rounded-xl border border-border bg-surface overflow-hidden">
                  <div className="bg-foreground/[0.02] px-4 py-2 border-b border-border">
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                      Open Quotes ({openQuotes.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {openQuotes.map((q) => (
                      <li key={q.id}>
                        <Link
                          href={quoteAuthoringHref({ quoteId: q.id, leadId: q.leadId })}
                          className="flex items-center justify-between px-4 py-3 hover:bg-foreground/[0.01] transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {q.title}
                            </p>
                            <p className="text-[10px] text-foreground-subtle uppercase font-bold tracking-tight">
                              {formatQuoteStatus(q.status)}
                            </p>
                          </div>
                          <ChevronRight className="size-4 text-foreground-subtle" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Service Locations Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <UserRound className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Service locations
            </h2>
          </div>
          <CustomerServiceLocationsPanel
            customerId={customer.id}
            googleMapsApiKey={googleMapsApiKey}
            locations={serviceLocations.map((loc) => ({
              ...(() => {
                const resolved = resolvedSiteDetailsByLocationId.get(loc.id) ?? null;
                return resolved
                  ? siteDetailsPayloadFromResolved(resolved)
                  : {
                      apn: loc.apn ?? null,
                      utilityName: null,
                      jurisdictionName: null,
                      detailsStatus: loc.detailsStatus,
                    };
              })(),
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
              createdFromLead: loc.createdFromLead
                ? {
                    id: loc.createdFromLead.id,
                    title: deriveLeadTitle(
                      loc.createdFromLead.contact,
                      loc.createdFromLead.request,
                    ),
                    channel: loc.createdFromLead.channel,
                    source: loc.createdFromLead.channel,
                  }
                : null,
            }))}
          />
        </section>

        {/* Contact & Profile Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Phone className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Contact & Profile
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
              <div>
                <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1">
                  Email
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="hover:text-accent transition-colors">
                      {customer.email}
                    </a>
                  ) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1">
                  Phone
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="hover:text-accent transition-colors">
                      {formatPhoneForDisplay(customer.phone)}
                    </a>
                  ) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-1">
                  Company
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {customer.companyName || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* History Section (Collapsed) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <History className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              History
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
                  aria-hidden
                />
                <span className="text-xs font-medium text-foreground-muted group-open:text-foreground transition-colors">
                  View archived leads, closed quotes, and completed jobs
                </span>
              </summary>
              <div className="mt-6 space-y-8 border-t border-border pt-6">
                {/* Opportunities History */}
                <div>
                  <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-3 px-1">
                    Opportunities
                  </h3>
                  {linkedLeads.length === 0 ? (
                    <p className="text-xs text-foreground-subtle px-1">No opportunities on file.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {linkedLeads.map((l) => (
                        <li key={l.id} className="flex items-center justify-between px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link href={`/leads/${l.id}`} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
                              {l.title}
                            </Link>
                            <p className="text-[10px] text-foreground-subtle mt-0.5">
                              Created {new Date(l.createdAt).toLocaleDateString()} · {formatLeadChannel(l.source)}
                            </p>
                          </div>
                          <StatusBadge label={formatLeadStatus(l.status)} tone={leadStatusBadgeTone(l.status)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Quotes History */}
                <div>
                  <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-3 px-1">
                    Quotes
                  </h3>
                  {linkedQuotes.length === 0 ? (
                    <p className="text-xs text-foreground-subtle px-1">No quotes on file.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {linkedQuotes.map((q) => (
                        <li key={q.id} className="flex items-center justify-between px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link href={quoteAuthoringHref({ quoteId: q.id, leadId: q.leadId })} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
                              {q.title}
                            </Link>
                            <p className="text-[10px] text-foreground-subtle mt-0.5">
                              {formatMoneyCents(q.totalCents)} · Updated {new Date(q.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <StatusBadge label={formatQuoteStatus(q.status)} tone={quoteStatusBadgeTone(q.status)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Jobs History */}
                <div>
                  <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle mb-3 px-1">
                    Jobs
                  </h3>
                  {linkedJobs.length === 0 ? (
                    <p className="text-xs text-foreground-subtle px-1">No jobs on file.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {linkedJobs.map((j) => (
                        <li key={j.id} className="flex items-center justify-between px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link href={`/jobs/${j.id}`} className="text-sm font-medium text-foreground hover:underline underline-offset-4">
                              {j.title}
                            </Link>
                            <p className="text-[10px] text-foreground-subtle mt-0.5">
                              Updated {new Date(j.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                            {j.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </details>
          </div>
        </section>

        {/* Notes Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <FileText className="size-4 text-foreground-subtle" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Notes
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            {customer.notes ? (
              <p className="text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">
                {customer.notes}
              </p>
            ) : (
              <p className="text-sm text-foreground-subtle italic">No internal notes for this customer.</p>
            )}
          </div>
        </section>
      </div>

      {/* ── Footer / Technical ────────────────────────────────────────────── */}
      <footer className="mt-16 pt-8 border-t border-border flex flex-col items-center gap-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden opacity-40 hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle underline-offset-4 group-open:underline">
              Record details
            </span>
          </summary>
          <div className="mt-4 rounded-lg border border-border bg-surface p-4 min-w-[300px]">
            <dl className="space-y-3 text-[10px] font-mono text-foreground-subtle">
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-wider">Customer ID</dt>
                <dd className="text-foreground select-all">{customer.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-wider">Organization</dt>
                <dd className="text-foreground">{ctx.organizationName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-wider">Created</dt>
                <dd className="text-foreground">{createdLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="uppercase tracking-wider">Updated</dt>
                <dd className="text-foreground">{updatedLabel}</dd>
              </div>
            </dl>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/customers" className="text-xs text-foreground-subtle hover:text-foreground transition-colors">
            ← Back to customers
          </Link>
          <Link href="/workstation" className="text-xs text-foreground-subtle hover:text-foreground transition-colors">
            Workstation
          </Link>
        </div>
      </footer>
    </div>
  );
}

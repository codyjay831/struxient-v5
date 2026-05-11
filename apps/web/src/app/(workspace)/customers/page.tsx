import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { UserCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";

import { SALES_INTAKE_PIPELINE_OPEN_STATUSES } from "@/lib/sales-intake-display";
import { workstationReturnHref } from "@/lib/workstation-return-href";

export const dynamic = "force-dynamic";

const returnLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const sq = await (searchParams ?? Promise.resolve({} as { from?: string; section?: string }));
  const fromWorkstation = sq.from === "workstation";
  const returnSection = typeof sq.section === "string" ? sq.section : "investigate";
  const ctx = await getRequestContextOrThrow();
  const [customers, totalSalesIntakes, unlinkedSalesIntakes, openPipelineSalesIntakes] = await Promise.all([
    db.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { salesIntakes: true },
        },
      },
    }),
    db.salesIntake.count({ where: { organizationId: ctx.organizationId } }),
    db.salesIntake.count({ where: { organizationId: ctx.organizationId, customerId: null } }),
    db.salesIntake.count({
      where: {
        organizationId: ctx.organizationId,
        status: { in: [...SALES_INTAKE_PIPELINE_OPEN_STATUSES] },
      },
    }),
  ]);

  const customersWithLinkedSalesIntake = customers.filter((c) => c._count.salesIntakes > 0).length;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Relationships" }, { label: "Customers" }]}
      />
      <PageHeader
        title="Customers"
        description="Relationship records for this organization—identity and contact live here; linked sales intake appears as a count per row and on each customer’s detail page. Quotes and jobs remain future workspaces."
        actions={
          <>
            {fromWorkstation ? (
              <Link
                href={workstationReturnHref(returnSection)}
                className={returnLinkClass}
              >
                ← Workstation
              </Link>
            ) : null}
            <Link href="/customers/new" className={handoffPrimaryLinkClass}>
              New customer
            </Link>
            <PlaceholderButton>Merge records (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Relationship context"
        description="Customer rows are the anchor for durable identity; linked sales intakes are real today. Quotes are live under Sales; job, schedule, and payment routes are reserved shells—not auto-wired from this page."
      >
        <Link href="/sales" className={handoffMutedLinkClass}>
          Sales: Sales Intakes
        </Link>
        <Link href="/sales?tab=proposals" className={handoffMutedLinkClass}>
          Sales: Quotes
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Payments (reserved)
        </Link>
      </HandoffPanel>

      <section className="mb-10">
        <SectionHeading
          title="Organization snapshot"
          description="Real Sales Intake + Customer counts for this development tenant only. Jobs, money rollups, and contact-age signals stay placeholders until those models exist."
        />
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <SignalCard label="Customers" value={String(customers.length)} hint="Rows in this org." />
          </li>
          <li>
            <SignalCard label="Sales Intakes (all)" value={String(totalSalesIntakes)} hint="Intake records in this org." />
          </li>
          <li>
            <SignalCard
              label="Open pipeline sales intakes"
              value={String(openPipelineSalesIntakes)}
              hint="Status Open or Qualifying—manual lifecycle."
            />
          </li>
          <li>
            <SignalCard
              label="Unlinked sales intakes"
              value={String(unlinkedSalesIntakes)}
              hint="No customerId yet; link or create from each sales intake’s page."
            />
          </li>
        </ul>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>
            <SignalCard label="Active jobs" value="—" hint="Open work tied to customers" />
          </li>
          <li>
            <SignalCard label="Past-due AR" value="—" hint="When billing exists" />
          </li>
          <li>
            <SignalCard label="Stale contact" value="—" hint="No touch in N days" />
          </li>
        </ul>
        <p className="mt-3 text-xs text-foreground-muted">
          Customers with at least one linked sales intake:{" "}
          <span className="font-medium text-foreground">{customersWithLinkedSalesIntake}</span>
        </p>
      </section>

      <WorkspacePanel padding="compact" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Persistence Foundation Active
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This route reads from <span className="font-medium text-foreground">PostgreSQL</span> via{" "}
          <span className="font-medium text-foreground">Prisma</span>. Until auth exists, rows are
          scoped with <span className="font-medium text-foreground">getRequestContextOrThrow()</span>{" "}
          ({ctx.organizationName}).

        </p>
      </WorkspacePanel>

      <SectionHeading
        title="Customer records"
        description="Each row opens the customer detail page. Linked sales intakes counts come from the Sales Intake → Customer link in this org only."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Contact</th>
                <th className="pb-3 pr-4 font-medium">Linked sales intakes</th>
                <th className="pb-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border/50 last:border-0">
                  <td className="py-4 pr-4">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="group block rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="font-medium text-foreground transition-colors group-hover:text-foreground group-hover:underline">
                        {customer.displayName}
                      </div>
                      {customer.companyName && (
                        <div className="text-xs text-foreground-muted">{customer.companyName}</div>
                      )}
                    </Link>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="text-foreground-muted">{customer.email || "—"}</div>
                    <div className="text-xs text-foreground-subtle">{customer.phone || "—"}</div>
                  </td>
                  <td className="py-4 pr-4 text-foreground-muted">
                    {customer._count.salesIntakes === 0 ? (
                      <span className="text-foreground-subtle">0</span>
                    ) : (
                      <span className="font-medium tabular-nums text-foreground">
                        {customer._count.salesIntakes}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-foreground-subtle">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {customers.length === 0 && (
          <div className="border-t border-border pt-6">
            <EmptyState
              icon={UserCircle}
              title="No customer rows yet"
              description="Create a customer to anchor identity and contact; link intake from each sales intake’s detail page when you are ready—no sample rows."
            >
              <Link href="/customers/new" className={handoffPrimaryLinkClass}>
                New customer
              </Link>
            </EmptyState>
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

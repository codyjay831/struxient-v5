import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { UserCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { workstationReturnHref } from "@/lib/workstation-return-href";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; section?: string }>;
}) {
  const sq = await (searchParams ?? Promise.resolve({} as { from?: string; section?: string }));
  const fromWorkstation = sq.from === "workstation";
  const returnSection = typeof sq.section === "string" ? sq.section : "investigate";
  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb items={[{ label: "Relationships" }, { label: "Customers" }]} />
        <PageHeader
          title="Customers"
          description="People and companies you work with."
        />
        <AccessDeniedPanel description="This role cannot access customer and sales records." />
      </div>
    );
  }
  const [customers, totalLeads, unlinkedLeads, openPipelineLeads] = await Promise.all([
    db.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    }),
    db.lead.count({ where: { organizationId: ctx.organizationId } }),
    db.lead.count({ where: { organizationId: ctx.organizationId, customerId: null } }),
    db.lead.count({
      where: {
        organizationId: ctx.organizationId,
        status: { in: [...LEAD_PIPELINE_OPEN_STATUSES] },
      },
    }),
  ]);

  const customersWithLinkedLead = customers.filter((c) => c._count.leads > 0).length;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Relationships" }, { label: "Customers" }]}
      />
      <PageHeader
        title="Customers"
        description="People and companies you work with — contact info, linked opportunities, and job history in one place."
        actions={
          <>
            {fromWorkstation ? (
              <ButtonLink href={workstationReturnHref(returnSection)} variant="muted" size="sm">
                ← Workstation
              </ButtonLink>
            ) : null}
            <ButtonLink href="/customers/new" variant="primary" size="sm">
              New customer
            </ButtonLink>
            <PlaceholderButton>Merge records</PlaceholderButton>
          </>
        }
      />

      <section className="mb-10">
        <SectionHeading
          title="At a glance"
          description="Live counts for your organization."
        />
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <SignalCard label="Customers" value={String(customers.length)} hint="Total customer records" />
          </li>
          <li>
            <SignalCard label="All opportunities" value={String(totalLeads)} hint="Records in the sales pipeline" />
          </li>
          <li>
            <SignalCard
              label="Open opportunities"
              value={String(openPipelineLeads)}
              hint="Still being worked"
            />
          </li>
          <li>
            <SignalCard
              label="Unlinked opportunities"
              value={String(unlinkedLeads)}
              hint="Not tied to a customer yet"
            />
          </li>
        </ul>
        <p className="text-sm text-foreground-muted">
          Customers with linked opportunities:{" "}
          <span className="font-medium text-foreground">{customersWithLinkedLead}</span>
        </p>
      </section>

      <SectionHeading
        title="All customers"
        description="Click a row to open details, contact info, and linked opportunities."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-foreground-subtle">
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Contact</th>
                <th className="pb-3 pr-4 font-medium">Linked opportunities</th>
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
                      <div className="font-medium text-foreground transition-colors group-hover:text-accent group-hover:underline">
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
                    {customer._count.leads === 0 ? (
                      <span className="text-foreground-subtle">0</span>
                    ) : (
                      <span className="font-medium tabular-nums text-foreground">
                        {customer._count.leads}
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
              title="No customers yet"
              description="Add your first customer to keep contact info and opportunity history in one place."
            >
              <ButtonLink href="/customers/new" variant="primary" size="sm">
                New customer
              </ButtonLink>
            </EmptyState>
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

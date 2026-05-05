import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { UserCircle } from "lucide-react";
import { db, getDevOrganizationOrThrow } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const org = await getDevOrganizationOrThrow();
  const customers = await db.customer.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[{ label: "Relationships" }, { label: "Customers" }]}
      />
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="The first relationship record surface in Struxient—billing parties, job history, and tags you keep across quotes and work. It is not a sales-only list; Sales stays in Leads and Quotes."
        actions={
          <>
            <PlaceholderButton title="Create flow is not wired in this build">
              New customer (soon)
            </PlaceholderButton>
            <PlaceholderButton>Merge records (soon)</PlaceholderButton>
          </>
        }
      />

      <HandoffPanel
        title="Relationship context"
        description="Customer records will tie together Sales history (leads and quotes), approved Work (jobs), contacts, and later repeat-business signals—still one route today; no extra relationship types or mock parties."
      >
        <Link href="/leads" className={handoffMutedLinkClass}>
          Sales: Leads
        </Link>
        <Link href="/quotes" className={handoffMutedLinkClass}>
          Sales: Quotes
        </Link>
        <Link href="/payments" className={handoffMutedLinkClass}>
          Finance: Payments
        </Link>
      </HandoffPanel>

      <section className="mb-10">
        <SectionHeading
          title="System signals (preview)"
          description="Org-wide rollups—empty placeholders, not live metrics."
        />
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
      </section>

      <WorkspacePanel padding="compact" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Persistence Foundation Active
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This route reads from <span className="font-medium text-foreground">PostgreSQL</span> via{" "}
          <span className="font-medium text-foreground">Prisma</span>. Until auth exists, rows are
          scoped with <span className="font-medium text-foreground">getDevOrganizationOrThrow()</span>{" "}
          (development tenant only — not production org resolution).
        </p>
      </WorkspacePanel>

      <SectionHeading
        title="Customer records"
        description="Each row will open `/customers/{id}` with relationship context across Sales and Work."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Contact</th>
                <th className="pb-3 pr-4 font-medium">Signals</th>
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
                  <td className="py-4 pr-4 text-foreground-subtle">—</td>
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
              description="Tags (VIP, GC, service plan) and system signals (credit hold, warranty) will render in the middle columns. Activity and job references will populate the history column from events—no sample rows are shown."
            >
              <PlaceholderButton>Open row detail (needs data)</PlaceholderButton>
            </EmptyState>
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

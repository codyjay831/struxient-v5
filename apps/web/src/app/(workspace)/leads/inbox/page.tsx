import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { readContact, readRequest, readSignals } from "@/lib/lead/lead-projection";
import { LeadInboxClient, type InboxLeadRow } from "./lead-inbox-client";
import { LeadStatus } from "@prisma/client";
import Link from "next/link";
import { Globe } from "lucide-react";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";

export default async function LeadInboxPage() {
  const ctx = await getRequestContextOrThrow();

  const [openLeads, recentLeads] = await Promise.all([
    db.lead.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: [LeadStatus.NEW, LeadStatus.TRIAGING] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, displayName: true } },
        quotes: {
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
        },
      },
    }),
    db.lead.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: [LeadStatus.CONVERTED, LeadStatus.ARCHIVED] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        customer: { select: { id: true, displayName: true } },
        quotes: {
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
        },
      },
    }),
  ]);

  const serializeInbox = (l: (typeof openLeads)[0]): InboxLeadRow => ({
    id: l.id,
    channel: l.channel,
    status: l.status,
    createdAt: l.createdAt,
    contact: readContact(l.contact),
    request: readRequest(l.request),
    signals: readSignals(l.signals),
  });

  const initialOpenLeads = openLeads.map(serializeInbox);
  const initialRecentLeads = recentLeads.map(serializeInbox);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-4">
        <WorkspaceBreadcrumb items={[{ label: "Inbox" }]} />
      </div>
      <div className="p-6 border-b border-border bg-surface flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Lead Inbox
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            Triage and respond to new leads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/leads/public-request-settings"
            className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
          >
            <Globe className="size-3.5 mr-1.5" />
            Public Link
          </Link>
          <Link
            href="/leads"
            className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
          >
            All leads →
          </Link>
        </div>
      </div>
      <LeadInboxClient
        initialOpenLeads={initialOpenLeads}
        initialRecentLeads={initialRecentLeads}
      />
    </div>
  );
}

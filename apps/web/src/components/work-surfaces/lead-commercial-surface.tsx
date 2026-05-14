"use client";

import { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import { formatLeadChannel, formatLeadStatus, leadStatusBadgeTone } from "@/lib/lead-display";
import { QuoteStatus } from "@prisma/client";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { resolveLeadCommercialProgressActionHref } from "@/lib/lead-commercial-progress";
import { StatusBadge, StatusBadgeTone } from "@/components/ui/status-badge";
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  ArrowRight, 
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import Link from "next/link";

import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useEffect } from "react";

export interface LeadCommercialSurfaceProps {
  payload: LeadCommercialSurfacePayload;
  entryPoint?: "workstation" | "record";
}

/**
 * Shared work surface for lead commercial actions.
 * 
 * No mode/variant props. Adapts to container width.
 */
export function LeadCommercialSurface({ payload, entryPoint = "record" }: LeadCommercialSurfaceProps) {
  const { lead, customer, linkedQuotes, progress } = payload;

  useEffect(() => {
    workstationTelemetry.trackSurfaceOpen("lead", lead.id, entryPoint);
  }, [lead.id, entryPoint]);

  return (
    <div className="@container h-full">
      <div className="flex flex-col gap-6 p-6 @lg:flex-row">
        {/* Left Column: Job Party & Request */}
        <div className="flex-1 space-y-8">
          {/* Job Party Block */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                Job Party
              </h3>
              <StatusBadge 
                label={formatLeadStatus(lead.status as any)} 
                tone={leadStatusBadgeTone(lead.status as any) as StatusBadgeTone} 
              />
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-foreground/5 p-2">
                  <User className="size-4 text-foreground-subtle" />
                </div>
                <div>
                  <h4 className="text-lg font-bold">{lead.contactName}</h4>
                  {lead.title !== lead.contactName && (
                    <p className="text-sm text-foreground-muted">{lead.title}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-foreground-subtle" />
                  <span className="truncate">{lead.email || "No email"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 text-foreground-subtle" />
                  <span>{lead.phone || "No phone"}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 border-t border-border pt-4 text-sm">
                <MapPin className="size-4 shrink-0 mt-0.5 text-foreground-subtle" />
                <div>
                  <p className="font-medium">{lead.jobsiteAddressLine || "No address provided"}</p>
                  {lead.isAddressVerified && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                      Verified
                    </span>
                  )}
                </div>
              </div>

              {customer && (
                <div className="flex items-center gap-2 rounded-lg bg-foreground/[0.02] p-2 text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                  <CheckCircle2 className="size-3 text-success" />
                  Linked to customer: {customer.displayName}
                  <Link href={customer.href} className="ml-auto flex items-center gap-1 hover:text-foreground">
                    View <ExternalLink className="size-2.5" />
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* Request Snapshot */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Request Snapshot
            </h3>
            <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-foreground-subtle" />
                Source: {formatLeadChannel(lead.channel as any)}
              </div>
              {lead.notes && (
                <div className="rounded-lg bg-foreground/[0.02] p-3 text-sm italic text-foreground-muted">
                  &ldquo;{lead.notes}&rdquo;
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Next Actions & Quotes */}
        <div className="w-full space-y-8 @lg:w-80 shrink-0">
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Next Action
            </h3>
            <div className="space-y-2">
              {progress.primaryAction ? (
                <Link 
                  href={resolveLeadCommercialProgressActionHref(progress.primaryAction, { leadId: lead.id })}
                  className="flex w-full items-center justify-between rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 group"
                >
                  {progress.primaryAction.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <p className="text-sm text-foreground-muted italic">No immediate action required.</p>
              )}
              
              {!customer && (
                <Link 
                  href={`/leads/${lead.id}#customer-link`}
                  className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-foreground/[0.02]"
                >
                  Link to Customer
                </Link>
              )}
            </div>
          </section>

          {linkedQuotes.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                Quotes ({linkedQuotes.length})
              </h3>
              <div className="space-y-2">
                {linkedQuotes.map((quote) => (
                  <div key={quote.id} className="rounded-xl border border-border bg-surface p-3 hover:border-border-strong transition-colors shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold truncate pr-2">{quote.title}</span>
                      <StatusBadge 
                        label={formatQuoteStatus(quote.status as any)} 
                        tone={quoteStatusBadgeTone(quote.status as any) as StatusBadgeTone}
                        className="text-[10px] px-1.5 py-0"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-foreground-muted">
                      <span>{quote._count.lineItems} items</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quote.totalCents / 100)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

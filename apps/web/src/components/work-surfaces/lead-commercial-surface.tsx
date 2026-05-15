"use client";

import { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import { formatLeadChannel, formatLeadStatus, leadStatusBadgeTone, parseIntakeNotes } from "@/lib/lead-display";
import { LeadStatus, QuoteStatus } from "@prisma/client";
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
  CircleAlert,
  Search,
  ExternalLink,
  Archive,
  Pencil,
  X,
  ChevronRight,
  Loader2,
  ChevronDown
} from "lucide-react";
import Link from "next/link";

import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveLeadInboxAction, linkLeadToCustomerWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import { useRouter, usePathname } from "next/navigation";
import { LeadCustomerAttachCard } from "@/components/leads/lead-customer-attach-card";

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
  const { lead, customer, linkedQuotes, progress, matchHints } = payload;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showRawNotes, setShowRawNotes] = useState(false);
  const customerSectionRef = useRef<HTMLDivElement>(null);

  const { isPublicIntake, parsedFields, cleanNotes } = parseIntakeNotes(lead.notes);

  useEffect(() => {
    workstationTelemetry.trackSurfaceOpen("lead", lead.id, entryPoint);
  }, [lead.id, entryPoint]);

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#customer-link") {
        customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        customerSectionRef.current?.focus();
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this opportunity?")) return;
    
    startTransition(async () => {
      const result = await archiveLeadInboxAction(lead.id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  const matches = matchHints?.kind === "checked" ? matchHints.matches : [];

  return (
    <div className="@container h-full">
      <div className="flex flex-col gap-6 p-6 @lg:flex-row">
        {/* Left Column: Job Party & Request */}
        <div className="flex-1 space-y-8">
          {/* Job Party Block */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                  Job Party
                </h3>
                <Link 
                  href={`/leads/${lead.id}/edit`}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
                >
                  <Pencil className="size-2.5" /> Edit
                </Link>
              </div>
              <StatusBadge 
                label={formatLeadStatus(lead.status as LeadStatus)} 
                tone={leadStatusBadgeTone(lead.status as LeadStatus) as StatusBadgeTone} 
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

          {!customer && (
            <section 
              id="customer-link" 
              ref={customerSectionRef}
              tabIndex={-1}
              className="space-y-4 scroll-mt-24 outline-none"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                  Customer
                </h3>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-foreground-muted leading-relaxed">
                  {progress.description}
                </p>

                {progress.state === "CONFLICT_WITH_EXISTING_CUSTOMER" && (
                  <div className="rounded-xl border border-warning/30 bg-warning/[0.03] p-4 flex gap-3">
                    <CircleAlert className="size-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {progress.label}
                      </p>
                      <p className="text-xs text-foreground-muted mt-1">
                        One or more existing customers match this lead&apos;s contact info. Link to an existing record to avoid duplicates.
                      </p>
                    </div>
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                      Suggested Matches ({matches.length})
                    </p>
                    <div className="grid gap-2">
                      {matches.map((candidate) => (
                        <button
                          key={candidate.id}
                          onClick={async () => {
                            startTransition(async () => {
                              const formData = new FormData();
                              formData.append("customerId", candidate.id);
                              const result = await linkLeadToCustomerWorkspaceAction(lead.id, {}, formData);
                              if (result.success) {
                                router.refresh();
                              } else {
                                alert(result.error);
                              }
                            });
                          }}
                          disabled={isPending}
                          className="w-full text-left p-3 rounded-xl border border-border bg-surface hover:border-accent/40 hover:bg-accent/[0.01] transition-all group disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-bold text-foreground group-hover:text-accent transition-colors">
                              {candidate.displayName}
                            </h4>
                            {isPending ? (
                              <Loader2 className="size-3.5 animate-spin text-accent" />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                                  Match: {candidate.matchOn}
                                </span>
                                <ChevronRight className="size-3.5 text-foreground-subtle" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {candidate.email && (
                              <p className="text-xs text-foreground-muted flex items-center gap-1">
                                <Mail className="size-3" /> {candidate.email}
                              </p>
                            )}
                            {candidate.phone && (
                              <p className="text-xs text-foreground-muted flex items-center gap-1">
                                <Phone className="size-3" /> {candidate.phone}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <div className="mb-3 flex items-center gap-2">
                    <Search className="size-3.5 text-foreground-subtle" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                      Find or create customer
                    </p>
                  </div>
                  <LeadCustomerAttachCard
                    lead={{
                      id: lead.id,
                      title: lead.title,
                      contactName: lead.contactName,
                      companyName: lead.companyName,
                      email: lead.email,
                      phone: lead.phone,
                      notes: lead.notes,
                      source: lead.channel,
                      jobsiteAddressLine: lead.jobsiteAddressLine,
                    }}
                    editLeadHref={`/leads/${lead.id}/edit`}
                    onSuccess={() => router.refresh()}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Request Snapshot */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
              Request Snapshot
            </h3>
            <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-foreground-subtle" />
                Source: {formatLeadChannel(lead.channel)}
              </div>

              {isPublicIntake ? (
                <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  {parsedFields.map((field) => (
                    <div key={field.label} className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                        {field.label}
                      </p>
                      <p className="text-sm font-medium leading-tight text-foreground">
                        {field.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : lead.notes && (
                <div className="rounded-lg bg-foreground/[0.02] p-3 text-sm italic text-foreground-muted">
                  &ldquo;{lead.notes}&rdquo;
                </div>
              )}

              {isPublicIntake && (
                <div className="border-t border-border pt-2">
                  <button
                    onClick={() => setShowRawNotes(!showRawNotes)}
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground transition-colors"
                  >
                    <ChevronDown className={`size-3 transition-transform ${showRawNotes ? "rotate-180" : ""}`} />
                    {showRawNotes ? "Hide raw intake" : "View raw intake"}
                  </button>
                  {showRawNotes && (
                    <div className="mt-3 rounded-lg bg-foreground/[0.02] p-3 text-xs italic text-foreground-muted leading-relaxed">
                      &ldquo;{cleanNotes}&rdquo;
                    </div>
                  )}
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
                  title={
                    progress.state === "CONFLICT_WITH_EXISTING_CUSTOMER"
                      ? "Resolve the matching customer conflict before starting a quote."
                      : progress.primaryAction.label
                  }
                  className="flex w-full items-center justify-between rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 group"
                >
                  {progress.primaryAction.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <p className="text-sm text-foreground-muted italic">No immediate action required.</p>
              )}
              
              {!customer && (
                <div className="flex flex-col gap-2">
                  <Link 
                    href={`/leads/${lead.id}#customer-link`}
                    title="Link this opportunity to an existing customer record or create a new one."
                    onClick={(e) => {
                      if (pathname === `/leads/${lead.id}`) {
                        e.preventDefault();
                        customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        customerSectionRef.current?.focus();
                      }
                    }}
                    className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-bold transition-colors hover:bg-foreground/[0.02]"
                  >
                    Link to Customer
                  </Link>
                </div>
              )}

              <button
                onClick={handleArchive}
                disabled={isPending}
                title="Archive this opportunity to remove it from the active pipeline."
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Archive Opportunity
              </button>
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
                        label={formatQuoteStatus(quote.status as QuoteStatus)} 
                        tone={quoteStatusBadgeTone(quote.status as QuoteStatus) as StatusBadgeTone}
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

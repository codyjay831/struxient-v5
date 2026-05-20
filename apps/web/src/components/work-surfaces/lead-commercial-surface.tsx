"use client";

import { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import {
  formatAttachmentFileSize,
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { LeadStatus, QuoteStatus } from "@prisma/client";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { StatusBadge, StatusBadgeTone } from "@/components/ui/status-badge";
import {
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  CheckCircle2,
  CircleAlert,
  Search,
  ExternalLink,
  Archive,
  Pencil,
  ChevronRight,
  Loader2,
  ChevronDown,
  Clock,
  Paperclip,
  History,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { workstationTelemetry } from "@/lib/workstation/telemetry";
import { useEffect, useRef, useState, useTransition } from "react";
import { archiveLeadInboxAction, linkLeadToCustomerWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import { useRouter } from "next/navigation";
import { LeadCustomerAttachCard } from "@/components/leads/lead-customer-attach-card";
import { LeadCommercialProgressPanel } from "@/components/leads/lead-commercial-progress-panel";

export interface LeadCommercialSurfaceProps {
  payload: LeadCommercialSurfacePayload;
  entryPoint?: "workstation" | "record";
  /** When set, called after in-place mutations (e.g. customer attach) instead of only `router.refresh()`. */
  onMutationSuccess?: () => void;
}

const sectionTitleClass =
  "text-xs font-bold uppercase tracking-widest text-foreground-subtle";

export function LeadCommercialSurface({
  payload,
  entryPoint = "record",
  onMutationSuccess,
}: LeadCommercialSurfaceProps) {
  const { lead, customer, linkedQuotes, progress, matchHints, reviewViewModel } = payload;
  const router = useRouter();
  const notifyMutationSuccess = onMutationSuccess ?? (() => router.refresh());
  const [isPending, startTransition] = useTransition();
  const [showLegacyNotes, setShowLegacyNotes] = useState(false);
  const customerSectionRef = useRef<HTMLDivElement>(null);

  const compact = entryPoint === "workstation";
  const editHref = `/leads/${lead.id}/edit`;
  const callablePhone = lead.phone.trim();
  const emailableAddress = lead.email.trim();

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
        notifyMutationSuccess();
      } else {
        alert(result.error);
      }
    });
  };

  const matches = matchHints?.kind === "checked" ? matchHints.matches : [];

  return (
    <div className="@container h-full">
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {/* Decision header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                Lead review
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-foreground truncate">
                {lead.title}
              </h2>
              <p className="text-sm text-foreground-muted">
                {formatLeadChannel(lead.channel)} · Received{" "}
                {lead.createdAt.toLocaleDateString()}
              </p>
              {callablePhone || emailableAddress ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {callablePhone ? (
                    <a
                      href={`tel:${callablePhone}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                    >
                      <Phone className="size-3" />
                      Call
                    </a>
                  ) : null}
                  {emailableAddress ? (
                    <a
                      href={`mailto:${emailableAddress}`}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                    >
                      <Mail className="size-3" />
                      Email
                    </a>
                  ) : null}
                  <Link
                    href={editHref}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                    Request more info
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                Pipeline tag
              </span>
              <StatusBadge
                label={formatLeadStatus(lead.status as LeadStatus)}
                tone={leadStatusBadgeTone(lead.status as LeadStatus) as StatusBadgeTone}
              />
            </div>
          </div>

          <LeadCommercialProgressPanel progress={progress} leadId={lead.id} compact={compact} />
        </header>

        <div className="flex flex-col gap-8 @lg:flex-row">
          <div className="flex-1 min-w-0 space-y-8">
            {/* Request summary */}
            <section className="space-y-3" aria-labelledby="lead-review-request">
              <h3 id="lead-review-request" className={sectionTitleClass}>
                What they need
              </h3>
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                {reviewViewModel.requestFields.length > 0 ? (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {reviewViewModel.requestFields.map((field) => (
                      <div key={field.label} className="space-y-1">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                          {field.label}
                        </dt>
                        <dd className="text-sm font-medium leading-snug text-foreground">
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-foreground-muted">No request details captured yet.</p>
                )}

                {reviewViewModel.scopeText &&
                !reviewViewModel.requestFields.some((f) => f.label === "What they need") ? (
                  <p className="text-sm leading-relaxed text-foreground border-t border-border pt-3">
                    {reviewViewModel.scopeText}
                  </p>
                ) : null}

                {reviewViewModel.visits.length > 0 ? (
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle flex items-center gap-1">
                      <Clock className="size-3" /> Site visit
                    </p>
                    {reviewViewModel.visits.map((v) => (
                      <div key={v.id} className="text-sm text-foreground-muted">
                        <span className="font-medium text-foreground">{v.summary}</span>
                        {v.notes ? (
                          <span className="block text-xs mt-0.5">{v.notes}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {reviewViewModel.showLegacyNotes ? (
                  <div className="border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => setShowLegacyNotes(!showLegacyNotes)}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground transition-colors"
                    >
                      <ChevronDown
                        className={`size-3 transition-transform ${showLegacyNotes ? "rotate-180" : ""}`}
                      />
                      {showLegacyNotes ? "Hide raw intake" : "View raw intake"}
                    </button>
                    {showLegacyNotes && reviewViewModel.legacyNotesPreview ? (
                      <p className="mt-2 text-xs text-foreground-muted leading-relaxed italic">
                        {reviewViewModel.legacyNotesPreview}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {/* Missing info */}
            <section className="space-y-3" aria-labelledby="lead-review-missing">
              <div className="flex items-center justify-between gap-2">
                <h3 id="lead-review-missing" className={sectionTitleClass}>
                  Ready for quote
                </h3>
                <Link
                  href={editHref}
                  className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
                >
                  Edit details
                </Link>
              </div>
              <ul className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-2">
                {reviewViewModel.requirements.map((req) => (
                  <li key={req.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      {req.satisfied ? (
                        <CheckCircle2 className="size-4 text-success shrink-0" aria-hidden />
                      ) : (
                        <XCircle className="size-4 text-danger shrink-0" aria-hidden />
                      )}
                      <span className={req.satisfied ? "text-foreground-muted" : "font-medium text-foreground"}>
                        {req.label}
                      </span>
                    </span>
                    {!req.satisfied ? (
                      <Link
                        href={req.fixHref}
                        className="text-xs font-medium text-accent hover:underline shrink-0"
                      >
                        Add
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
              {reviewViewModel.allRequirementsMet ? (
                <p className="text-xs text-success font-medium">
                  All requirements met — you can start a quote when ready.
                </p>
              ) : (
                <p className="text-xs text-foreground-muted">
                  Complete missing items before starting a quote.
                </p>
              )}
            </section>

            {/* Contact + location */}
            <section className="space-y-3" aria-labelledby="lead-review-contact">
              <div className="flex items-center justify-between">
                <h3 id="lead-review-contact" className={sectionTitleClass}>
                  Who &amp; where
                </h3>
                <Link
                  href={editHref}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
                >
                  <Pencil className="size-2.5" /> Edit
                </Link>
              </div>

              <div className="rounded-xl border border-border bg-surface p-4 space-y-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-foreground/5 p-2">
                    <User className="size-4 text-foreground-subtle" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold">{lead.contactName || "Unknown contact"}</h4>
                    {lead.companyName ? (
                      <p className="text-sm text-foreground-muted">{lead.companyName}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-4 text-foreground-subtle shrink-0" />
                    <span className="truncate">{lead.email || "No email"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="size-4 text-foreground-subtle shrink-0" />
                    <span>{lead.phone || "No phone"}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 border-t border-border pt-4 text-sm">
                  <MapPin className="size-4 shrink-0 mt-0.5 text-foreground-subtle" />
                  <div>
                    <p className="font-medium">{lead.jobsiteAddressLine || "No address provided"}</p>
                    {lead.isAddressVerified ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                        Verified
                      </span>
                    ) : null}
                  </div>
                </div>

                {customer ? (
                  <div className="flex items-center gap-2 rounded-lg bg-foreground/[0.02] p-2 text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                    <CheckCircle2 className="size-3 text-success" />
                    Linked: {customer.displayName}
                    <Link
                      href={customer.href}
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                    >
                      View <ExternalLink className="size-2.5" />
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>

            {!customer && (
              <section
                id="customer-link"
                ref={customerSectionRef}
                tabIndex={-1}
                className="space-y-4 scroll-mt-24 outline-none"
              >
                <h3 className={sectionTitleClass}>Customer</h3>

                {progress.state === "CONFLICT_WITH_EXISTING_CUSTOMER" && (
                  <div className="rounded-xl border border-warning/30 bg-warning/[0.03] p-4 flex gap-3">
                    <CircleAlert className="size-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-foreground">{progress.label}</p>
                      <p className="text-xs text-foreground-muted mt-1">
                        Link to an existing customer before starting a quote to avoid duplicates.
                      </p>
                    </div>
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                      Suggested matches ({matches.length})
                    </p>
                    <div className="grid gap-2">
                      {matches.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={async () => {
                            startTransition(async () => {
                              const formData = new FormData();
                              formData.append("customerId", candidate.id);
                              const result = await linkLeadToCustomerWorkspaceAction(
                                lead.id,
                                {},
                                formData,
                              );
                              if (result.success) {
                                notifyMutationSuccess();
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
                              <ChevronRight className="size-3.5 text-foreground-subtle" />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-muted">
                            {candidate.email ? <span>{candidate.email}</span> : null}
                            {candidate.phone ? <span>{candidate.phone}</span> : null}
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
                    editLeadHref={editHref}
                    onSuccess={notifyMutationSuccess}
                  />
                </div>
              </section>
            )}

            {/* Files */}
            <section className="space-y-3" aria-labelledby="lead-review-files">
              <h3 id="lead-review-files" className={sectionTitleClass}>
                Photos &amp; files
              </h3>
              {reviewViewModel.attachments.length > 0 ? (
                <ul className="rounded-xl border border-border bg-surface divide-y divide-border shadow-sm">
                  {reviewViewModel.attachments.map((att) => (
                    <li key={att.id}>
                      <a
                        href={att.downloadHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-foreground/[0.02] transition-colors"
                      >
                        <Paperclip className="size-4 text-foreground-subtle shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {att.fileName}
                        </span>
                        <span className="text-xs text-foreground-muted shrink-0">
                          {formatAttachmentFileSize(att.fileSize)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground-muted rounded-xl border border-dashed border-border px-4 py-6 text-center">
                  No files attached to this request.
                </p>
              )}
            </section>

            {/* Activity */}
            <section className="space-y-3" aria-labelledby="lead-review-activity">
              <h3 id="lead-review-activity" className={sectionTitleClass}>
                Activity
              </h3>
              {reviewViewModel.activity.length > 0 ? (
                <ol className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                  {reviewViewModel.activity.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <History className="size-4 text-foreground-subtle shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        {item.detail ? (
                          <p className="text-xs text-foreground-muted mt-0.5">{item.detail}</p>
                        ) : null}
                        <p className="text-[10px] text-foreground-subtle mt-1">
                          {item.createdAt.toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-foreground-muted">No activity recorded yet.</p>
              )}
            </section>
          </div>

          {/* Sidebar: quotes + archive only */}
          <aside className="w-full space-y-6 @lg:w-72 shrink-0">
            {linkedQuotes.length > 0 ? (
              <section className="space-y-3">
                <h3 className={sectionTitleClass}>Quotes ({linkedQuotes.length})</h3>
                <div className="space-y-2">
                  {linkedQuotes.map((quote) => (
                    <Link
                      key={quote.id}
                      href={`/quotes/${quote.id}`}
                      className="block rounded-xl border border-border bg-surface p-3 hover:border-border-strong transition-colors shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-xs font-bold truncate text-foreground">
                          {quote.title}
                        </span>
                        <StatusBadge
                          label={formatQuoteStatus(quote.status as QuoteStatus)}
                          tone={quoteStatusBadgeTone(quote.status as QuoteStatus) as StatusBadgeTone}
                          className="text-[10px] px-1.5 py-0 shrink-0"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-foreground-muted">
                        <span>{quote._count.lineItems} items</span>
                        <span className="font-mono">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(quote.totalCents / 100)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <button
              type="button"
              onClick={handleArchive}
              disabled={isPending}
              title="Archive this opportunity"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Archive className="size-4" />
              )}
              Archive
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition, type RefObject } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, ExternalLink, Loader2, Search } from "lucide-react";
import {
  customerMatchReasonLabels,
  type CustomerMatchHint,
} from "@/lib/lead-customer-match-hints";
import { formatPhoneForDisplay } from "@/lib/format-phone-display";
import { linkLeadToCustomerWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import {
  useLeadCustomerCreateForm,
  type LeadWorkspaceCustomerCreateLeadInput,
} from "@/components/leads/lead-customer-create-shared";
import { LeadCustomerSearchDialog } from "@/components/leads/lead-customer-search-dialog";

const primaryBtnClass =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-accent py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50";

const sectionTitleClass =
  "text-xs font-bold uppercase tracking-widest text-foreground-subtle";

function ExistingCustomerCard({
  match,
}: {
  match: CustomerMatchHint;
}) {
  const phoneDisplay = match.phone ? formatPhoneForDisplay(match.phone) || match.phone : null;

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/[0.04] p-3">
      <p className={`${sectionTitleClass} mb-1.5`}>Suggested customer</p>
      <h3 className="mt-1.5 text-sm font-semibold text-foreground">{match.displayName}</h3>
      <div className="mt-2 space-y-0.5 text-sm text-foreground-muted">
        {match.email ? <p className="truncate">{match.email}</p> : null}
        {phoneDisplay ? <p>{phoneDisplay}</p> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {customerMatchReasonLabels(match.matchOn).map((reason) => (
          <span
            key={reason}
            className="rounded-full border border-warning/30 bg-warning/[0.08] px-2 py-0.5 text-[10px] font-medium text-warning"
          >
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LeadCustomerActionPanel({
  lead,
  linkedCustomer,
  hasBlockingCustomerMatch,
  suggestedMatches,
  onSuccess,
  onError,
  panelRef,
  compact = false,
}: {
  lead: LeadWorkspaceCustomerCreateLeadInput;
  linkedCustomer?: { displayName: string; href: string } | null;
  hasBlockingCustomerMatch: boolean;
  suggestedMatches: CustomerMatchHint[];
  onSuccess: () => void;
  onError: (message: string) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** Workstation drawer — stack actions vertically. */
  compact?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { prepared, state, dispatch, isPending: isCreating } = useLeadCustomerCreateForm(
    lead,
    onSuccess,
  );

  const hasMatch = !linkedCustomer && (hasBlockingCustomerMatch || suggestedMatches.length > 0);
  const topMatch = suggestedMatches[0] ?? null;
  const otherMatches = suggestedMatches.slice(1, 3);

  const handleLinkSuggested = (candidateId: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("customerId", candidateId);
      const result = await linkLeadToCustomerWorkspaceAction(lead.id, {}, formData);
      if (result.success) {
        onSuccess();
      } else {
        onError(result.error ?? "Could not link this request to a customer.");
      }
    });
  };

  return (
    <>
      <section className="space-y-3" aria-labelledby="lead-review-customer">
        <h3 id="lead-review-customer" className={sectionTitleClass}>
          Customer
        </h3>
        <div
          id="customer-link"
          ref={panelRef}
          tabIndex={-1}
          className="scroll-mt-24 outline-none rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          {linkedCustomer ? (
            <div className="flex flex-wrap items-center gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Linked to {linkedCustomer.displayName}
                </p>
                <p className="mt-0.5 text-sm text-foreground-muted">
                  This request is attached to an existing customer record.
                </p>
              </div>
              <Link
                href={linkedCustomer.href}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                View customer
                <ExternalLink className="size-3" />
              </Link>
            </div>
          ) : hasMatch ? (
            <>
              <p className="text-sm text-foreground-muted">
                This lead matches an existing customer. Link before quoting to avoid duplicates.
              </p>

              {topMatch ? (
                <div className="mt-3">
                  <ExistingCustomerCard match={topMatch} />
                </div>
              ) : null}

              {otherMatches.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <p className={`${sectionTitleClass} mb-1.5`}>Other matches</p>
                  {otherMatches.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => handleLinkSuggested(candidate.id)}
                      disabled={isPending}
                      className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:border-border-strong disabled:opacity-50"
                    >
                      <span className="font-medium text-foreground">{candidate.displayName}</span>
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin text-accent" />
                      ) : (
                        <ChevronRight className="size-3.5 text-foreground-subtle" />
                      )}
                    </button>
                  ))}
                </div>
              ) : null}

              {state.error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {state.error}
                </p>
              ) : null}

              <div className={`mt-4 flex flex-col gap-2 ${compact ? "" : "sm:flex-row sm:flex-wrap"}`}>
                {topMatch ? (
                  <button
                    type="button"
                    onClick={() => handleLinkSuggested(topMatch.id)}
                    disabled={isPending || isCreating}
                    className={`${primaryBtnClass} ${compact ? "" : "sm:flex-1 sm:min-w-[200px]"}`}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Linking…
                      </>
                    ) : (
                      <>Link to {topMatch.displayName}</>
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  disabled={isPending || isCreating}
                  className={`${secondaryBtnClass} ${compact ? "" : "sm:max-w-[220px]"}`}
                >
                  <Search className="size-4" />
                  Search another
                </button>
                <form action={dispatch} className={compact ? "" : "sm:ml-auto"}>
                  <button
                    type="submit"
                    disabled={isCreating || isPending || !prepared.ok}
                    aria-busy={isCreating}
                    className="w-full py-2 text-xs font-medium text-foreground-subtle underline-offset-2 hover:text-foreground-muted hover:underline disabled:opacity-50"
                  >
                    {isCreating ? "Creating…" : "Create as new customer instead"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground-muted">
                Create a customer from this request, or link to an existing one.
              </p>

              {state.error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {state.error}
                </p>
              ) : null}

              <div className={`mt-4 flex flex-col gap-2 ${compact ? "" : "sm:flex-row"}`}>
                <form action={dispatch} className="flex-1 min-w-0">
                  <button
                    type="submit"
                    disabled={isCreating || isPending || !prepared.ok}
                    aria-busy={isCreating}
                    className={primaryBtnClass}
                  >
                    {isCreating ? "Creating…" : "Confirm and create customer"}
                    {!isCreating && <ArrowRight className="size-4 opacity-70" />}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  disabled={isPending || isCreating}
                  className={`${secondaryBtnClass} ${compact ? "" : "sm:max-w-[220px]"}`}
                >
                  <Search className="size-4" />
                  Link existing
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <LeadCustomerSearchDialog
        leadId={lead.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}

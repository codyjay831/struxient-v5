"use client";

import { useState, useTransition, type RefObject } from "react";
import { ArrowRight, ChevronRight, CircleAlert, Loader2, Search, UserRound } from "lucide-react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CustomerMatchHint } from "@/lib/lead-customer-match-hints";
import { linkLeadToCustomerWorkspaceAction } from "@/app/(workspace)/leads/lead-workspace-actions";
import {
  LeadCustomerPreviewBlock,
  useLeadCustomerCreateForm,
  type LeadWorkspaceCustomerCreateLeadInput,
} from "@/components/leads/lead-customer-create-shared";
import { LeadCustomerSearchDialog } from "@/components/leads/lead-customer-search-dialog";

const primaryBtnClass =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-accent py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryBtnClass =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface py-2.5 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50";

export function LeadCustomerActionPanel({
  lead,
  editLeadHref,
  hasBlockingCustomerMatch,
  suggestedMatches,
  onSuccess,
  onError,
  panelRef,
}: {
  lead: LeadWorkspaceCustomerCreateLeadInput;
  editLeadHref: string;
  hasBlockingCustomerMatch: boolean;
  suggestedMatches: CustomerMatchHint[];
  onSuccess: () => void;
  onError: (message: string) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { prepared, state, dispatch, isPending: isCreating } = useLeadCustomerCreateForm(
    lead,
    onSuccess,
  );

  const hasConflict = hasBlockingCustomerMatch;
  const statusLabel = hasConflict || suggestedMatches.length > 0 ? "Match found" : "Needs review";
  const statusTone = hasConflict ? "warning" : suggestedMatches.length > 0 ? "draft" : "neutral";

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
      <div
        id="customer-link"
        ref={panelRef}
        tabIndex={-1}
        className="scroll-mt-24 outline-none"
      >
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <div className="flex flex-wrap items-center gap-2">
          <UserRound className="size-4 text-foreground-subtle" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Customer
          </h2>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </div>

        {hasConflict ? (
          <div className="mt-3 flex gap-3 rounded-lg border border-warning/30 bg-warning/[0.03] p-3">
            <CircleAlert className="size-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-foreground-muted">
              A customer with matching contact info already exists. Link to the existing record
              before building a quote to avoid duplicates.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
            Create a customer record from this request, or link to an existing one.
          </p>
        )}

        <div className="mt-4">
          <LeadCustomerPreviewBlock lead={lead} editLeadHref={editLeadHref} compact />
        </div>

        {suggestedMatches.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
              Suggested matches
            </p>
            <div className="grid gap-2">
              {suggestedMatches.slice(0, 3).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleLinkSuggested(candidate.id)}
                  disabled={isPending}
                  className="w-full text-left rounded-lg border border-border bg-background p-3 hover:border-accent/40 hover:bg-accent/[0.01] transition-all group disabled:opacity-50"
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
        ) : null}

        {state.error ? (
          <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
            className={`${secondaryBtnClass} sm:max-w-[220px]`}
          >
            <Search className="size-4" />
            Link existing
          </button>
        </div>
      </WorkspacePanel>
      </div>

      <LeadCustomerSearchDialog
        leadId={lead.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}

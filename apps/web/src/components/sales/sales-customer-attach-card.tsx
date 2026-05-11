"use client";

import { useState, useCallback, useEffect, useTransition, useActionState } from "react";
import { Search, UserRound, Check, X, ArrowRight, Loader2 } from "lucide-react";
import { 
  searchCustomersForSalesIntakeAttachAction, 
  linkSalesIntakeToCustomerWorkspaceAction,
  type CustomerSearchMatch,
  type WorkspaceFormState
} from "@/app/(workspace)/sales/sales-workspace-actions";
import { SalesIntakeWorkspaceCustomerCreateInline, type SalesIntakeWorkspaceCustomerCreateSalesIntakeInput } from "./sales-workspace-customer-create-inline";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

/**
 * Single card for attaching a customer to a sales intake.
 * 
 * Replaces the stacked create-inline card and link-existing details block.
 * Provides autocomplete search against existing customers; falls back to
 * the inline create card when no search is active.
 */
export function SalesIntakeCustomerAttachCard({
  salesIntake,
  editSalesIntakeHref,
  onSuccess,
}: {
  salesIntake: SalesIntakeWorkspaceCustomerCreateSalesIntakeInput;
  editSalesIntakeHref: string;
  onSuccess: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerSearchMatch[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<CustomerSearchMatch | null>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setMatches([]);
      return;
    }

    startSearch(async () => {
      const res = await searchCustomersForSalesIntakeAttachAction(q);
      if (res.ok) {
        setMatches(res.matches);
        setSearchError(null);
      } else {
        setSearchError(res.error);
      }
    });
  }, []);

  const boundLinkAction = linkSalesIntakeToCustomerWorkspaceAction.bind(null, salesIntake.id);
  const [linkState, linkDispatch, isLinkPending] = useActionState<WorkspaceFormState, FormData>(
    boundLinkAction,
    {},
  );

  useEffect(() => {
    if (linkState.success) onSuccess();
  }, [linkState.success, onSuccess]);

  if (selectedMatch) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-foreground-subtle" />
            <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
              Link customer
            </p>
          </div>
          <button 
            type="button" 
            onClick={() => setSelectedMatch(null)}
            className="text-foreground-subtle hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-2">
          <div>
            <p className={sectionLabelClass}>Name</p>
            <p className="text-sm font-medium text-foreground">{selectedMatch.displayName}</p>
          </div>
          {selectedMatch.companyName && (
            <div>
              <p className={sectionLabelClass}>Company</p>
              <p className="text-sm text-foreground-muted">{selectedMatch.companyName}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {selectedMatch.email && (
              <div>
                <p className={sectionLabelClass}>Email</p>
                <p className="text-sm text-foreground-muted truncate">{selectedMatch.email}</p>
              </div>
            )}
            {selectedMatch.phone && (
              <div>
                <p className={sectionLabelClass}>Phone</p>
                <p className="text-sm text-foreground-muted">{selectedMatch.phone}</p>
              </div>
            )}
          </div>
        </div>

        {linkState.error && (
          <p className="text-xs text-danger" role="alert">{linkState.error}</p>
        )}

        <form action={linkDispatch}>
          <input type="hidden" name="customerId" value={selectedMatch.id} />
          <button 
            type="submit" 
            disabled={isLinkPending} 
            className={primaryBtnClass}
          >
            {isLinkPending ? "Linking..." : "Confirm & Link"}
            {!isLinkPending && <Check className="size-3.5" />}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-foreground-subtle" />
          <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
            Find or create customer
          </p>
        </div>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none"
          />
          {isSearching && (
            <div className="absolute right-3 top-2.5">
              <Loader2 className="size-4 animate-spin text-foreground-subtle" />
            </div>
          )}
        </div>

        {searchError && (
          <p className="text-xs text-danger">{searchError}</p>
        )}

        {matches.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedMatch(m)}
                  className="w-full px-3 py-2.5 text-left hover:bg-foreground/[0.02] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.displayName}</p>
                    <p className="text-xs text-foreground-muted truncate">
                      {[m.companyName, m.email].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ArrowRight className="size-3.5 text-foreground-subtle" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !isSearching && matches.length === 0 && (
          <p className="text-xs text-foreground-muted px-1">No matches found for &quot;{query}&quot;.</p>
        )}
      </div>

      {!query.trim() && (
        <SalesIntakeWorkspaceCustomerCreateInline
          salesIntake={salesIntake}
          editSalesIntakeHref={editSalesIntakeHref}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}

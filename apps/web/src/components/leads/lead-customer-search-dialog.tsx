"use client";

import { useState, useCallback, useEffect, useTransition, useActionState, useRef } from "react";
import { Search, UserRound, Check, X, ArrowRight, Loader2 } from "lucide-react";
import {
  searchCustomersForLeadAttachAction,
  linkLeadToCustomerWorkspaceAction,
  type CustomerSearchMatch,
  type WorkspaceFormState,
} from "@/app/(workspace)/leads/lead-workspace-actions";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

const primaryBtnClass =
  "rounded-lg bg-accent text-accent-contrast text-xs font-medium px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5";

function LinkConfirmView({
  match,
  leadId,
  onBack,
  onSuccess,
}: {
  match: CustomerSearchMatch;
  leadId: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const boundLinkAction = linkLeadToCustomerWorkspaceAction.bind(null, leadId);
  const [linkState, linkDispatch, isLinkPending] = useActionState<WorkspaceFormState, FormData>(
    boundLinkAction,
    {},
  );

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!linkState.success) return;
    onSuccessRef.current();
  }, [linkState.success]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-foreground-subtle" />
          <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
            Link customer
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-foreground-subtle hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3 space-y-2">
        <div>
          <p className={sectionLabelClass}>Name</p>
          <p className="text-sm font-medium text-foreground">{match.displayName}</p>
        </div>
        {match.companyName ? (
          <div>
            <p className={sectionLabelClass}>Company</p>
            <p className="text-sm text-foreground-muted">{match.companyName}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {match.email ? (
            <div>
              <p className={sectionLabelClass}>Email</p>
              <p className="text-sm text-foreground-muted truncate">{match.email}</p>
            </div>
          ) : null}
          {match.phone ? (
            <div>
              <p className={sectionLabelClass}>Phone</p>
              <p className="text-sm text-foreground-muted">{match.phone}</p>
            </div>
          ) : null}
        </div>
      </div>

      {linkState.error ? (
        <p className="text-xs text-danger" role="alert">
          {linkState.error}
        </p>
      ) : null}

      <form action={linkDispatch}>
        <input type="hidden" name="customerId" value={match.id} />
        <button type="submit" disabled={isLinkPending} className={primaryBtnClass}>
          {isLinkPending ? "Linking..." : "Confirm & Link"}
          {!isLinkPending && <Check className="size-3.5" />}
        </button>
      </form>
    </div>
  );
}

function SearchView({
  onSelect,
}: {
  onSelect: (match: CustomerSearchMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerSearchMatch[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setMatches([]);
      return;
    }

    startSearch(async () => {
      const res = await searchCustomersForLeadAttachAction(q);
      if (res.ok) {
        setMatches(res.matches);
        setSearchError(null);
      } else {
        setSearchError(res.error);
      }
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search className="size-4 text-foreground-subtle" />
        <p className="text-xs font-bold text-foreground-subtle uppercase tracking-wider">
          Search customers
        </p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, email, or phone..."
          autoFocus
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus:border-border-strong focus:outline-none"
        />
        {isSearching ? (
          <div className="absolute right-3 top-2.5">
            <Loader2 className="size-4 animate-spin text-foreground-subtle" />
          </div>
        ) : null}
      </div>

      {searchError ? <p className="text-xs text-danger">{searchError}</p> : null}

      {matches.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden max-h-48 overflow-y-auto">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m)}
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
      ) : null}

      {query.trim().length >= 2 && !isSearching && matches.length === 0 ? (
        <p className="text-xs text-foreground-muted px-1">
          No matches found for &quot;{query}&quot;.
        </p>
      ) : null}
    </div>
  );
}

export function LeadCustomerSearchDialog({
  leadId,
  open,
  onOpenChange,
  onSuccess,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [selectedMatch, setSelectedMatch] = useState<CustomerSearchMatch | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedMatch(null);
    onOpenChange(next);
  };

  if (!open) return null;

  const handleSuccess = () => {
    handleOpenChange(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-customer-search-title"
      >
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          className="absolute right-3 top-3 rounded-sm opacity-70 transition-opacity hover:opacity-100"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <h2 id="lead-customer-search-title" className="text-sm font-semibold text-foreground mb-4">
          Link existing customer
        </h2>

        {selectedMatch ? (
          <LinkConfirmView
            match={selectedMatch}
            leadId={leadId}
            onBack={() => setSelectedMatch(null)}
            onSuccess={handleSuccess}
          />
        ) : (
          <SearchView onSelect={setSelectedMatch} />
        )}
      </div>
    </div>
  );
}

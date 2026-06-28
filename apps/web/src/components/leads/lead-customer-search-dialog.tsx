"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { Search, X, ArrowRight, Loader2 } from "lucide-react";
import {
  searchCustomersForLeadAttachAction,
  loadCustomerLinkPreviewAction,
  type CustomerLinkPreview,
  type CustomerSearchMatch,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { LeadCustomerLinkConfirmView } from "@/components/leads/lead-customer-link-confirm-view";

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

function PreviewLoader({
  leadId,
  customerId,
  onBack,
  onSuccess,
}: {
  leadId: string;
  customerId: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [preview, setPreview] = useState<CustomerLinkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const result = await loadCustomerLinkPreviewAction(leadId, customerId);
      if (result.ok) {
        setPreview(result.preview);
        setError(null);
      } else {
        setPreview(null);
        setError(result.error);
      }
    });
  }, [leadId, customerId]);

  if (isLoading || (!preview && !error)) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-foreground-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading link preview…
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger" role="alert">
          {error ?? "Could not load link preview."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-foreground-muted underline-offset-2 hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <LeadCustomerLinkConfirmView
      preview={preview}
      leadId={leadId}
      onBack={onBack}
      onSuccess={onSuccess}
    />
  );
}

export function LeadCustomerSearchDialog({
  leadId,
  open,
  onOpenChange,
  onSuccess,
  initialCustomerId = null,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** When set, opens directly on the customer + jobsite confirmation step. */
  initialCustomerId?: string | null;
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (open && initialCustomerId) {
      const frame = window.requestAnimationFrame(() => {
        setSelectedCustomerId(initialCustomerId);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [open, initialCustomerId]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedCustomerId(null);
    onOpenChange(next);
  };

  if (!open) return null;

  const handleSuccess = () => {
    handleOpenChange(false);
    onSuccess();
  };

  const confirmCustomerId = selectedCustomerId ?? initialCustomerId;

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
          {confirmCustomerId ? "Review customer + jobsite" : "Link existing customer"}
        </h2>

        {confirmCustomerId ? (
          <PreviewLoader
            leadId={leadId}
            customerId={confirmCustomerId}
            onBack={() => setSelectedCustomerId(null)}
            onSuccess={handleSuccess}
          />
        ) : (
          <SearchView onSelect={(match) => setSelectedCustomerId(match.id)} />
        )}
      </div>
    </div>
  );
}

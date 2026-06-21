"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  loadLeadCommercialSurfaceAction,
  loadLeadActiveQuoteWorkSurfaceAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { OpportunityWorkspaceShell } from "@/components/work-surfaces/opportunity-workspace-shell";
import type { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import type { QuoteWorkSurfaceLoaderResult } from "@/lib/quote-work-surface-loader-types";
import type { OpportunityWorkspaceTab } from "@/lib/opportunity-tab-routing";

export type OpportunityWorkspaceDialogBodyProps = {
  leadId: string;
  initialTab?: OpportunityWorkspaceTab;
  onClose: () => void;
};

export function OpportunityWorkspaceDialogBody({
  leadId,
  initialTab = "review",
  onClose,
}: OpportunityWorkspaceDialogBodyProps) {
  const [payload, setPayload] = useState<LeadCommercialSurfacePayload | null>(null);
  const [quoteSurface, setQuoteSurface] = useState<QuoteWorkSurfaceLoaderResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const reloadWorkspace = useCallback(async () => {
    const [leadResult, quoteResult] = await Promise.all([
      loadLeadCommercialSurfaceAction(leadId),
      loadLeadActiveQuoteWorkSurfaceAction(leadId),
    ]);

    if (leadResult.ok) {
      setPayload(leadResult.payload);
    }
    if (quoteResult.ok) {
      setQuoteSurface(quoteResult.payload);
    }
  }, [leadId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await reloadWorkspace();
      if (!cancelled) {
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadWorkspace]);

  const handleWorkspaceMutated = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await reloadWorkspace();
    } finally {
      setIsRefreshing(false);
    }
  }, [reloadWorkspace]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {isRefreshing ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2"
          aria-hidden
        >
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground-muted shadow-sm">
            Updating…
          </span>
        </div>
      ) : null}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-accent/20" />
        </div>
      ) : payload ? (
        <OpportunityWorkspaceShell
          payload={payload}
          activeQuoteSurface={quoteSurface}
          initialTab={initialTab}
          compact
          entryPoint="workstation"
          onClose={onClose}
          onWorkspaceMutated={handleWorkspaceMutated}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-12 text-center">
          <p className="text-sm text-foreground-muted">Failed to load opportunity details.</p>
        </div>
      )}
    </div>
  );
}

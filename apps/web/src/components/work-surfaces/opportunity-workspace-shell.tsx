"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import { workspaceContentWidth } from "@/components/shell/shell-layout-classes";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { StartQuoteFromLeadButton } from "@/components/leads/start-quote-from-lead-button";
import { LeadReviewQuickActions } from "@/components/leads/lead-review-quick-actions";
import {
  loadLeadActiveQuoteWorkSurfaceAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import type { LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import type { QuoteWorkSurfaceLoaderResult } from "@/lib/quote-work-surface-loader-types";
import type { OpportunityFlowView } from "@/lib/opportunity-flow";
import {
  opportunityWorkspaceHref,
  parseOpportunityWorkspaceTab,
  type OpportunityWorkspaceTab,
} from "@/lib/opportunity-tab-routing";

export type OpportunityWorkspaceShellProps = {
  payload: LeadCommercialSurfacePayload;
  activeQuoteSurface: QuoteWorkSurfaceLoaderResult | null;
  initialTab: OpportunityWorkspaceTab;
  compact?: boolean;
  entryPoint?: "record" | "workstation";
  onClose?: () => void;
  /** Workstation drawer — reload lead + quote payloads without navigating away. */
  onWorkspaceMutated?: () => void | Promise<void>;
};

const tabButtonClass = (active: boolean) =>
  [
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
      : "text-foreground-muted hover:text-foreground",
  ].join(" ");

function conditionTone(flow: OpportunityFlowView): StatusBadgeTone {
  if (flow.phase === "WON") return "approved";
  if (flow.phase === "CUSTOMER_REVIEW") return "sent";
  if (flow.phase === "LOST") return "neutral";
  if (flow.phase === "PAUSED") return "warning";
  return "draft";
}

export function OpportunityWorkspaceShell({
  payload,
  activeQuoteSurface: initialQuoteSurface,
  initialTab,
  compact = false,
  entryPoint = "record",
  onClose,
  onWorkspaceMutated,
}: OpportunityWorkspaceShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawerTab, setDrawerTab] = useState<OpportunityWorkspaceTab>(initialTab);
  const [quoteSurfaceOverride, setQuoteSurfaceOverride] =
    useState<QuoteWorkSurfaceLoaderResult | null>(null);
  const [, startTransition] = useTransition();

  const activeTab = compact
    ? drawerTab
    : parseOpportunityWorkspaceTab(searchParams.get("tab") ?? initialTab);
  const quoteSurface = quoteSurfaceOverride ?? initialQuoteSurface;

  const { lead, opportunityFlow, customer } = payload;
  const isTerminalPhase = opportunityFlow.phase === "PAUSED" || opportunityFlow.phase === "LOST";
  const isAssignedVisitMode = payload.surfaceMode === "assigned_visit";
  const primaryName =
    customer?.displayName ||
    lead.contactName ||
    lead.companyName ||
    lead.email ||
    lead.title;

  const switchTab = useCallback(
    (tab: OpportunityWorkspaceTab) => {
      if (compact) {
        setDrawerTab(tab);
        return;
      }
      router.push(opportunityWorkspaceHref(lead.id, tab), { scroll: false });
    },
    [compact, lead.id, router],
  );

  const refreshQuoteSurface = useCallback(async () => {
    if (onWorkspaceMutated) {
      await onWorkspaceMutated();
      setQuoteSurfaceOverride(null);
      return;
    }
    const result = await loadLeadActiveQuoteWorkSurfaceAction(lead.id);
    if (result.ok) {
      setQuoteSurfaceOverride(result.payload);
    }
    router.refresh();
  }, [lead.id, onWorkspaceMutated, router]);

  const handleNavigateToQuoteTab = useCallback(
    () => {
      startTransition(async () => {
        await refreshQuoteSurface();
        switchTab("quote");
      });
    },
    [refreshQuoteSurface, switchTab, startTransition],
  );

  const handleMutationSuccess = useCallback(() => {
    void refreshQuoteSurface();
    if (compact) {
      // Refresh feed data in the background; selection resolver keeps drawer open.
      router.refresh();
    }
  }, [compact, refreshQuoteSurface, router]);

  const handleRequestServiceAddress = useCallback(() => {
    if (compact) {
      switchTab("review");
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          document.getElementById("address-verify")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
      return;
    }
    router.push(opportunityWorkspaceHref(lead.id, "review", "address-verify"));
  }, [compact, lead.id, router, switchTab]);

  const showQuoteEmptyState = activeTab === "quote" && !quoteSurface;

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : workspaceContentWidth.wide}>
      {!compact ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <ButtonLink href="/leads" variant="ghost" size="sm">
            ← Sales
          </ButtonLink>
          {entryPoint === "workstation" ? (
            <ButtonLink href="/workstation" variant="ghost" size="sm">
              ← Workstation
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      <section
        className={
          compact
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface"
            : "rounded-lg border border-border bg-surface"
        }
      >
        <div
          className={
            compact
              ? "shrink-0 flex flex-col gap-4 border-b border-border bg-surface p-4 sm:p-5"
              : "flex flex-col gap-4 border-b border-border p-4 sm:p-5"
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={opportunityFlow.conditionLabel}
                  tone={conditionTone(opportunityFlow)}
                />
                {opportunityFlow.ageLabel ? (
                  <span className="text-xs text-foreground-muted">{opportunityFlow.ageLabel}</span>
                ) : null}
              </div>
              {customer ? (
                <Link
                  href={customer.href}
                  className="mt-2 inline-flex max-w-full text-xl font-bold tracking-tight text-foreground underline-offset-4 hover:underline sm:text-2xl"
                >
                  <span className="truncate">{primaryName}</span>
                </Link>
              ) : (
                <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {primaryName}
                </h1>
              )}
              {lead.jobsiteAddressLine ? (
                <p className="mt-1 text-sm text-foreground-muted">{lead.jobsiteAddressLine}</p>
              ) : null}
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-muted">
                {opportunityFlow.summary}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <LeadReviewQuickActions
                phone={lead.phone}
                email={lead.email}
                leadId={lead.id}
                visits={payload.visitRequests}
                siteVisitDisabled={isTerminalPhase || isAssignedVisitMode}
                onSuccess={handleMutationSuccess}
              />
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-2 py-1 text-xs font-medium text-foreground-muted hover:text-foreground"
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>

          <nav
            aria-label="Opportunity workspace"
            className="inline-flex w-fit rounded-lg border border-border bg-foreground/[0.02] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "review"}
              className={tabButtonClass(activeTab === "review")}
              onClick={() => switchTab("review")}
            >
              Review
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "quote"}
              className={tabButtonClass(activeTab === "quote")}
              onClick={() => switchTab("quote")}
            >
              Quote
            </button>
          </nav>
        </div>

        <div
          className={
            compact
              ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-subtle"
              : undefined
          }
        >
          {activeTab === "review" ? (
            <LeadCommercialSurface
              payload={payload}
              entryPoint={compact ? "workstation" : entryPoint === "workstation" ? "workstation" : "record"}
              embeddedInOpportunityWorkspace
              onMutationSuccess={handleMutationSuccess}
              onNavigateToQuoteTab={handleNavigateToQuoteTab}
              onClose={onClose}
            />
          ) : showQuoteEmptyState ? (
            <div className="flex flex-col items-start gap-4 p-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">No quote yet</h2>
                <p className="mt-1 max-w-lg text-sm text-foreground-muted">
                  Start a draft quote for this opportunity. You will stay in this workspace — no
                  redirect to a separate quote page.
                </p>
              </div>
              <StartQuoteFromLeadButton
                leadId={lead.id}
                label="Start quote"
                variant="primary"
                onQuoteStarted={() => {
                  void refreshQuoteSurface().then(() => switchTab("quote"));
                }}
                skipRouterRefresh={compact}
              />
            </div>
          ) : quoteSurface ? (
            <div className="p-2 sm:p-4">
              <QuoteWorkSurface
                quote={quoteSurface.quote}
                workflow={quoteSurface.workflow}
                workspaceTabs={quoteSurface.workspaceTabs}
                embeddedInLead
                embeddedInOpportunityWorkspace={compact}
                onRequestServiceAddress={handleRequestServiceAddress}
                onWorkSurfaceMutated={handleMutationSuccess}
              />
            </div>
          ) : (
            <div className="p-6 text-sm text-foreground-muted">Loading quote workspace…</div>
          )}
        </div>
      </section>
    </div>
  );
}

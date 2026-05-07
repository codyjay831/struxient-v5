"use client";

import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import {
  type QuoteReadiness,
  resolveQuoteReadinessActionHref,
} from "@/lib/quote-readiness";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SignalCard } from "@/components/ui/signal-card";
import { formatMoneyCents, formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Send,
  ThumbsUp,
  Wrench,
  Briefcase,
} from "lucide-react";

export function QuoteReadinessIconStrip({
  stepIndex,
  isTerminal,
  className,
}: {
  stepIndex: number;
  isTerminal: boolean;
  className?: string;
}) {
  if (isTerminal) return null;

  return (
    <div className={["flex items-center gap-1", className].filter(Boolean).join(" ")}>
      {[FileText, Send, ThumbsUp, Wrench, Briefcase].map((Icon, idx) => {
        const isCompleted = idx < stepIndex;
        const isCurrent = idx === stepIndex;

        return (
          <div
            key={idx}
            className={[
              "flex size-5 items-center justify-center rounded-full border transition-colors",
              isCompleted
                ? "border-accent bg-accent text-accent-contrast"
                : isCurrent
                  ? "border-accent bg-surface text-accent"
                  : "border-border bg-surface text-foreground-subtle/40",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isCompleted ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <Icon className="size-3" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface QuoteReadinessPanelProps {
  quoteId: string;
  quoteStatus: QuoteStatus;
  readiness: QuoteReadiness;
}

export function QuoteReadinessPanel({
  quoteId,
  quoteStatus,
  readiness,
}: QuoteReadinessPanelProps) {
  const {
    state,
    label,
    primaryAction,
    secondaryAction,
    badgeTone,
    showsRevisionDrift,
    signals,
  } = readiness;

  // Only show the derived readiness label if it adds meaning beyond the base QuoteStatus
  const showReadinessChip = ![
    "DRAFT_IN_PROGRESS",
    "SENT_AWAITING_CUSTOMER",
    "ARCHIVED",
  ].includes(state);

  return (
    <WorkspacePanel className="mb-6 border-border-strong shadow-sm ring-1 ring-ring/5">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Quote Status
            </span>
            <StatusBadge
              label={formatQuoteStatus(quoteStatus)}
              tone={quoteStatusBadgeTone(quoteStatus)}
            />
          </div>

          {showReadinessChip && (
            <StatusBadge label={label} tone={badgeTone} className="bg-foreground/[0.02]" />
          )}

          {showsRevisionDrift && (
            <div className="flex items-center gap-1.5 rounded-full bg-danger/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-danger">
              <AlertCircle className="size-3" />
              Edits since last proof
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {secondaryAction && (
            <Link
              href={resolveQuoteReadinessActionHref(secondaryAction, { quoteId })}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              {secondaryAction.label}
            </Link>
          )}

          {primaryAction && (
            <Link
              href={resolveQuoteReadinessActionHref(primaryAction, { quoteId })}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-all hover:bg-accent/90 active:scale-[0.98]"
            >
              {primaryAction.label}
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <SignalCard
          label="Lines"
          value={String(signals.lineItemCount)}
          hint={formatMoneyCents(signals.totalCents)}
          icon={FileText}
        />
        <SignalCard
          label="Sent"
          value={signals.latestSendAt ? "Yes" : "No"}
          hint={signals.latestSendAt ? new Date(signals.latestSendAt).toLocaleDateString() : "Not sent yet"}
          icon={Send}
        />
        <SignalCard
          label="Approved"
          value={signals.latestApprovalAt ? "Yes" : "No"}
          hint={signals.latestApprovalAt ? new Date(signals.latestApprovalAt).toLocaleDateString() : "Awaiting approval"}
          icon={ThumbsUp}
        />
        <SignalCard
          label="Execution"
          value={signals.activationTaskCount > 0 ? String(signals.activationTaskCount) : "—"}
          hint={
            signals.needsExecutionReviewLineCount > 0
              ? `${signals.needsExecutionReviewLineCount} lines need review`
              : signals.activationTaskCount > 0
                ? "Ready for activation"
                : "No tasks yet"
          }
          icon={Wrench}
          tone={signals.needsExecutionReviewLineCount > 0 ? "warning" : "neutral"}
        />
        <SignalCard
          label="Job"
          value={signals.activatedJobId ? "Active" : "—"}
          hint={signals.activatedJobId ? "Job is running" : "Not activated"}
          icon={Briefcase}
          tone={signals.activatedJobId ? "success" : "neutral"}
        />
      </div>
    </WorkspacePanel>
  );
}

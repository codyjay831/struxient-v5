"use client";

import type { QuoteStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { RecordActionPanel } from "@/components/ui/record-action-panel";
import {
  type QuoteReadiness,
  QUOTE_READINESS_STEPS,
  resolveQuoteReadinessActionHref,
  type QuoteReadinessAction,
} from "@/lib/quote-readiness";
import { SignalCard } from "@/components/ui/signal-card";
import { formatMoneyCents } from "@/lib/quote-display";
import {
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
  readiness,
}: QuoteReadinessPanelProps) {
  const {
    label,
    description,
    primaryAction,
    secondaryAction,
    badgeTone,
    showsRevisionDrift,
    signals,
    stepIndex,
    totalSteps,
    isTerminal,
  } = readiness;

  const mapAction = (action: QuoteReadinessAction | null) => {
    if (!action) return undefined;

    const iconMap: Record<string, LucideIcon> = {
      SEND_QUOTE: Send,
      MARK_APPROVED: ThumbsUp,
      OPEN_EXECUTION_REVIEW: Wrench,
      ACTIVATE_JOB: Briefcase,
      OPEN_JOB: Briefcase,
      ADD_LINE_ITEM: FileText,
      CONTINUE_EDITING: FileText,
    };

    return {
      label: action.label,
      href: resolveQuoteReadinessActionHref(action, { quoteId }),
      icon: iconMap[action.kind] || ArrowRight,
    };
  };

  const requiredItems = [];
  if (signals.lineItemCount === 0) {
    requiredItems.push({ label: "Line items", satisfied: false });
  }
  if (signals.needsExecutionReviewLineCount > 0) {
    requiredItems.push({
      label: `${signals.needsExecutionReviewLineCount} lines need review`,
      satisfied: false,
    });
  }

  const satisfiedItems = [];
  if (signals.lineItemCount > 0) {
    satisfiedItems.push({ label: "Line items added" });
  }
  if (signals.latestSendAt) {
    satisfiedItems.push({ label: "Quote sent" });
  }
  if (signals.latestApprovalAt) {
    satisfiedItems.push({ label: "Quote approved" });
  }

  return (
    <RecordActionPanel
      kind="quote"
      status={{ label, tone: badgeTone }}
      reason={showsRevisionDrift ? "Quote revised since last send" : undefined}
      description={description}
      primaryAction={mapAction(primaryAction)}
      secondaryAction={mapAction(secondaryAction)}
      requiredItems={requiredItems}
      satisfiedItems={satisfiedItems}
      progress={{
        stepIndex,
        totalSteps,
        steps: QUOTE_READINESS_STEPS,
        isTerminal,
      }}
      className="mb-6"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <SignalCard
          label="Lines"
          value={String(signals.lineItemCount)}
          hint={formatMoneyCents(signals.totalCents)}
          icon={FileText}
        />
        <SignalCard
          label="Sent"
          value={signals.latestSendAt ? "Yes" : "No"}
          hint={
            signals.latestSendAt
              ? new Date(signals.latestSendAt).toLocaleDateString()
              : "Not sent yet"
          }
          icon={Send}
        />
        <SignalCard
          label="Approved"
          value={signals.latestApprovalAt ? "Yes" : "No"}
          hint={
            signals.latestApprovalAt
              ? new Date(signals.latestApprovalAt).toLocaleDateString()
              : "Awaiting approval"
          }
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
    </RecordActionPanel>
  );
}

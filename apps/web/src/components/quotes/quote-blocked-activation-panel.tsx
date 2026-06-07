"use client";

import Link from "next/link";
import type { QuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { QuoteCrossLineWiringReviewTrigger } from "@/components/quotes/quote-cross-line-wiring-review";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast opacity-50 cursor-not-allowed";

function getBlockReasonAction(
  quoteId: string,
  code: QuoteJobActivationReadiness["blockReasons"][number]["code"],
): { href: string; label: string } | null {
  switch (code) {
    case "TASK_MISSING_STAGE":
      return { href: `/quotes/${quoteId}`, label: "Assign stages on the quote" };
    case "HARD_SIGNAL_NO_PROVIDER":
      return { href: "#execution-dependency-gaps", label: "Fix dependency gaps below" };
    case "APPROVAL_CHECKPOINT_MISSING":
      return { href: `/quotes/${quoteId}`, label: "Record approval checkpoint on quote" };
    case "PAYMENT_MILESTONE_MISSING_AMOUNT":
    case "PAYMENT_MILESTONE_INVALID_PERCENTAGE":
    case "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL":
      return { href: `/quotes/${quoteId}`, label: "Review payment schedule" };
    default:
      return null;
  }
}

export function QuoteBlockedActivationPanel({
  quoteId,
  readiness,
  quoteIsApproved,
  showCrossLineReview,
  hardOrphanCount,
}: {
  quoteId: string;
  readiness: QuoteJobActivationReadiness;
  quoteIsApproved: boolean;
  showCrossLineReview: boolean;
  hardOrphanCount: number;
}) {
  return (
    <WorkspacePanel className="border-l-[3px] border-l-accent/70 bg-accent/[0.04]">
      <SectionHeading
        title="Create job from this approved quote"
        description={
          quoteIsApproved
            ? "Resolve the blockers below before creating the job. Job creation stays disabled until readiness checks pass."
            : "Job creation unlocks after quote approval. Clear planning blockers now so activation is ready as soon as approval is recorded."
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButtonClass} disabled aria-disabled="true">
          Create job
        </button>
        {hardOrphanCount > 0 ? (
          <Link
            href="#execution-dependency-gaps"
            className="text-xs font-medium text-accent hover:underline"
          >
            View {hardOrphanCount} required gap{hardOrphanCount === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>

      <ul className="space-y-3">
        {readiness.blockReasons.map((reason) => {
          const action = getBlockReasonAction(quoteId, reason.code);
          return (
            <li key={reason.code} className="rounded-md border border-border bg-background/40 px-3 py-2">
              <p className="text-sm font-medium text-foreground">{reason.message}</p>
              {action ? (
                <Link href={action.href} className="mt-2 inline-flex text-xs font-medium text-primary hover:underline">
                  {action.label}
                </Link>
              ) : null}
              {reason.details && reason.details.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
                  {reason.details.map((detail) => (
                    <li key={detail}>· {detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {showCrossLineReview ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-foreground-muted">
            Optional: AI Secretary can suggest cross-line wiring. You can also fix gaps manually
            using <strong>Edit task</strong> in the dependency list or line breakdown.
          </p>
          <div className="mt-3">
            <QuoteCrossLineWiringReviewTrigger label="Review whole execution flow" />
          </div>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { acceptQuoteExecutionPlanAction } from "@/app/(workspace)/quotes/quote-plan-actions";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast opacity-50 cursor-not-allowed";

function getBlockReasonAction(
  quoteId: string,
  code: QuoteJobActivationReadiness["blockReasons"][number]["code"],
): { href: string; label: string } | null {
  switch (code) {
    case "TASK_MISSING_STAGE":
      return { href: `#plan-preview`, label: "Review plan tasks below" };
    case "HARD_SIGNAL_NO_PROVIDER":
      return { href: "#execution-dependency-gaps", label: "Fix dependency gaps below" };
    case "APPROVAL_CHECKPOINT_MISSING":
      return { href: `/quotes/${quoteId}`, label: "Record approval checkpoint on quote" };
    case "PAYMENT_MILESTONE_MISSING_AMOUNT":
    case "PAYMENT_MILESTONE_INVALID_PERCENTAGE":
    case "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL":
      return { href: `/quotes/${quoteId}`, label: "Review payment schedule" };
    case "PLAN_NOT_ACCEPTED":
    case "PLAN_STALE":
    case "NO_EXECUTION_TASKS":
      return { href: `#whole-quote-plan`, label: "Build or accept the execution plan" };
    case "EXECUTION_SCOPE_NOT_COVERED":
      return { href: `#plan-preview`, label: "Review scope coverage below" };
    default:
      return null;
  }
}

function getBlockReasonSeverity(
  code: QuoteJobActivationReadiness["blockReasons"][number]["code"],
): "BLOCKING" | "WARNING" | "INFO" {
  switch (code) {
    case "QUOTE_NOT_APPROVED":
      return "INFO";
    case "APPROVAL_CHECKPOINT_MISSING":
    case "PLAN_NOT_ACCEPTED":
    case "PLAN_STALE":
    case "PLAN_VERSION_MISMATCH":
    case "NO_EXECUTION_TASKS":
      return "WARNING";
    default:
      return "BLOCKING";
  }
}

export function QuoteBlockedActivationPanel({
  quoteId,
  readiness,
  quoteIsApproved,
  hardOrphanCount,
}: {
  quoteId: string;
  readiness: QuoteJobActivationReadiness;
  quoteIsApproved: boolean;
  hardOrphanCount: number;
}) {
  const [isAcceptingPlan, startAcceptPlan] = useTransition();
  const [acceptPlanError, setAcceptPlanError] = useState<string | null>(null);
  const router = useRouter();
  const canAcceptPlan = readiness.blockReasons.some(
    (reason) => reason.code === "PLAN_NOT_ACCEPTED" || reason.code === "PLAN_STALE",
  );

  return (
    <WorkspacePanel className="border-l-[3px] border-l-accent/70 bg-accent/[0.04]">
      <SectionHeading
        title="Cannot create job yet"
        description={
          quoteIsApproved
            ? "Resolve the required actions below. Job creation stays disabled until readiness checks pass."
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
          const severity = getBlockReasonSeverity(reason.code);
          const severityClass =
            severity === "BLOCKING"
              ? "text-danger border-danger/40 bg-danger/[0.08]"
              : severity === "WARNING"
                ? "text-warning border-warning/40 bg-warning/[0.08]"
                : "text-foreground-muted border-border bg-background/70";
          return (
            <li key={reason.code} className="rounded-md border border-border bg-background/40 px-3 py-2">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${severityClass}`}
                >
                  {severity}
                </span>
                <p className="text-sm font-medium text-foreground">{reason.message}</p>
              </div>
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
      {canAcceptPlan ? (
        <div className="mt-4 rounded-md border border-border bg-background/50 p-3">
          <p className="text-xs text-foreground-muted">
            Plan inputs changed or the plan has not been accepted yet. Accepting stamps the current planning context
            and unblocks activation when all other checks pass.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isAcceptingPlan}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                setAcceptPlanError(null);
                startAcceptPlan(async () => {
                  const result = await acceptQuoteExecutionPlanAction(quoteId);
                  if (!result.ok) {
                    setAcceptPlanError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {isAcceptingPlan ? "Accepting plan..." : "Accept current plan"}
            </button>
            {acceptPlanError ? (
              <span className="text-xs text-danger" role="alert">
                {acceptPlanError}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { QuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";

type ChecklistItem = {
  id: string;
  label: string;
  status: "pass" | "fail" | "pending";
  detail?: string;
};

function deriveChecklistItems(params: {
  quoteIsApproved: boolean;
  hasApprovalCheckpoint: boolean;
  hasPlanTasks: boolean;
  planAccepted: boolean;
  planInputsCurrent: boolean;
  readiness: QuoteJobActivationReadiness;
}): ChecklistItem[] {
  const blockCodes = new Set(params.readiness.blockReasons.map((r) => r.code));

  const scopeCovered = !blockCodes.has("EXECUTION_SCOPE_NOT_COVERED");
  const stagesAssigned = !blockCodes.has("TASK_MISSING_STAGE");
  const hardDepsResolved = !blockCodes.has("HARD_SIGNAL_NO_PROVIDER");
  const noCircularDeps = !blockCodes.has("CIRCULAR_SIGNAL_DEPENDENCY");
  const paymentValid =
    !blockCodes.has("PAYMENT_MILESTONE_MISSING_AMOUNT") &&
    !blockCodes.has("PAYMENT_MILESTONE_INVALID_PERCENTAGE") &&
    !blockCodes.has("PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL");
  const hasTasks = !blockCodes.has("NO_EXECUTION_TASKS");

  return [
    {
      id: "approved",
      label: "Quote approved",
      status: params.quoteIsApproved ? "pass" : "pending",
    },
    {
      id: "checkpoint",
      label: "Customer acceptance recorded",
      status: params.hasApprovalCheckpoint
        ? "pass"
        : params.quoteIsApproved
          ? "fail"
          : "pending",
    },
    {
      id: "plan-exists",
      label: "Execution plan built",
      status: params.hasPlanTasks ? "pass" : "fail",
      detail: params.hasPlanTasks ? undefined : "Generate or build a whole-quote plan first.",
    },
    {
      id: "plan-accepted",
      label: "Plan accepted for activation",
      status: params.planAccepted ? "pass" : params.hasPlanTasks ? "fail" : "pending",
    },
    {
      id: "plan-current",
      label: "Plan matches current quote inputs",
      status: params.planInputsCurrent
        ? "pass"
        : params.planAccepted || params.hasPlanTasks
          ? "fail"
          : "pending",
      detail: params.planInputsCurrent
        ? undefined
        : "Quote scope or planning inputs changed — re-review and accept the plan.",
    },
    {
      id: "scope-covered",
      label: "Every scope item has planned work",
      status: scopeCovered && hasTasks ? "pass" : params.hasPlanTasks ? "fail" : "pending",
    },
    {
      id: "stages",
      label: "All tasks have stages assigned",
      status: stagesAssigned ? "pass" : params.hasPlanTasks ? "fail" : "pending",
    },
    {
      id: "hard-deps",
      label: "Required prerequisites resolved",
      status: hardDepsResolved && noCircularDeps ? "pass" : params.hasPlanTasks ? "fail" : "pending",
    },
    {
      id: "payments",
      label: "Payment schedule valid",
      status: paymentValid ? "pass" : "fail",
    },
  ];
}

function StatusIcon({ status }: { status: ChecklistItem["status"] }) {
  if (status === "pass") {
    return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />;
  }
  if (status === "fail") {
    return <XCircle className="size-4 shrink-0 text-danger" aria-hidden />;
  }
  return <Circle className="size-4 shrink-0 text-foreground-subtle" aria-hidden />;
}

export function QuoteExecutionReadinessChecklist({
  quoteIsApproved,
  hasApprovalCheckpoint,
  hasPlanTasks,
  planAccepted,
  planInputsCurrent,
  readiness,
}: {
  quoteIsApproved: boolean;
  hasApprovalCheckpoint: boolean;
  hasPlanTasks: boolean;
  planAccepted: boolean;
  planInputsCurrent: boolean;
  readiness: QuoteJobActivationReadiness;
}) {
  const items = deriveChecklistItems({
    quoteIsApproved,
    hasApprovalCheckpoint,
    hasPlanTasks,
    planAccepted,
    planInputsCurrent,
    readiness,
  });

  return (
    <WorkspacePanel>
      <SectionHeading
        title="Activation readiness"
        description="Everything that must pass before this quote can become an active job."
      />
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-md border border-border/70 bg-surface/50 px-3 py-2">
            <StatusIcon status={item.status} />
            <div className="min-w-0">
              <p
                className={`text-sm ${
                  item.status === "pass"
                    ? "text-foreground"
                    : item.status === "fail"
                      ? "font-medium text-foreground"
                      : "text-foreground-muted"
                }`}
              >
                {item.label}
              </p>
              {item.detail ? (
                <p className="mt-0.5 text-xs text-foreground-muted">{item.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  );
}

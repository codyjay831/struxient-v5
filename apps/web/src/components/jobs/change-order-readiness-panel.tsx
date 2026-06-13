"use client";

import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { ChangeOrderStatus } from "@prisma/client";
import { formatCents } from "@/lib/job-payment-display";
import type { ChangeOrderReadiness } from "@/lib/change-order-flow";

function ReadinessRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${toneClass}`}>{value}</dd>
    </div>
  );
}

function ActionReadiness({
  label,
  state,
}: {
  label: string;
  state: { disabled: boolean; reason: string | null };
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
      {state.disabled ? (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-foreground-muted" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      )}
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-foreground-muted">
          {state.disabled ? state.reason ?? "Not ready." : "Ready."}
        </p>
      </div>
    </div>
  );
}

export function ChangeOrderReadinessPanel({
  readiness,
  mode,
}: {
  readiness: ChangeOrderReadiness;
  mode: "draft" | "selected";
}) {
  const { impact } = readiness;

  return (
    <div className="rounded-lg border border-border bg-foreground/[0.02] p-4 space-y-4 lg:sticky lg:top-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Impact and readiness</h3>
        <p className="mt-1 text-xs text-foreground-muted">
          Review commercial, payment, and execution impact before taking action.
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <ReadinessRow label="Adds" value={String(impact.addCount)} />
        <ReadinessRow label="Modifies" value={String(impact.modifyCount)} />
        <ReadinessRow label="Removes" value={String(impact.removeCount)} />
        <ReadinessRow
          label="Total price delta"
          value={formatCents(impact.priceDeltaCents)}
          tone={impact.paymentBlocked ? "warning" : "neutral"}
        />
      </dl>

      {readiness.executionCoverageWarning ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{readiness.executionCoverageWarning}</p>
        </div>
      ) : null}

      {impact.paymentBlocked && impact.paymentBlockReason ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{impact.paymentBlockReason}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        {mode === "draft" ? (
          <ActionReadiness label="Create draft" state={readiness.createDraft} />
        ) : null}
        {readiness.selectedRevisionStatus === ChangeOrderStatus.DRAFT ? (
          <ActionReadiness label="Send Change Order" state={readiness.approve} />
        ) : null}
        {readiness.selectedRevisionStatus === ChangeOrderStatus.ACCEPTED ? (
          <>
            <ActionReadiness label="Apply Change Order" state={readiness.apply} />
            <ReadinessRow
              label="Job plan version"
              value={`${readiness.expectedJobPlanVersion} (current ${readiness.jobPlanVersion})`}
              tone={
                readiness.expectedJobPlanVersion !== readiness.jobPlanVersion
                  ? "warning"
                  : "neutral"
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

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

function lifecycleTone(
  readiness: ChangeOrderReadiness,
): "neutral" | "success" | "warning" | "danger" {
  switch (readiness.lifecycleReadiness) {
    case "APPLIED":
    case "READY_TO_SEND":
    case "ACCEPTED_READY_TO_APPLY":
      return "success";
    case "APPLY_FAILED":
    case "ACCEPTED_NEEDS_EXECUTION_REVIEW":
    case "EXECUTION_NEEDS_REVIEW":
      return "danger";
    case "SENT_WAITING":
    case "CUSTOMER_REQUESTED_CHANGES":
      return "warning";
    default:
      return "neutral";
  }
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
        <h3 className="text-sm font-semibold text-foreground">Readiness</h3>
        <p className="mt-1 text-xs text-foreground-muted">
          Commercial, execution, and lifecycle state before you send or apply.
        </p>
      </div>

      {readiness.lifecycleReadinessLabel ? (
        <ReadinessRow
          label="Status"
          value={readiness.lifecycleReadinessLabel}
          tone={lifecycleTone(readiness)}
        />
      ) : null}

      {readiness.officeNextStep ? (
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-xs font-medium text-foreground-muted">Next step for office</p>
          <p className="mt-1 text-sm text-foreground">{readiness.officeNextStep}</p>
        </div>
      ) : null}

      {readiness.mixedEditBlocked && readiness.mixedEditMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{readiness.mixedEditMessage}</p>
        </div>
      ) : null}

      <ReadinessRow
        label="Customer approval required"
        value={readiness.requiresCustomerApproval ? "Yes" : "No"}
        tone={readiness.requiresCustomerApproval ? "warning" : "neutral"}
      />

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

      {readiness.applyErrorSummary && readiness.applyErrorSummary.messages.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              Apply failed
              {readiness.applyErrorSummary.classification
                ? ` (${readiness.applyErrorSummary.classification.replaceAll("_", " ").toLowerCase()})`
                : ""}
            </p>
            <ul className="mt-2 list-disc pl-5">
              {readiness.applyErrorSummary.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {readiness.storedPaymentTermsText ? (
              <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-foreground">
                <p className="text-xs font-medium text-foreground-muted">
                  Customer-approved payment terms (still on file)
                </p>
                <p className="mt-1 text-sm">{readiness.storedPaymentTermsText}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {mode === "draft" ? (
          <ActionReadiness label="Create draft" state={readiness.createDraft} />
        ) : null}
        {mode === "selected" && readiness.isEditable ? (
          <>
            <ActionReadiness label="Save commercial changes" state={readiness.saveCommercial} />
            <ActionReadiness label="Save execution impact" state={readiness.saveExecutionImpact} />
          </>
        ) : null}
        {readiness.selectedRevisionStatus === ChangeOrderStatus.DRAFT ? (
          <ActionReadiness label="Send change order" state={readiness.send} />
        ) : null}
        {readiness.selectedRevisionStatus === ChangeOrderStatus.SENT ||
        (readiness.selectedRevisionStatus === ChangeOrderStatus.DRAFT &&
          !readiness.requiresCustomerApproval) ? (
          <ActionReadiness label="Mark internally accepted" state={readiness.staffAccept} />
        ) : null}
        {readiness.selectedRevisionStatus === ChangeOrderStatus.ACCEPTED ? (
          <>
            <ActionReadiness label="Apply to job plan" state={readiness.apply} />
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

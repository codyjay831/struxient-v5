"use client";

import { useState, useTransition } from "react";
import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
} from "@prisma/client";
import {
  completeLeadVisitRequestAction,
  markLeadVisitNoShowAction,
  updateLeadVisitOutcomeAction,
} from "@/app/(workspace)/schedule/schedule-actions";
import { Button } from "@/components/ui/button";
import { LeadVisitOutcomeFields } from "@/components/leads/lead-visit-outcome-fields";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

function isOutcomeUpdateStatus(status: LeadVisitRequestStatus): boolean {
  return (
    status === LeadVisitRequestStatus.COMPLETED ||
    status === LeadVisitRequestStatus.NO_SHOW
  );
}

export function LeadVisitCompletionDialog({
  requestId,
  visitStatus,
  expectedUpdatedAt,
  onCompleted,
}: {
  requestId: string;
  visitStatus: LeadVisitRequestStatus;
  expectedUpdatedAt?: Date;
  onCompleted?: () => void;
}) {
  const outcomeUpdateMode = isOutcomeUpdateStatus(visitStatus);
  const [mode, setMode] = useState<"complete" | "no_show">("complete");
  const [outcome, setOutcome] = useState<LeadVisitOutcome | "">("");
  const [nextAction, setNextAction] = useState<LeadVisitNextAction | "">("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      {!outcomeUpdateMode ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mode === "complete" ? "default" : "muted"}
            onClick={() => {
              setMode("complete");
              setOutcome("");
              setNextAction("");
            }}
          >
            Complete visit
          </Button>
          <Button
            size="sm"
            variant={mode === "no_show" ? "default" : "muted"}
            onClick={() => {
              setMode("no_show");
              setOutcome(LeadVisitOutcome.CUSTOMER_NO_SHOW);
              setNextAction(LeadVisitNextAction.SCHEDULE_ANOTHER_VISIT);
            }}
          >
            Mark no-show
          </Button>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">
          Record or update the visit outcome and next sales action.
        </p>
      )}

      <LeadVisitOutcomeFields
        mode={outcomeUpdateMode ? "complete" : mode}
        outcome={outcome}
        nextAction={nextAction}
        onOutcomeChange={setOutcome}
        onNextActionChange={setNextAction}
      />

      <div>
        <label className={workspaceFormFieldLabelClass}>Notes</label>
        <textarea
          className={workspaceFormControlClass}
          rows={3}
          value={completionNotes}
          onChange={(event) => setCompletionNotes(event.target.value)}
          placeholder="Optional completion notes"
        />
      </div>

      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        size="sm"
        disabled={isPending || !outcome || !nextAction}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const payload = {
              outcome: outcome as LeadVisitOutcome,
              nextAction: nextAction as LeadVisitNextAction,
              completionNotes: completionNotes.trim() || undefined,
              sourceSurface: "lead" as const,
              expectedUpdatedAt,
            };

            let result;
            if (outcomeUpdateMode) {
              result = await updateLeadVisitOutcomeAction(requestId, payload);
            } else if (mode === "no_show") {
              result = await markLeadVisitNoShowAction(requestId, payload);
            } else {
              result = await completeLeadVisitRequestAction(requestId, payload);
            }

            if (result.error) {
              setError(result.error);
              return;
            }
            onCompleted?.();
          });
        }}
      >
        {isPending
          ? "Saving..."
          : outcomeUpdateMode
            ? "Save outcome"
            : mode === "no_show"
              ? "Save no-show"
              : "Save completion"}
      </Button>
    </div>
  );
}

export function findVisitForCompletionAction(
  visits: Array<{
    id: string;
    status: LeadVisitRequestStatus;
    outcome?: LeadVisitOutcome | null;
    nextAction?: LeadVisitNextAction | null;
  }>,
  targetVisitRequestId?: string | null,
) {
  if (targetVisitRequestId) {
    const targeted = visits.find((visit) => visit.id === targetVisitRequestId);
    if (targeted) return targeted;
  }

  return (
    visits.find((visit) => visit.status === LeadVisitRequestStatus.CONFIRMED) ??
    visits.find(
      (visit) =>
        visit.status === LeadVisitRequestStatus.COMPLETED &&
        (visit.outcome == null || visit.nextAction == null),
    ) ??
    visits.find(
      (visit) =>
        visit.status === LeadVisitRequestStatus.NO_SHOW &&
        (visit.outcome == null || visit.nextAction == null),
    ) ??
    null
  );
}

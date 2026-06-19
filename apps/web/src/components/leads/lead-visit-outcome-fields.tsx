"use client";

import {
  LeadVisitNextAction,
  LeadVisitOutcome,
} from "@prisma/client";
import {
  getAllowedNextActions,
} from "@/lib/scheduling/lead-visit-schedule-service";
import {
  formatLeadVisitNextActionLabel,
  formatLeadVisitOutcomeLabel,
} from "@/lib/scheduling/lead-visit-presentation";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const COMPLETION_OUTCOMES: LeadVisitOutcome[] = [
  LeadVisitOutcome.QUOTE_READY,
  LeadVisitOutcome.QUOTE_NEEDS_REVISION,
  LeadVisitOutcome.MISSING_INFORMATION,
  LeadVisitOutcome.FOLLOW_UP_NEEDED,
  LeadVisitOutcome.RESCHEDULE_NEEDED,
  LeadVisitOutcome.DISQUALIFIED,
];

const NO_SHOW_OUTCOMES: LeadVisitOutcome[] = [
  LeadVisitOutcome.CUSTOMER_NO_SHOW,
  LeadVisitOutcome.CONTRACTOR_MISSED,
];

export function LeadVisitOutcomeFields({
  mode,
  outcome,
  nextAction,
  onOutcomeChange,
  onNextActionChange,
}: {
  mode: "complete" | "no_show";
  outcome: LeadVisitOutcome | "";
  nextAction: LeadVisitNextAction | "";
  onOutcomeChange: (value: LeadVisitOutcome) => void;
  onNextActionChange: (value: LeadVisitNextAction) => void;
}) {
  const outcomes = mode === "no_show" ? NO_SHOW_OUTCOMES : COMPLETION_OUTCOMES;
  const allowedNextActions = outcome ? getAllowedNextActions(outcome) : [];

  return (
    <div className="space-y-3">
      <div>
        <label className={workspaceFormFieldLabelClass}>Outcome</label>
        <select
          className={workspaceFormControlClass}
          value={outcome}
          onChange={(event) => {
            const nextOutcome = event.target.value as LeadVisitOutcome;
            onOutcomeChange(nextOutcome);
            const allowed = getAllowedNextActions(nextOutcome);
            onNextActionChange(allowed[0] ?? ("" as LeadVisitNextAction));
          }}
        >
          <option value="">Select outcome</option>
          {outcomes.map((value) => (
            <option key={value} value={value}>
              {formatLeadVisitOutcomeLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={workspaceFormFieldLabelClass}>Next action</label>
        <select
          className={workspaceFormControlClass}
          value={nextAction}
          disabled={!outcome}
          onChange={(event) => onNextActionChange(event.target.value as LeadVisitNextAction)}
        >
          <option value="">Select next action</option>
          {allowedNextActions.map((value) => (
            <option key={value} value={value}>
              {formatLeadVisitNextActionLabel(value)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

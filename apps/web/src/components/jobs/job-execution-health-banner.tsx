import type { ExecutionHealthResult } from "@/lib/job-execution-health";

const toneClasses: Record<ExecutionHealthResult["severity"], string> = {
  normal: "border-border bg-surface text-foreground",
  blocker: "border-danger/30 bg-danger/[0.03] text-foreground",
  warning: "border-warning/30 bg-warning/[0.03] text-foreground",
};

type JobExecutionHealthBannerProps = {
  health: ExecutionHealthResult;
};

/**
 * Read-only execution health summary (Slice 1). Shown when EXECUTION_HEALTH_BANNER is enabled.
 */
export function JobExecutionHealthBanner({ health }: JobExecutionHealthBannerProps) {
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 ${toneClasses[health.severity]}`}
      data-testid="job-execution-health-banner"
      data-health-state={health.primaryState}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
        Job Status
      </p>
      <p className="mt-1 text-sm font-semibold">{health.headline}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">{health.detail}</p>
      {health.recommendedNextAction.type !== "none" && (
        <p className="mt-2 text-xs font-medium text-foreground">
          Suggested: {health.recommendedNextAction.label}
        </p>
      )}
      {!health.invariantSatisfied && (
        <p className="mt-2 text-xs font-medium text-danger">
          Needs review: no clear valid next action was identified. Check blockers, schedule, or task setup.
        </p>
      )}
    </div>
  );
}

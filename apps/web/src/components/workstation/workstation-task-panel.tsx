"use client";

import { useActionState } from "react";
import { JobTaskStatus } from "@prisma/client";
import { updateJobTaskStatusAction } from "@/app/(workspace)/jobs/job-task-actions";
import { CheckCircle2, Play, Loader2 } from "lucide-react";

export type WorkstationTaskPanelProps = {
  taskId: string;
  initialStatus: JobTaskStatus;
  instructions?: string | null;
};

export function WorkstationTaskPanel({
  taskId,
  initialStatus,
  instructions,
}: WorkstationTaskPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateJobTaskStatusAction.bind(null, taskId, JobTaskStatus.DONE),
    {},
  );

  const [startState, startAction, isStartPending] = useActionState(
    updateJobTaskStatusAction.bind(null, taskId, JobTaskStatus.IN_PROGRESS),
    {},
  );

  return (
    <div className="space-y-8">
      {instructions && (
        <div className="rounded-xl border border-border bg-foreground/[0.01] p-6">
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Task Instructions
          </h4>
          <p className="mt-3 text-base leading-relaxed text-foreground-muted">
            {instructions}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {initialStatus === JobTaskStatus.TODO && (
          <form action={startAction}>
            <button
              type="submit"
              disabled={isStartPending || isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-2.5 text-sm font-bold text-background transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {isStartPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              Start task
            </button>
          </form>
        )}

        {initialStatus !== JobTaskStatus.DONE && (
          <form action={formAction}>
            <button
              type="submit"
              disabled={isPending || isStartPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-border-strong hover:bg-foreground/[0.02] disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Mark complete
            </button>
          </form>
        )}

        {initialStatus === JobTaskStatus.DONE && (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-2 text-sm font-bold text-success">
            <CheckCircle2 className="size-4" />
            Task completed
          </div>
        )}
      </div>

      {(state.error || startState.error) && (
        <p className="rounded-lg bg-danger/10 px-4 py-2 text-xs font-bold text-danger">
          {state.error || startState.error}
        </p>
      )}
    </div>
  );
}

"use client";

import { Layers, ListTodo } from "lucide-react";

export type WorkstationJobPanelProps = {
  stageCount: number;
  taskCount: number;
  nextTaskTitle?: string | null;
};

export function WorkstationJobPanel({
  stageCount,
  taskCount,
  nextTaskTitle,
}: WorkstationJobPanelProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.015] p-3">
          <Layers className="size-5 text-foreground-subtle" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Stages
            </p>
            <p className="text-sm font-bold text-foreground">{stageCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-foreground/[0.015] p-3">
          <ListTodo className="size-5 text-foreground-subtle" />
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Active Tasks
            </p>
            <p className="text-sm font-bold text-foreground">{taskCount}</p>
          </div>
        </div>
      </div>

      {nextTaskTitle && (
        <div>
          <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            Next task
          </h4>
          <p className="mt-1 text-sm font-medium text-foreground">
            {nextTaskTitle}
          </p>
        </div>
      )}
    </div>
  );
}

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
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-foreground/[0.01] p-4 transition-colors hover:bg-foreground/[0.02]">
          <div className="rounded-lg bg-foreground/[0.03] p-2">
            <Layers className="size-5 text-foreground-subtle" />
          </div>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Stages
            </p>
            <p className="text-xl font-bold text-foreground">{stageCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-foreground/[0.01] p-4 transition-colors hover:bg-foreground/[0.02]">
          <div className="rounded-lg bg-foreground/[0.03] p-2">
            <ListTodo className="size-5 text-foreground-subtle" />
          </div>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Active Tasks
            </p>
            <p className="text-xl font-bold text-foreground">{taskCount}</p>
          </div>
        </div>
      </div>

      {nextTaskTitle && (
        <div className="rounded-xl border border-border bg-foreground/[0.01] p-6">
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Current priority task
          </h4>
          <p className="mt-2 text-lg font-bold leading-tight text-foreground">
            {nextTaskTitle}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  createJobWorkPackageAction,
  setTaskWorkPackageAction,
} from "@/app/(workspace)/jobs/job-work-package-actions";

type WorkPackageTask = {
  id: string;
  title: string;
  stageTitle: string;
  workPackageId: string | null;
  status: "TODO" | "DONE" | "CANCELED";
};

type WorkPackageRow = {
  id: string;
  title: string;
  workType: string | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  tasks: Array<{ id: string; status: "TODO" | "DONE" | "CANCELED" }>;
};

export function JobWorkPackagePanel({
  jobId,
  workPackages,
  tasks,
}: {
  jobId: string;
  workPackages: WorkPackageRow[];
  tasks: WorkPackageTask[];
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [workType, setWorkType] = useState("");
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const ungroupedTasks = useMemo(
    () => tasks.filter((task) => !task.workPackageId && task.status === "TODO"),
    [tasks],
  );

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((value) => value !== taskId)
        : [...previous, taskId],
    );
  };

  const taskCountByPackage = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    for (const task of tasks) {
      if (!task.workPackageId) continue;
      const current = map.get(task.workPackageId) ?? { total: 0, open: 0 };
      current.total += 1;
      if (task.status === "TODO") current.open += 1;
      map.set(task.workPackageId, current);
    }
    return map;
  }, [tasks]);

  return (
    <WorkspacePanel className="mb-6">
      <SectionHeading
        title="Work groups"
        description="Group related tasks so production work can be scheduled together and split across occurrences."
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          placeholder="Group title (for example: Solar installation)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          placeholder="Trade/work type (optional)"
          value={workType}
          onChange={(event) => setWorkType(event.target.value)}
        />
        <input
          type="date"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={plannedStartDate}
          onChange={(event) => setPlannedStartDate(event.target.value)}
        />
        <input
          type="date"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={plannedEndDate}
          onChange={(event) => setPlannedEndDate(event.target.value)}
        />
      </div>

      {ungroupedTasks.length > 0 ? (
        <div className="mb-4 rounded border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Add ungrouped tasks
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {ungroupedTasks.map((task) => (
              <label
                key={task.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-foreground-muted hover:bg-foreground/[0.03]"
              >
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                />
                <span>{task.title}</span>
                <span className="text-foreground-subtle">· {task.stageTitle}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        size="sm"
        disabled={!title.trim() || isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await createJobWorkPackageAction({
              jobId,
              title,
              workType: workType || null,
              plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
              plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
              taskIds: selectedTaskIds,
              source: "manual-job-panel",
            });
            if (result.error) {
              setMessage(result.error);
              return;
            }
            setMessage("Work group created.");
            setTitle("");
            setWorkType("");
            setPlannedStartDate("");
            setPlannedEndDate("");
            setSelectedTaskIds([]);
          })
        }
      >
        {isPending ? "Saving..." : "Create work group"}
      </Button>

      {message ? <p className="mt-2 text-xs text-foreground-muted">{message}</p> : null}

      <div className="mt-6 space-y-3">
        {workPackages.length === 0 ? (
          <p className="text-xs text-foreground-muted">No work groups yet.</p>
        ) : (
          workPackages.map((group) => {
            const counts = taskCountByPackage.get(group.id) ?? { total: 0, open: 0 };
            return (
              <div key={group.id} className="rounded border border-border bg-surface p-3">
                <p className="text-sm font-semibold text-foreground">{group.title}</p>
                <p className="text-xs text-foreground-muted">
                  {group.workType || "General"} · {counts.total} tasks · {counts.open} open
                </p>
                <p className="text-xs text-foreground-muted">
                  Planned:{" "}
                  {group.plannedStartDate
                    ? group.plannedStartDate.toLocaleDateString()
                    : "—"}{" "}
                  to{" "}
                  {group.plannedEndDate ? group.plannedEndDate.toLocaleDateString() : "—"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tasks
                    .filter((task) => task.workPackageId === group.id)
                    .slice(0, 6)
                    .map((task) => (
                      <span
                        key={task.id}
                        className="rounded bg-foreground/[0.05] px-2 py-1 text-[11px] text-foreground-muted"
                      >
                        {task.title}
                      </span>
                    ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {tasks.some((task) => task.workPackageId) ? (
        <div className="mt-4 rounded border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Reassign task
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {tasks
              .filter((task) => task.status === "TODO")
              .slice(0, 10)
              .map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-foreground-muted">{task.title}</span>
                  <select
                    className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                    value={task.workPackageId ?? ""}
                    onChange={(event) =>
                      startTransition(async () => {
                        await setTaskWorkPackageAction(
                          task.id,
                          event.target.value || null,
                        );
                      })
                    }
                  >
                    <option value="">Ungrouped</option>
                    {workPackages.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </WorkspacePanel>
  );
}

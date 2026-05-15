"use client";

import { useState, useTransition } from "react";
import { TaskTemplateCategory } from "@prisma/client";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  createRecoveryFlowAction,
  addRecoveryTaskAction,
  activateRecoveryFlowAction,
} from "@/app/(workspace)/jobs/recovery-actions";

type RecoveryTaskDraft = {
  id: string; // temporary local id
  title: string;
  category: TaskTemplateCategory;
  instructions: string;
};

export function RecoveryFlowBuilder({
  issueId,
  jobId,
  onSuccess,
  onCancel,
}: {
  issueId: string;
  jobId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [tasks, setTasks] = useState<RecoveryTaskDraft[]>([
    {
      id: Math.random().toString(36).substr(2, 9),
      title: "",
      category: TaskTemplateCategory.GENERAL,
      instructions: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  const addTask = () => {
    setTasks([
      ...tasks,
      {
        id: Math.random().toString(36).substr(2, 9),
        title: "",
        category: TaskTemplateCategory.GENERAL,
        instructions: "",
      },
    ]);
  };

  const removeTask = (id: string) => {
    if (tasks.length === 1) return;
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const updateTask = (id: string, updates: Partial<RecoveryTaskDraft>) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const moveTask = (index: number, direction: "up" | "down") => {
    const newTasks = [...tasks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tasks.length) return;
    [newTasks[index], newTasks[targetIndex]] = [newTasks[targetIndex], newTasks[index]];
    setTasks(newTasks);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (tasks.some((t) => !t.title.trim())) {
      setError("All tasks must have a title.");
      return;
    }

    startTransition(async () => {
      try {
        // 1. Create the flow
        const flowResult = await createRecoveryFlowAction({ jobIssueId: issueId });
        if (!flowResult.success || !flowResult.flowId) {
          throw new Error("Failed to create recovery flow.");
        }

        // 2. Add tasks
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          await addRecoveryTaskAction({
            flowId: flowResult.flowId,
            title: task.title,
            category: task.category,
            instructions: task.instructions,
            sortOrder: i * 10,
          });
        }

        // 3. Activate the flow
        await activateRecoveryFlowAction(flowResult.flowId);

        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-foreground">Build Recovery Flow</h3>
        <p className="text-xs text-foreground-muted">
          Define the steps needed to resolve this issue and resume the original path.
        </p>
      </div>

      <div className="space-y-4">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className="group relative rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground/5 text-[10px] font-bold text-foreground-subtle">
                  {index + 1}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                  Recovery Step
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => moveTask(index, "up")}
                  disabled={index === 0}
                  className="rounded p-1 text-foreground-subtle hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveTask(index, "down")}
                  disabled={index === tasks.length - 1}
                  className="rounded p-1 text-foreground-subtle hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  disabled={tasks.length === 1}
                  className="ml-1 rounded p-1 text-foreground-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                  Task Title
                </label>
                <input
                  required
                  value={task.title}
                  onChange={(e) => updateTask(task.id, { title: e.target.value })}
                  placeholder="e.g., Revise engineering plans"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                  Category
                </label>
                <select
                  value={task.category}
                  onChange={(e) =>
                    updateTask(task.id, { category: e.target.value as TaskTemplateCategory })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
                >
                  {Object.values(TaskTemplateCategory).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0) + cat.slice(1).toLowerCase().replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Instructions
              </label>
              <textarea
                value={task.instructions}
                onChange={(e) => updateTask(task.id, { instructions: e.target.value })}
                placeholder="What specifically needs to be done?"
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTask}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-xs font-bold text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
      >
        <Plus className="size-4" />
        Add another step
      </button>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creating Flow...
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              Activate Recovery Flow
            </>
          )}
        </button>
      </div>
    </form>
  );
}

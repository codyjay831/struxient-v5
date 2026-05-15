"use client";

import { useState, useTransition } from "react";
import { TaskTemplateCategory } from "@prisma/client";
import {
  Plus,
  Trash2,
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
  suggestRecoveryPathAction,
} from "@/app/(workspace)/jobs/recovery-actions";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIRecoveryProposal, AIRecoveryProposedTask } from "@/lib/ai/recovery-proposal-schema";

type RecoveryTaskDraft = {
  id: string; // temporary local id
  title: string;
  category: TaskTemplateCategory;
  instructions: string;
  checklist: { label: string }[];
  noteRequired: boolean;
  photoRequired: boolean;
  attachmentRequired: boolean;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  classification?: "FIELD" | "OFFICE" | "CUSTOMER" | "MATERIAL" | "PERMIT" | "INSPECTION";
  reasoning?: string;
};

export function RecoveryFlowBuilder({
  issueId,
  onSuccess,
  onCancel,
}: {
  issueId: string;
  jobId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [proposal, setProposal] = useState<AIRecoveryProposal | null>(null);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [tasks, setTasks] = useState<RecoveryTaskDraft[]>([
    {
      id: crypto.randomUUID(),
      title: "",
      category: TaskTemplateCategory.GENERAL,
      instructions: "",
      checklist: [],
      noteRequired: false,
      photoRequired: false,
      attachmentRequired: false,
      providesSignals: [],
      requiresSignals: [],
      hardSignal: false,
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setError(null);
    try {
      const res = await suggestRecoveryPathAction(issueId);
      setProposal(res.proposal);
      // Default all to selected
      setSelectedSuggestionIds(new Set(res.proposal.tasks.map(t => t.tempId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI suggestion.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const toggleSuggestion = (id: string) => {
    const next = new Set(selectedSuggestionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSuggestionIds(next);
  };

  const updateProposalTask = (tempId: string, updates: Partial<AIRecoveryProposedTask>) => {
    if (!proposal) return;
    setProposal({
      ...proposal,
      tasks: proposal.tasks.map(t => t.tempId === tempId ? { ...t, ...updates } : t)
    });
  };

  const addSelectedSuggestions = () => {
    if (!proposal) return;
    const selectedTasks = proposal.tasks
      .filter(t => selectedSuggestionIds.has(t.tempId))
      .map(t => ({
        id: crypto.randomUUID(),
        title: t.title,
        category: t.category,
        instructions: t.instructions || "",
        checklist: t.checklist.map(c => ({ label: c.label })),
        noteRequired: t.proofRequirements?.noteRequired ?? false,
        photoRequired: t.proofRequirements?.photoRequired ?? false,
        attachmentRequired: t.proofRequirements?.attachmentRequired ?? false,
        providesSignals: t.providesSignals || [],
        requiresSignals: t.requiresSignals || [],
        hardSignal: t.hardSignal || false,
        classification: t.classification,
        reasoning: t.reasoning,
      }));

    if (tasks.length === 1 && !tasks[0].title.trim()) {
      setTasks(selectedTasks);
    } else {
      setTasks([...tasks, ...selectedTasks]);
    }
    setProposal(null);
  };

  const addTask = () => {
    setTasks([
      ...tasks,
      {
        id: crypto.randomUUID(),
        title: "",
        category: TaskTemplateCategory.GENERAL,
        instructions: "",
        checklist: [],
        noteRequired: false,
        photoRequired: false,
        attachmentRequired: false,
        providesSignals: [],
        requiresSignals: [],
        hardSignal: false,
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
            completionRequirementsJson: {
              checklist: task.checklist,
              noteRequired: task.noteRequired,
              photoRequired: task.photoRequired,
              attachmentRequired: task.attachmentRequired,
            },
            providesSignals: task.providesSignals,
            requiresSignals: task.requiresSignals,
            hardSignal: task.hardSignal,
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Build Recovery Flow</h3>
          <p className="text-xs text-foreground-muted">
            Define the steps needed to resolve this issue and resume the original path.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={isSuggesting || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {isSuggesting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Sparkles className="size-3" />
          )}
          Suggest with AI
        </button>
      </div>

      {proposal && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-bold text-primary uppercase tracking-tight">AI Recovery Suggestions</h4>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProposal(null)}
                className="text-[10px] font-bold text-foreground-muted hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
          
          <p className="text-[10px] text-primary/80 mb-4 leading-relaxed italic">
            &quot;{proposal.summary}&quot;
          </p>

          <div className="space-y-2">
            {proposal.tasks.map((t, idx) => (
              <div key={t.tempId} className="bg-surface rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedSuggestionIds.has(t.tempId)}
                    onChange={() => toggleSuggestion(t.tempId)}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-foreground-subtle">#{idx + 1}</span>
                      <input
                        value={t.title}
                        onChange={(e) => updateProposalTask(t.tempId, { title: e.target.value })}
                        className="flex-1 bg-transparent text-xs font-semibold text-foreground focus:outline-none focus:ring-0"
                      />
                      <select
                        value={t.category}
                        onChange={(e) => updateProposalTask(t.tempId, { category: e.target.value as TaskTemplateCategory })}
                        className="bg-transparent text-[8px] border-none p-0 h-4 focus:ring-0"
                      >
                        {Object.values(TaskTemplateCategory).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={t.instructions || ""}
                      onChange={(e) => updateProposalTask(t.tempId, { instructions: e.target.value })}
                      className="w-full bg-transparent text-[10px] text-foreground-muted leading-relaxed focus:outline-none focus:ring-0"
                      rows={1}
                    />
                    {t.reasoning && (
                      <p className="text-[10px] text-primary/60 italic">
                        Reasoning: {t.reasoning}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={addSelectedSuggestions}
              disabled={selectedSuggestionIds.size === 0}
              className="rounded bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-contrast hover:opacity-90 disabled:opacity-50"
            >
              Add Selected Tasks ({selectedSuggestionIds.size})
            </button>
          </div>
        </div>
      )}

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
                  {task.classification || "Recovery Step"}
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

            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Checklist</p>
              <div className="space-y-2">
                {task.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={item.label}
                      onChange={(e) => {
                        const next = [...task.checklist];
                        next[idx].label = e.target.value;
                        updateTask(task.id, { checklist: next });
                      }}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                      placeholder="Checklist item label"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = task.checklist.filter((_, i) => i !== idx);
                        updateTask(task.id, { checklist: next });
                      }}
                      className="text-foreground-subtle hover:text-danger"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    updateTask(task.id, { checklist: [...task.checklist, { label: "" }] });
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                >
                  <Plus className="size-3" /> Add Item
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Requirements</p>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.noteRequired}
                      onChange={(e) => updateTask(task.id, { noteRequired: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Note
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.photoRequired}
                      onChange={(e) => updateTask(task.id, { photoRequired: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Photo
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.attachmentRequired}
                      onChange={(e) => updateTask(task.id, { attachmentRequired: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    File
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Signals</p>
                <div className="flex items-center gap-3">
                   <label className="flex items-center gap-2 text-xs text-foreground-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.hardSignal}
                      onChange={(e) => updateTask(task.id, { hardSignal: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Hard Blocker
                  </label>
                </div>
              </div>
            </div>

            {task.reasoning && (
              <div className="mt-4 rounded bg-foreground/[0.02] p-2">
                <p className="text-[10px] italic text-foreground-subtle">
                  AI Reasoning: {task.reasoning}
                </p>
              </div>
            )}
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

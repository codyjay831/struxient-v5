"use client";

import { useState } from "react";
import { 
  Sparkles, 
  X, 
  Check, 
  AlertTriangle, 
  Info, 
  Zap, 
  ListChecks, 
  Wrench, 
  ChevronRight,
  ChevronDown,
  Trash2,
  Plus
} from "lucide-react";
import { AILibraryProposal, AILibraryProposedTask } from "@/lib/ai/library-proposal-schema";
import { TaskTemplateCategory } from "@prisma/client";
import { getTaskTemplateCategoryLabel, taskTemplateCategorySelectOptions } from "@/lib/task-template-category";

const MAX_WARNING_CHARS = 280;

/**
 * Defense-in-depth: if upstream ever passes a raw JSON blob (e.g. a stringified
 * ZodError) into warnings, render a friendly summary instead of dumping it.
 */
function sanitizeWarning(raw: string): string {
  const text = (raw ?? "").toString().trim();
  if (!text) return "Unknown warning.";

  const looksLikeJsonBlob =
    (text.startsWith("[") || text.startsWith("{")) &&
    (text.includes('"code"') || text.includes('"path"') || text.includes('"message"'));

  if (looksLikeJsonBlob) {
    return "The AI provider returned a structured error. The plan was partially salvaged — please review tasks before applying.";
  }

  if (text.length > MAX_WARNING_CHARS) {
    return `${text.slice(0, MAX_WARNING_CHARS - 1)}…`;
  }

  return text;
}
import { 
  workspaceFormControlClass, 
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
  workspaceFormDangerButtonClass
} from "@/components/line-item-templates/line-item-template-form-fields";
import { toast } from "sonner";

const controlClass = workspaceFormControlClass;
const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

export function AILibraryProposalReviewPanel({
  proposal,
  stages,
  onApply,
  onClose,
}: {
  proposal: AILibraryProposal;
  stages: { id: string, name: string }[];
  onApply: (approvedProposal: AILibraryProposal) => Promise<void>;
  onClose: () => void;
}) {
  const [editedProposal, setEditedProposal] = useState<AILibraryProposal>(proposal);
  const [applying, setApplying] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleTaskExpansion = (tempId: string) => {
    const next = new Set(expandedTasks);
    if (next.has(tempId)) next.delete(tempId);
    else next.add(tempId);
    setExpandedTasks(next);
  };

  const updateTask = (tempId: string, updates: Partial<AILibraryProposedTask>) => {
    setEditedProposal({
      ...editedProposal,
      tasks: editedProposal.tasks.map(t => t.tempId === tempId ? { ...t, ...updates } : t)
    });
  };

  const removeTask = (tempId: string) => {
    setEditedProposal({
      ...editedProposal,
      tasks: editedProposal.tasks.filter(t => t.tempId !== tempId)
    });
  };

  const unmappedStageCount = editedProposal.tasks.filter((t) => !t.stageId).length;
  const canApply = editedProposal.tasks.length > 0 && unmappedStageCount === 0;

  const handleApply = async () => {
    if (editedProposal.tasks.length === 0) {
      toast.error("Add at least one task before applying.");
      return;
    }
    if (unmappedStageCount > 0) {
      toast.error(
        `${unmappedStageCount} ${unmappedStageCount === 1 ? "task needs" : "tasks need"} a stage before applying.`,
      );
      return;
    }
    setApplying(true);
    try {
      await onApply(editedProposal);
      toast.success("AI execution plan applied successfully.");
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to apply AI execution plan.");
    } finally {
      setApplying(false);
    }
  };

  // Group tasks by stage
  const tasksByStage: Record<string, AILibraryProposedTask[]> = {};
  editedProposal.tasks.forEach(task => {
    const stageName = task.stageName || "No Stage";
    if (!tasksByStage[stageName]) tasksByStage[stageName] = [];
    tasksByStage[stageName].push(task);
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-1.5">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">AI Execution Proposal</h2>
              <p className="text-xs text-foreground-muted">
                Review and refine the generated execution plan.
                {unmappedStageCount > 0 ? (
                  <span className="mt-1 block font-semibold text-danger-strong">
                    {unmappedStageCount} {unmappedStageCount === 1 ? "task needs" : "tasks need"} a stage
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-foreground/5 transition-colors">
            <X className="size-5 text-foreground-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Insights Section */}
          {(editedProposal.assumptions.length > 0 || editedProposal.warnings.length > 0) && (
            <div className="space-y-4">
              {editedProposal.warnings.length > 0 && (
                <div className="rounded-lg border border-danger/20 bg-danger/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-danger mb-2">
                    <AlertTriangle className="size-3.5" />
                    Warnings
                  </div>
                  <ul className="space-y-1">
                    {editedProposal.warnings.map((w, i) => (
                      <li key={i} className="text-sm text-danger-strong flex gap-2 break-words">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-danger" />
                        <span className="min-w-0 flex-1 break-words">{sanitizeWarning(w)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {editedProposal.assumptions.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-2">
                    <Info className="size-3.5" />
                    AI Assumptions
                  </div>
                  <ul className="space-y-1">
                    {editedProposal.assumptions.map((a, i) => (
                      <li key={i} className="text-sm text-primary-strong flex gap-2">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Tasks Section */}
          <div className="space-y-6">
            {Object.entries(tasksByStage).map(([stageName, tasks]) => (
              <div key={stageName} className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle flex items-center gap-2">
                  {stageName}
                  <span className="h-px flex-1 bg-border" />
                </h3>
                <ul className="space-y-3">
                  {tasks.map((task) => {
                    const isExpanded = expandedTasks.has(task.tempId);
                    return (
                      <li 
                        key={task.tempId} 
                        className={`rounded-xl border transition-all ${isExpanded ? 'border-primary/30 bg-primary/[0.02] shadow-sm' : 'border-border bg-background/50 hover:border-border-strong'}`}
                      >
                        <div className="flex items-start gap-3 p-4">
                          <button 
                            onClick={() => toggleTaskExpansion(task.tempId)}
                            className="mt-0.5 rounded p-1 hover:bg-foreground/5 transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="size-4 text-foreground-muted" /> : <ChevronRight className="size-4 text-foreground-muted" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-4">
                              <input 
                                type="text"
                                value={task.title}
                                onChange={(e) => updateTask(task.tempId, { title: e.target.value })}
                                className="w-full bg-transparent font-medium text-foreground focus:outline-none focus:ring-0"
                              />
                              <button 
                                onClick={() => removeTask(task.tempId)}
                                className="rounded p-1 text-foreground-subtle hover:bg-danger/10 hover:text-danger transition-colors"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {!task.stageId ? (
                                <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger-strong">
                                  Needs stage
                                </span>
                              ) : null}
                              <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
                                {getTaskTemplateCategoryLabel(task.category)}
                              </span>
                              {task.providesSignals.length > 0 && (
                                <span className="flex items-center gap-1 rounded bg-approved/10 px-1.5 py-0.5 text-[10px] font-bold text-approved-strong">
                                  <Zap className="size-2.5" />
                                  Provides: {task.providesSignals.join(", ")}
                                </span>
                              )}
                              {task.requiresSignals.length > 0 && (
                                <span className="flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-warning-strong">
                                  <Zap className="size-2.5" />
                                  Requires: {task.requiresSignals.join(", ")}
                                </span>
                              )}
                              {task.hardSignal && (
                                <span className="flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger-strong">
                                  <AlertTriangle className="size-2.5" />
                                  Hard Blocker
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border/50 p-4 pt-0 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="grid gap-4 sm:grid-cols-2 pt-4">
                              <label className="block">
                                <span className={fieldLabelClass}>Category</span>
                                <select 
                                  value={task.category}
                                  onChange={(e) => updateTask(task.tempId, { category: e.target.value as TaskTemplateCategory })}
                                  className={controlClass}
                                >
                                  {taskTemplateCategorySelectOptions().map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="block">
                                <span className={fieldLabelClass}>Stage</span>
                                <select 
                                  value={task.stageId || ""}
                                  onChange={(e) => {
                                    const s = stages.find(s => s.id === e.target.value);
                                    updateTask(task.tempId, { stageId: e.target.value || null, stageName: s?.name || null });
                                  }}
                                  className={controlClass}
                                >
                                  <option value="">(No stage)</option>
                                  {stages.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            
                            <label className="block">
                              <span className={fieldLabelClass}>Instructions</span>
                              <textarea 
                                rows={2}
                                value={task.instructions || ""}
                                onChange={(e) => updateTask(task.tempId, { instructions: e.target.value })}
                                className={controlClass}
                                placeholder="Task instructions..."
                              />
                            </label>

                            {task.reasoning && (
                              <div className="rounded-lg bg-foreground/[0.02] p-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle mb-1">AI Reasoning</p>
                                <p className="text-xs text-foreground-muted italic leading-relaxed">{task.reasoning}</p>
                              </div>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle flex items-center gap-1.5">
                                  <ListChecks className="size-3" />
                                  Checklist
                                </p>
                                {task.checklist.length > 0 ? (
                                  <ul className="space-y-1">
                                    {task.checklist.map((item, i) => (
                                      <li key={i} className="text-xs text-foreground-muted flex items-center gap-2">
                                        <div className="size-1 rounded-full bg-foreground-subtle" />
                                        {item.label}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[10px] italic text-foreground-subtle">No checklist items.</p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle flex items-center gap-1.5">
                                  <Wrench className="size-3" />
                                  Resources
                                </p>
                                {task.resources.length > 0 ? (
                                  <ul className="space-y-1">
                                    {task.resources.map((r, i) => (
                                      <li key={i} className="text-xs text-foreground-muted flex items-center gap-2">
                                        <div className="size-1 rounded-full bg-foreground-subtle" />
                                        {r.quantity}x {r.name}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[10px] italic text-foreground-subtle">No resources specified.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface-subtle p-6">
          <div className="flex items-center justify-between gap-4">
            <button 
              onClick={onClose}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button 
              onClick={handleApply}
              disabled={applying || !canApply}
              className={`${primaryButtonClass} flex-1 justify-center gap-2`}
            >
              {applying ? (
                <>Applying...</>
              ) : (
                <>
                  <Check className="size-4" />
                  Apply Approved Plan
                </>
              )}
            </button>
          </div>
          <p className="mt-4 text-center text-[10px] text-foreground-subtle">
            Applying will create {editedProposal.tasks.length} default execution tasks for this template.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function subscribeNoop() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}
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
  Loader2,
} from "lucide-react";
import { AILibraryProposal, AILibraryProposedTask } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { StaffRole, TaskTemplateCategory } from "@prisma/client";
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
    return "The AI provider returned a structured error. This plan cannot be applied.";
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
} from "@/components/line-item-templates/line-item-template-form-fields";
import { toast } from "sonner";

const controlClass = workspaceFormControlClass;
const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

type ApplyMode = "append" | "replace";

type AIProposalApplyOptions = {
  applyMode: ApplyMode;
  keepTaskIds: string[];
};

function getRoleLabel(role: StaffRole): string {
  if (role === StaffRole.OFFICE) return "Office";
  if (role === StaffRole.FIELD) return "Field";
  if (role === StaffRole.SUBCONTRACTOR) return "Subcontractor";
  if (role === StaffRole.OWNER) return "Owner";
  if (role === StaffRole.ADMIN) return "Admin";
  return "Viewer";
}

export function AILibraryProposalReviewPanel({
  proposal,
  generation,
  stages,
  lineLabel,
  planningContext,
  onPlanningContextChange,
  onGenerate,
  onRegenerate,
  isGenerating = false,
  isRegenerating = false,
  applyMode = "append",
  existingDraftTasks = [],
  selectedKeepTaskIds = [],
  onSelectedKeepTaskIdsChange,
  onApply,
  onClose,
}: {
  proposal?: AILibraryProposal | null;
  generation?: AILibraryProposalGenerationMeta;
  stages: { id: string, name: string }[];
  /** Line or preset label shown in the prelude header. */
  lineLabel?: string;
  planningContext?: string;
  onPlanningContextChange?: (value: string) => void;
  /** First-time generate from the context prelude. */
  onGenerate?: (ctx: { planningContext: string }) => Promise<void>;
  onRegenerate?: (ctx: { planningContext: string }) => Promise<void>;
  isGenerating?: boolean;
  isRegenerating?: boolean;
  applyMode?: ApplyMode;
  existingDraftTasks?: { id: string; title: string }[];
  selectedKeepTaskIds?: string[];
  onSelectedKeepTaskIdsChange?: (taskIds: string[]) => void;
  onApply: (
    approvedProposal: AILibraryProposal,
    options?: AIProposalApplyOptions,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const mounted = useIsClientMounted();
  const contextTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [editedProposal, setEditedProposal] = useState<AILibraryProposal | null>(proposal ?? null);
  const [applying, setApplying] = useState(false);
  const [regenerateAcknowledged, setRegenerateAcknowledged] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => {
    if (!proposal) return new Set();
    return new Set(
      proposal.tasks.filter((task) => !task.stageId).map((task) => task.tempId),
    );
  });
  const [prevProposal, setPrevProposal] = useState(proposal);

  if (proposal !== prevProposal) {
    setPrevProposal(proposal);
    setEditedProposal(proposal ?? null);
    setRegenerateAcknowledged(false);
    setExpandedTasks(
      new Set(
        proposal
          ? proposal.tasks.filter((task) => !task.stageId).map((task) => task.tempId)
          : [],
      ),
    );
  }

  const isPrelude = !editedProposal;
  const isReplaceMode = applyMode === "replace";
  const contextValue = planningContext ?? "";
  const missingContextItems = editedProposal?.missingContext ?? [];
  const isBusy = isGenerating || isRegenerating;
  const normalizedKeepTaskIds = useMemo(
    () => selectedKeepTaskIds.filter((id) => existingDraftTasks.some((task) => task.id === id)),
    [selectedKeepTaskIds, existingDraftTasks],
  );

  const toggleKeepTask = (taskId: string, checked: boolean) => {
    const current = new Set(normalizedKeepTaskIds);
    if (checked) {
      current.add(taskId);
    } else {
      current.delete(taskId);
    }
    onSelectedKeepTaskIdsChange?.([...current]);
  };

  const toggleTaskExpansion = (tempId: string) => {
    const next = new Set(expandedTasks);
    if (next.has(tempId)) next.delete(tempId);
    else next.add(tempId);
    setExpandedTasks(next);
  };

  const updateTask = (tempId: string, updates: Partial<AILibraryProposedTask>) => {
    setEditedProposal((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: current.tasks.map((t) =>
          t.tempId === tempId ? { ...t, ...updates } : t,
        ),
      };
    });
  };

  const removeTask = (tempId: string) => {
    setEditedProposal((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: current.tasks.filter((t) => t.tempId !== tempId),
      };
    });
  };

  const unmappedStageCount = editedProposal?.tasks.filter((t) => !t.stageId).length ?? 0;
  const unmappedTasks = editedProposal?.tasks.filter((t) => !t.stageId) ?? [];
  const generationAllowsApply = generation?.canApply !== false;
  const applyBlockedReason = generation?.applyBlockedReason;
  const isDemoOutput = generation?.isSimulated === true;
  const canApply =
    !!editedProposal &&
    generationAllowsApply &&
    editedProposal.tasks.length > 0 &&
    unmappedStageCount === 0;

  const didEditCurrentProposal = useMemo(() => {
    if (!editedProposal || !proposal) return false;
    const current = editedProposal.tasks.map((task) => ({
      tempId: task.tempId,
      title: task.title,
      stageId: task.stageId ?? null,
      category: task.category,
      instructions: task.instructions ?? null,
    }));
    const incoming = proposal.tasks.map((task) => ({
      tempId: task.tempId,
      title: task.title,
      stageId: task.stageId ?? null,
      category: task.category,
      instructions: task.instructions ?? null,
    }));
    return JSON.stringify(current) !== JSON.stringify(incoming);
  }, [editedProposal, proposal]);

  const appendToContext = (snippet: string) => {
    const trimmed = snippet.trim();
    if (!trimmed) return;
    const next = contextValue.trim()
      ? `${contextValue.trim()}\n${trimmed}`
      : trimmed;
    onPlanningContextChange?.(next);
    contextTextareaRef.current?.focus();
  };

  const runGenerate = async () => {
    if (!onGenerate) return;
    try {
      await onGenerate({ planningContext: contextValue });
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate AI execution plan.");
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    if (didEditCurrentProposal && !regenerateAcknowledged) {
      setRegenerateAcknowledged(true);
      return;
    }
    try {
      await onRegenerate({ planningContext: contextValue });
      toast.success("Plan updated with your context.");
      setRegenerateAcknowledged(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to regenerate AI proposal.");
    }
  };

  const handleApply = async () => {
    if (!editedProposal) return;
    if (!canApply) {
      toast.error(applyBlockedReason ?? "This AI execution plan cannot be applied.");
      return;
    }
    if (editedProposal.tasks.length === 0) {
      toast.error("Add at least one task before applying.");
      return;
    }
    setApplying(true);
    try {
      await onApply(editedProposal, {
        applyMode,
        keepTaskIds: normalizedKeepTaskIds,
      });
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
  editedProposal?.tasks.forEach((task) => {
    const stageName = task.stageName || "No Stage";
    if (!tasksByStage[stageName]) tasksByStage[stageName] = [];
    tasksByStage[stageName].push(task);
  });

  const planningContextBlock = (onPlanningContextChange || onGenerate || onRegenerate) ? (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          {isPrelude ? "Tell AI about this line" : "Add details or answer AI questions"}
        </p>
        <p className="mt-1 text-xs text-primary-strong">
          {isPrelude
            ? "Include site conditions, equipment specs, access notes, or anything the intake did not capture. You can refine after the first draft."
            : missingContextItems.length > 0
              ? "Answer the items below, then regenerate — or apply the plan as-is if the assumptions work."
              : "Update context and regenerate to refine the plan."}
        </p>
      </div>

      {!isPrelude && missingContextItems.length > 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-warning-strong">
            AI still needs
          </p>
          <ul className="space-y-2">
            {missingContextItems.map((item) => (
              <li key={item} className="flex flex-wrap items-start justify-between gap-2 text-sm text-warning-strong">
                <span className="min-w-0 flex-1 break-words">{item}</span>
                <button
                  type="button"
                  className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                  onClick={() => appendToContext(item)}
                >
                  Add to context
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <textarea
        ref={contextTextareaRef}
        value={contextValue}
        onChange={(event) => onPlanningContextChange?.(event.target.value)}
        rows={isPrelude ? 5 : 4}
        className={controlClass}
        placeholder="e.g. 200A panel, 40A breaker, charger in garage, 30 ft run through attic…"
      />

      {didEditCurrentProposal && !regenerateAcknowledged && onRegenerate ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
          Regenerating will replace your task edits in this panel. Click Regenerate again to confirm.
        </p>
      ) : null}

      {!isPrelude && onRegenerate ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={isBusy}
            className={secondaryButtonClass}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Regenerating…
              </>
            ) : didEditCurrentProposal && !regenerateAcknowledged ? (
              <>Confirm regenerate</>
            ) : (
              <>
                <Sparkles className="size-4" />
                Regenerate with AI
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const panel = (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-1.5">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isPrelude ? "Plan execution with AI" : "AI Execution Proposal"}
              </h2>
              <p className="text-xs text-foreground-muted">
                {lineLabel ? (
                  <span className="block truncate max-w-[18rem] font-medium text-foreground">{lineLabel}</span>
                ) : null}
                {isPrelude ? (
                  "Add context, then generate a draft execution plan."
                ) : (
                  <>
                    Review and refine before applying.
                    {unmappedStageCount > 0 ? (
                      <span className="mt-1 block font-semibold text-danger-strong">
                        {unmappedStageCount} {unmappedStageCount === 1 ? "task needs" : "tasks need"} a stage
                      </span>
                    ) : null}
                  </>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-foreground/5 transition-colors">
            <X className="size-5 text-foreground-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isPrelude ? (
            planningContextBlock
          ) : (
            <>
          {isDemoOutput ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-warning-strong mb-2">
                <AlertTriangle className="size-3.5" />
                Demo AI output
              </div>
              <p className="text-sm text-warning-strong">
                This plan was generated in demo mode, not by the live AI provider. Apply is disabled
                unless demo apply is explicitly enabled for this environment.
              </p>
            </div>
          ) : null}
          {!generationAllowsApply && applyBlockedReason ? (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-4">
              <p className="text-sm text-danger-strong">{applyBlockedReason}</p>
            </div>
          ) : null}

          {planningContextBlock}

          {isReplaceMode && existingDraftTasks.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface-subtle p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground-subtle">
                Keep existing tasks while replacing
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                By default, regenerate replaces all current draft tasks for this line.
              </p>
              <ul className="mt-3 space-y-2">
                {existingDraftTasks.map((task) => {
                  const checked = normalizedKeepTaskIds.includes(task.id);
                  return (
                    <li key={task.id}>
                      <label className="flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleKeepTask(task.id, event.target.checked)}
                        />
                        <span>{task.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Insights Section */}
          {editedProposal &&
          (editedProposal.assumptions.length > 0 ||
            editedProposal.warnings.length > 0 ||
            editedProposal.cleanupNotes.length > 0) && (
            <div className="space-y-4">
              {editedProposal.cleanupNotes.length > 0 && (
                <div className="rounded-lg border border-approved/20 bg-approved/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-approved-strong mb-2">
                    <Check className="size-3.5" />
                    What We Cleaned Up
                  </div>
                  <ul className="space-y-1">
                    {editedProposal.cleanupNotes.map((note, i) => (
                      <li key={i} className="text-sm text-foreground flex gap-2 break-words">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-approved-strong" />
                        <span className="min-w-0 flex-1 break-words">{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            {unmappedTasks.length > 0 ? (
              <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-danger-strong">
                  Fix {unmappedTasks.length} unmapped {unmappedTasks.length === 1 ? "stage" : "stages"}
                </p>
                <div className="space-y-2">
                  {unmappedTasks.map((task) => (
                    <div key={`fix-${task.tempId}`} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <p className="text-xs text-foreground">{task.title}</p>
                      <select
                        value={task.stageId || ""}
                        onChange={(e) => {
                          const selected = stages.find((s) => s.id === e.target.value);
                          updateTask(task.tempId, {
                            stageId: e.target.value || null,
                            stageName: selected?.name ?? null,
                          });
                        }}
                        className={controlClass}
                      >
                        <option value="">Select a stage</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
                              {!task.stageId ? (
                                <label className="inline-flex items-center gap-1 rounded border border-danger/30 bg-background/80 px-1.5 py-0.5 text-[10px]">
                                  <span className="font-bold uppercase tracking-wider text-danger-strong">Stage</span>
                                  <select
                                    value={task.stageId || ""}
                                    onChange={(e) => {
                                      const s = stages.find((stage) => stage.id === e.target.value);
                                      updateTask(task.tempId, {
                                        stageId: e.target.value || null,
                                        stageName: s?.name || null,
                                      });
                                    }}
                                    className="bg-transparent text-[10px] text-foreground focus:outline-none"
                                  >
                                    <option value="">Select</option>
                                    {stages.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <span className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
                                {getTaskTemplateCategoryLabel(task.category)}
                              </span>
                              {task.assigneeRole ? (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-strong">
                                  {getRoleLabel(task.assigneeRole)}
                                </span>
                              ) : null}
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface-subtle p-6">
          {isPrelude ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <button onClick={onClose} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void runGenerate()}
                  disabled={isBusy || !onGenerate}
                  className={`${primaryButtonClass} flex-1 justify-center gap-2`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Generate execution plan
                    </>
                  )}
                </button>
              </div>
              <p className="mt-4 text-center text-[10px] text-foreground-subtle">
                Context is optional — you can add more after the first draft.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <button onClick={onClose} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button
                  onClick={() => void handleApply()}
                  disabled={applying || !canApply}
                  className={`${primaryButtonClass} flex-1 justify-center gap-2`}
                >
                  {applying ? (
                    <>Applying...</>
                  ) : (
                    <>
                      <Check className="size-4" />
                      {missingContextItems.length > 0 ? "Apply with assumptions" : "Apply approved plan"}
                    </>
                  )}
                </button>
              </div>
              <p className="mt-4 text-center text-[10px] text-foreground-subtle">
                {canApply
                  ? isReplaceMode
                    ? `Applying will replace this line's draft execution with ${editedProposal?.tasks.length ?? 0} AI task${editedProposal?.tasks.length === 1 ? "" : "s"} and keep ${normalizedKeepTaskIds.length} existing task${normalizedKeepTaskIds.length === 1 ? "" : "s"}.`
                    : missingContextItems.length > 0
                      ? `Applying will create ${editedProposal?.tasks.length ?? 0} task${editedProposal?.tasks.length === 1 ? "" : "s"}. Open questions above are optional — add context and regenerate if you want a tighter plan.`
                      : `Applying will create ${editedProposal?.tasks.length ?? 0} execution task${editedProposal?.tasks.length === 1 ? "" : "s"}.`
                  : applyBlockedReason ??
                    (unmappedStageCount > 0
                      ? "Assign a stage to every task before applying."
                      : "This plan cannot be applied.")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(panel, document.body);
}

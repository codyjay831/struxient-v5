"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import type {
  ClarificationQuestionSetProposal,
} from "@/lib/ai/clarification-question-set-proposal-schema";
import {
  archiveClarificationQuestionSetAction,
  createClarificationQuestionSetAction,
  createQuestionSetFromProposalAction,
  generateClarificationQuestionSetProposalAction,
  saveClarificationQuestionSetAction,
} from "@/app/(workspace)/settings/scope-library/clarification-actions";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { toast } from "sonner";

type SetStatus = "draft" | "active" | "archived" | "merged";
type InputType =
  | "single_choice"
  | "multi_choice"
  | "yes_no_unknown"
  | "short_text"
  | "number"
  | "notes";

type EditableOption = {
  key: string;
  label: string;
  aliases: string[];
};

type EditableQuestion = {
  key: string;
  label: string;
  inputType: InputType;
  helpText: string;
  allowOther: boolean;
  unit: string;
  customerFacing: boolean;
  aliases: string[];
  options: EditableOption[];
};

type EditableSet = {
  id: string;
  key: string;
  version: number;
  label: string;
  status: SetStatus;
  description: string;
  aliases: string[];
  keywords: string[];
  mergedIntoKey: string;
  tagIds: string[];
  questions: EditableQuestion[];
};

type TagRow = { id: string; name: string };

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(values: string[]): string {
  return values.join(", ");
}

function cloneSet(set: EditableSet): EditableSet {
  return JSON.parse(JSON.stringify(set));
}

export function ClarificationLibraryPanel({
  initialSets,
  availableTags,
}: {
  initialSets: EditableSet[];
  availableTags: TagRow[];
}) {
  const [sets, setSets] = useState<EditableSet[]>(initialSets);
  const [activeSetId, setActiveSetId] = useState<string | null>(initialSets[0]?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [proposal, setProposal] = useState<ClarificationQuestionSetProposal | null>(null);
  const [proposalText, setProposalText] = useState("");
  const [proposalMissingContext, setProposalMissingContext] = useState("");

  const activeSet = useMemo(
    () => sets.find((set) => set.id === activeSetId) ?? null,
    [sets, activeSetId],
  );

  const setDraft = (next: EditableSet) => {
    setSets((prev) => prev.map((set) => (set.id === next.id ? next : set)));
  };

  const handleCreateSet = async () => {
    const label = window.prompt("New question set label");
    if (!label?.trim()) return;
    setIsCreating(true);
    const result = await createClarificationQuestionSetAction({ label });
    setIsCreating(false);
    if (result.error || !result.setId) {
      toast.error(result.error ?? "Failed to create set.");
      return;
    }
    const created: EditableSet = {
      id: result.setId,
      key: label.toLowerCase().replace(/\s+/g, "."),
      version: 1,
      label,
      status: "draft",
      description: "",
      aliases: [],
      keywords: [],
      mergedIntoKey: "",
      tagIds: [],
      questions: [],
    };
    setSets((prev) => [created, ...prev]);
    setActiveSetId(created.id);
    toast.success("Question set created.");
  };

  const handleSave = async () => {
    if (!activeSet) return;
    setIsSaving(true);
    const result = await saveClarificationQuestionSetAction({
      setId: activeSet.id,
      payload: {
        key: activeSet.key,
        label: activeSet.label,
        status: activeSet.status,
        description: activeSet.description || null,
        aliases: activeSet.aliases,
        keywords: activeSet.keywords,
        mergedIntoKey: activeSet.mergedIntoKey || null,
        tagIds: activeSet.tagIds,
        questions: activeSet.questions.map((q) => ({
          ...q,
          helpText: q.helpText || null,
          unit: q.unit || null,
        })),
      },
    });
    setIsSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.versionBumped && result.setId) {
      setSets((prev) =>
        prev.map((set) =>
          set.id === activeSet.id
            ? {
                ...set,
                id: result.setId!,
                version: set.version + 1,
              }
            : set,
        ),
      );
      setActiveSetId(result.setId);
      toast.success("Saved as new version.");
      return;
    }
    toast.success("Question set saved.");
  };

  const handleArchive = async () => {
    if (!activeSet) return;
    const result = await archiveClarificationQuestionSetAction(activeSet.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSets((prev) => prev.map((set) => (set.id === activeSet.id ? { ...set, status: "archived" } : set)));
    toast.success("Question set archived.");
  };

  const handleGenerateProposal = async () => {
    if (!proposalText.trim()) {
      toast.error("Enter line text first.");
      return;
    }
    setIsGenerating(true);
    const result = await generateClarificationQuestionSetProposalAction({
      lineText: proposalText.trim(),
      missingContext: csvToList(proposalMissingContext),
    });
    setIsGenerating(false);
    if (result.error || !result.proposal) {
      toast.error(result.error ?? "Failed to generate proposal.");
      return;
    }
    setProposal(result.proposal);
    toast.success("AI proposal ready. Review and create.");
  };

  const handleCreateFromProposal = async () => {
    if (!proposal) return;
    const result = await createQuestionSetFromProposalAction({ proposal });
    if (result.error || !result.setId) {
      toast.error(result.error ?? "Failed to create from proposal.");
      return;
    }
    const created: EditableSet = {
      id: result.setId,
      key: proposal.key,
      version: 1,
      label: proposal.label,
      status: "draft",
      description: proposal.description ?? "",
      aliases: proposal.aliases,
      keywords: proposal.keywords,
      mergedIntoKey: "",
      tagIds: [],
      questions: proposal.questions.map((question) => ({
        key: question.key,
        label: question.label,
        inputType: question.inputType,
        helpText: question.helpText ?? "",
        allowOther: question.allowOther ?? false,
        unit: question.unit ?? "",
        customerFacing: question.customerFacing ?? false,
        aliases: question.aliases ?? [],
        options: (question.options ?? []).map((option) => ({
          key: option.key,
          label: option.label,
          aliases: option.aliases ?? [],
        })),
      })),
    };
    setSets((prev) => [created, ...prev]);
    setActiveSetId(created.id);
    setProposal(null);
    toast.success("Created draft from AI proposal.");
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-foreground-subtle">
          AI question-set assist
        </p>
        <textarea
          rows={3}
          className={controlClass}
          value={proposalText}
          onChange={(event) => setProposalText(event.target.value)}
          placeholder="Paste line description, notes, or execution gaps"
        />
        <input
          className={controlClass}
          value={proposalMissingContext}
          onChange={(event) => setProposalMissingContext(event.target.value)}
          placeholder="Optional missingContext CSV"
        />
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            className={`${secondaryButtonClass} w-full sm:w-auto`}
            onClick={() => void handleGenerateProposal()}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate set
          </button>
          {proposal ? (
            <button
              type="button"
              className={`${primaryButtonClass} w-full sm:w-auto`}
              onClick={() => void handleCreateFromProposal()}
            >
              Create draft from proposal
            </button>
          ) : null}
        </div>
        {proposal ? (
          <p className="text-xs text-foreground-muted">
            Proposal: <span className="font-medium text-foreground">{proposal.label}</span> ({proposal.questions.length} questions)
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-border bg-surface p-3 space-y-2">
          <button
            type="button"
            className={`${primaryButtonClass} w-full`}
            onClick={() => void handleCreateSet()}
            disabled={isCreating}
          >
            <Plus className="size-4" />
            New set
          </button>
          <ul className="space-y-1 max-h-[560px] overflow-auto">
            {sets.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  className={[
                    "w-full rounded border px-2 py-2 text-left text-xs",
                    set.id === activeSetId
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border text-foreground-muted hover:text-foreground",
                  ].join(" ")}
                  onClick={() => setActiveSetId(set.id)}
                >
                  <p className="font-medium">{set.label}</p>
                  <p className="text-[10px] uppercase tracking-wider">{set.key} v{set.version}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-lg border border-border bg-surface p-4">
          {!activeSet ? (
            <p className="text-sm text-foreground-muted">Select or create a question set.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className={fieldLabelClass}>Label</span>
                  <input
                    className={controlClass}
                    value={activeSet.label}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), label: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Key</span>
                  <input
                    className={controlClass}
                    value={activeSet.key}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), key: event.target.value })}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className={fieldLabelClass}>Description</span>
                  <textarea
                    rows={2}
                    className={controlClass}
                    value={activeSet.description}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), description: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Status</span>
                  <select
                    className={controlClass}
                    value={activeSet.status}
                    onChange={(event) =>
                      setDraft({ ...cloneSet(activeSet), status: event.target.value as SetStatus })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="merged">Merged</option>
                  </select>
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Merged Into Key</span>
                  <input
                    className={controlClass}
                    value={activeSet.mergedIntoKey}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), mergedIntoKey: event.target.value })}
                    placeholder="required when status=merged"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className={fieldLabelClass}>Aliases (CSV)</span>
                  <input
                    className={controlClass}
                    value={listToCsv(activeSet.aliases)}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), aliases: csvToList(event.target.value) })}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className={fieldLabelClass}>Keywords (CSV)</span>
                  <input
                    className={controlClass}
                    value={listToCsv(activeSet.keywords)}
                    onChange={(event) => setDraft({ ...cloneSet(activeSet), keywords: csvToList(event.target.value) })}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className={fieldLabelClass}>Tags</span>
                  <select
                    multiple
                    className={`${controlClass} h-28`}
                    value={activeSet.tagIds}
                    onChange={(event) =>
                      setDraft({
                        ...cloneSet(activeSet),
                        tagIds: [...event.currentTarget.selectedOptions].map((option) => option.value),
                      })
                    }
                  >
                    {availableTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-subtle">
                    Questions
                  </p>
                  <button
                    type="button"
                    className={`${secondaryButtonClass} w-full sm:w-auto`}
                    onClick={() =>
                      setDraft({
                        ...cloneSet(activeSet),
                        questions: [
                          ...activeSet.questions,
                          {
                            key: "new.question",
                            label: "New question",
                            inputType: "single_choice",
                            helpText: "",
                            allowOther: false,
                            unit: "",
                            customerFacing: false,
                            aliases: [],
                            options: [{ key: "option", label: "Option", aliases: [] }],
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" />
                    Add question
                  </button>
                </div>
                <ul className="space-y-3">
                  {activeSet.questions.map((question, qIndex) => (
                    <li key={`${question.key}-${qIndex}`} className="rounded border border-border p-3 space-y-2">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          className={controlClass}
                          value={question.label}
                          onChange={(event) => {
                            const next = cloneSet(activeSet);
                            next.questions[qIndex].label = event.target.value;
                            setDraft(next);
                          }}
                          placeholder="Question label"
                        />
                        <input
                          className={controlClass}
                          value={question.key}
                          onChange={(event) => {
                            const next = cloneSet(activeSet);
                            next.questions[qIndex].key = event.target.value;
                            setDraft(next);
                          }}
                          placeholder="question.key"
                        />
                        <select
                          className={controlClass}
                          value={question.inputType}
                          onChange={(event) => {
                            const next = cloneSet(activeSet);
                            next.questions[qIndex].inputType = event.target.value as InputType;
                            setDraft(next);
                          }}
                        >
                          <option value="single_choice">single_choice</option>
                          <option value="multi_choice">multi_choice</option>
                          <option value="yes_no_unknown">yes_no_unknown</option>
                          <option value="short_text">short_text</option>
                          <option value="number">number</option>
                          <option value="notes">notes</option>
                        </select>
                        <input
                          className={controlClass}
                          value={question.unit}
                          onChange={(event) => {
                            const next = cloneSet(activeSet);
                            next.questions[qIndex].unit = event.target.value;
                            setDraft(next);
                          }}
                          placeholder="unit (optional)"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-foreground-muted">
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={question.allowOther}
                            onChange={(event) => {
                              const next = cloneSet(activeSet);
                              next.questions[qIndex].allowOther = event.target.checked;
                              setDraft(next);
                            }}
                          />
                          allow other
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={question.customerFacing}
                            onChange={(event) => {
                              const next = cloneSet(activeSet);
                              next.questions[qIndex].customerFacing = event.target.checked;
                              setDraft(next);
                            }}
                          />
                          customer-facing
                        </label>
                      </div>
                      {(question.inputType === "single_choice" ||
                        question.inputType === "multi_choice" ||
                        question.inputType === "yes_no_unknown") ? (
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-wider text-foreground-subtle">Options</p>
                          {question.options.map((option, optionIdx) => (
                            <div key={`${option.key}-${optionIdx}`} className="grid gap-2 md:grid-cols-2">
                              <input
                                className={controlClass}
                                value={option.label}
                                onChange={(event) => {
                                  const next = cloneSet(activeSet);
                                  next.questions[qIndex].options[optionIdx].label = event.target.value;
                                  setDraft(next);
                                }}
                                placeholder="Option label"
                              />
                              <input
                                className={controlClass}
                                value={option.key}
                                onChange={(event) => {
                                  const next = cloneSet(activeSet);
                                  next.questions[qIndex].options[optionIdx].key = event.target.value;
                                  setDraft(next);
                                }}
                                placeholder="option.key"
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  className={`${primaryButtonClass} w-full sm:w-auto`}
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save set
                </button>
                <button
                  type="button"
                  className={`${secondaryButtonClass} w-full sm:w-auto`}
                  onClick={() => void handleArchive()}
                >
                  Archive
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

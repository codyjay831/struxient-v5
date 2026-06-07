"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import type {
  ClarificationAnswer,
  ClarificationAnswerValue,
  ClarificationQuestion,
  LineClarificationAnswers,
} from "@/lib/clarification/clarification-types";
import {
  buildClarificationAnswer,
  isAnswerProvided,
  lineClarificationAnswersToAnswerMap,
  validateAnswerValue,
} from "@/lib/clarification/clarification-answers";
import type {
  ClarificationAnswerGenerationMeta,
  ClarificationAnswerProposal,
} from "@/lib/ai/clarification-answer-proposal-schema";
import type { ClarificationQuestionSetProposal } from "@/lib/ai/clarification-question-set-proposal-schema";
import {
  draftHasBlockingErrors,
  validateClarificationSetDraft,
} from "@/lib/clarification/clarification-draft-validation";
import {
  CLARIFICATION_TRADE_PRESETS,
  type ClarificationTradePreset,
} from "@/lib/clarification/clarification-trade-presets";
import type {
  ClarificationSetOption,
} from "@/app/(workspace)/quotes/quote-line-clarification-types";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const OTHER_KEY = "__other__";

function subscribeNoop() {
  return () => {};
}
function useIsClientMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export type ClarifyScopeQuestionSet = {
  key: string;
  version: number;
  label: string;
  description?: string;
  questions: ClarificationQuestion[];
};

type DraftInputType =
  | "single_choice"
  | "multi_choice"
  | "yes_no_unknown"
  | "short_text"
  | "number"
  | "notes";

type DraftOption = {
  key: string;
  label: string;
  aliases: string[];
};

type DraftQuestion = {
  key: string;
  label: string;
  inputType: DraftInputType;
  helpText: string;
  allowOther: boolean;
  unit: string;
  customerFacing: boolean;
  aliases: string[];
  options: DraftOption[];
};

export type ClarificationSetDraftPayload = {
  key: string;
  label: string;
  description: string;
  aliases: string[];
  keywords: string[];
  questions: DraftQuestion[];
  attachToTemplateTags: boolean;
  activateNow: boolean;
};

export type ClarifyScopePanelProps = {
  open: boolean;
  onClose: () => void;
  lineDescription: string;
  questionSet: ClarifyScopeQuestionSet | null;
  savedAnswers: LineClarificationAnswers | null;
  alternatives: ClarificationSetOption[];
  isLoading: boolean;
  onSelectAlternative: (setKey: string) => void;
  aiProposal: ClarificationAnswerProposal | null;
  aiGeneration: ClarificationAnswerGenerationMeta | null;
  isSuggesting: boolean;
  onSuggest: () => Promise<void>;
  isGeneratingSet: boolean;
  onGenerateSet: () => Promise<ClarificationQuestionSetProposal | null>;
  isCreatingSet: boolean;
  onCreateSet: (payload: ClarificationSetDraftPayload) => Promise<void>;
  isUpdatingSet: boolean;
  onUpdateSet: (
    setKey: string,
    setVersion: number,
    payload: Pick<ClarificationSetDraftPayload, "questions">,
  ) => Promise<boolean>;
  checkSetKey?: (
    key: string,
  ) => Promise<{ existing?: { label: string; latestVersion: number }; error?: string }>;
  isApplying: boolean;
  onApply: (answers: LineClarificationAnswers) => Promise<void>;
};

type AnswerMap = Record<string, ClarificationAnswerValue>;

function chipClass(active: boolean): string {
  return [
    "rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[40px]",
    active
      ? "border-primary bg-primary/15 text-primary"
      : "border-border bg-surface text-foreground-muted hover:border-border-strong",
  ].join(" ");
}

export function ClarifyScopePanel({
  open,
  onClose,
  lineDescription,
  questionSet,
  savedAnswers,
  alternatives,
  isLoading,
  onSelectAlternative,
  aiProposal,
  aiGeneration,
  isSuggesting,
  onSuggest,
  isGeneratingSet,
  onGenerateSet,
  isCreatingSet,
  onCreateSet,
  isUpdatingSet,
  onUpdateSet,
  checkSetKey,
  isApplying,
  onApply,
}: ClarifyScopePanelProps) {
  const mounted = useIsClientMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [error, setError] = useState<string | null>(null);
  const [setDraftError, setSetDraftError] = useState<string | null>(null);
  const [draftSet, setDraftSet] = useState<ClarificationSetDraftPayload | null>(null);
  const [existingSetKey, setExistingSetKey] = useState<{
    label: string;
    latestVersion: number;
  } | null>(null);
  const [isEditingExistingSet, setIsEditingExistingSet] = useState(false);
  const [prevSetKey, setPrevSetKey] = useState<string | null>(null);
  const [prevProposal, setPrevProposal] = useState<ClarificationAnswerProposal | null>(null);

  const canClose = !isApplying;

  // Reset / hydrate answers when the question set changes.
  const currentSetKey = questionSet?.key ?? null;
  const currentSetVersion = questionSet?.version ?? null;
  const savedKey = savedAnswers?.questionSetKey ?? null;
  const savedVersion = savedAnswers?.questionSetVersion ?? null;
  const setIdentity =
    currentSetKey && currentSetVersion != null
      ? `${currentSetKey}@${currentSetVersion}`
      : null;
  if (setIdentity !== prevSetKey) {
    setPrevSetKey(setIdentity);
    const canHydrate =
      savedAnswers &&
      currentSetKey === savedKey &&
      currentSetVersion === savedVersion;
    setAnswers((prev) => {
      if (canHydrate && savedAnswers) {
        return lineClarificationAnswersToAnswerMap(savedAnswers);
      }
      if (
        prevSetKey &&
        currentSetKey &&
        prevSetKey.startsWith(`${currentSetKey}@`) &&
        questionSet
      ) {
        const validKeys = new Set(questionSet.questions.map((q) => q.key));
        const next: AnswerMap = {};
        for (const [answerKey, value] of Object.entries(prev)) {
          if (validKeys.has(answerKey)) next[answerKey] = value;
        }
        return next;
      }
      return {};
    });
    setError(null);
    setPrevProposal(null);
    if (currentSetKey && !isEditingExistingSet) {
      setDraftSet(null);
      setSetDraftError(null);
    }
  }

  // Merge AI suggestions into local answers once per new proposal.
  if (aiProposal && aiProposal !== prevProposal && questionSet) {
    setPrevProposal(aiProposal);
    const questionsByKey = new Map(questionSet.questions.map((q) => [q.key, q]));
    setAnswers((prev) => {
      const next: AnswerMap = { ...prev };
      for (const suggestion of aiProposal.suggestions) {
        const question = questionsByKey.get(suggestion.questionKey);
        if (!question) continue;
        if (suggestion.unknown) {
          next[question.key] = { kind: "unknown" };
          continue;
        }
        if (suggestion.optionKeys.length > 0) {
          next[question.key] = {
            kind: "choice",
            optionKeys: suggestion.optionKeys,
            otherText: suggestion.text ?? null,
          };
          continue;
        }
        if (
          (question.inputType === "short_text" || question.inputType === "notes") &&
          suggestion.text
        ) {
          next[question.key] = { kind: "text", text: suggestion.text };
          continue;
        }
        if (question.inputType === "number" && typeof suggestion.number === "number") {
          next[question.key] = { kind: "number", value: suggestion.number, unit: question.unit };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(event: Event) {
      if (!canClose) {
        event.preventDefault();
        return;
      }
      onClose();
    }
    function handleClose() {
      if (open) onClose();
    }
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [canClose, onClose, open]);

  const setChoice = (question: ClarificationQuestion, optionKey: string) => {
    setAnswers((prev) => {
      const existing = prev[question.key];
      const isMulti = question.inputType === "multi_choice";
      const currentKeys =
        existing?.kind === "choice" ? existing.optionKeys : ([] as string[]);
      const existingOther = existing?.kind === "choice" ? existing.otherText : null;

      let nextKeys: string[];
      if (isMulti) {
        nextKeys = currentKeys.includes(optionKey)
          ? currentKeys.filter((k) => k !== optionKey)
          : [...currentKeys, optionKey];
      } else {
        nextKeys = currentKeys.includes(optionKey) ? [] : [optionKey];
      }

      if (nextKeys.length === 0) {
        const { [question.key]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return {
        ...prev,
        [question.key]: { kind: "choice", optionKeys: nextKeys, otherText: existingOther },
      };
    });
  };

  const setUnknown = (question: ClarificationQuestion) => {
    setAnswers((prev) => {
      if (prev[question.key]?.kind === "unknown") {
        const { [question.key]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [question.key]: { kind: "unknown" } };
    });
  };

  const setOtherText = (question: ClarificationQuestion, text: string) => {
    setAnswers((prev) => {
      const existing = prev[question.key];
      const currentKeys =
        existing?.kind === "choice" ? existing.optionKeys : ([] as string[]);
      const withOther = currentKeys.includes(OTHER_KEY)
        ? currentKeys
        : [...currentKeys, OTHER_KEY];
      return {
        ...prev,
        [question.key]: { kind: "choice", optionKeys: withOther, otherText: text },
      };
    });
  };

  const setText = (question: ClarificationQuestion, text: string) => {
    setAnswers((prev) => {
      if (!text.trim()) {
        const { [question.key]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [question.key]: { kind: "text", text } };
    });
  };

  const setNumber = (question: ClarificationQuestion, raw: string) => {
    setAnswers((prev) => {
      const value = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(value)) {
        const { [question.key]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [question.key]: { kind: "number", value, unit: question.unit } };
    });
  };

  const csvToList = (value: string): string[] =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const listToCsv = (values: string[]): string => values.join(", ");

  const normalizeKey = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/_{2,}/g, "_");

  const applyProposalToDraft = (proposal: ClarificationQuestionSetProposal) => {
    setExistingSetKey(null);
    setDraftSet({
      key: proposal.key,
      label: proposal.label,
      description: proposal.description ?? "",
      aliases: proposal.aliases ?? [],
      keywords: proposal.keywords ?? [],
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
      attachToTemplateTags: true,
      activateNow: true,
    });
  };

  const applyTradePreset = (preset: ClarificationTradePreset) => {
    setSetDraftError(null);
    setExistingSetKey(null);
    setDraftSet({
      key: preset.draft.key,
      label: preset.draft.label,
      description: preset.draft.description,
      aliases: preset.draft.aliases,
      keywords: preset.draft.keywords,
      questions: preset.draft.questions.map((question) => ({
        key: question.key,
        label: question.label,
        inputType: question.inputType as DraftInputType,
        helpText: "",
        allowOther: false,
        unit: "",
        customerFacing: !(
          question.key.includes("permit") ||
          question.key.includes("utility") ||
          question.key.includes("electrical_upgrade") ||
          question.key.includes("decking")
        ),
        aliases: [],
        options: (question.options ?? []).map((option) => ({
          key: option.key,
          label: option.label,
          aliases: [],
        })),
      })),
      attachToTemplateTags: true,
      activateNow: true,
    });
  };

  const normalizedDraftPayload = useMemo(() => {
    if (!draftSet) return null;
    return {
      ...draftSet,
      key: normalizeKey(draftSet.key || draftSet.label.replace(/\s+/g, ".")),
      label: draftSet.label.trim(),
      description: draftSet.description.trim(),
      questions: draftSet.questions.map((question) => ({
        ...question,
        key: normalizeKey(question.key || question.label),
        label: question.label.trim(),
        options: question.options.map((option) => ({
          ...option,
          key: normalizeKey(option.key || option.label),
          label: option.label.trim(),
        })),
      })),
    };
  }, [draftSet]);

  const draftValidationIssues = useMemo(() => {
    if (!normalizedDraftPayload) return [];
    return validateClarificationSetDraft(
      {
        key: normalizedDraftPayload.key,
        label: normalizedDraftPayload.label,
        questions: normalizedDraftPayload.questions.map((question) => ({
          key: question.key,
          label: question.label,
          inputType: question.inputType,
          options: question.options,
        })),
      },
      existingSetKey ? { existingSetKey } : undefined,
    );
  }, [normalizedDraftPayload, existingSetKey]);

  const draftBlockingErrors = draftHasBlockingErrors(draftValidationIssues);

  useEffect(() => {
    if (!checkSetKey || !normalizedDraftPayload?.key) {
      setExistingSetKey(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkSetKey(normalizedDraftPayload.key).then((result) => {
        if (cancelled) return;
        setExistingSetKey(result.existing ?? null);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkSetKey, normalizedDraftPayload?.key]);

  const handleGenerateSet = async () => {
    setSetDraftError(null);
    const proposal = await onGenerateSet();
    if (!proposal) return;
    applyProposalToDraft(proposal);
  };

  const ensureDraft = () => {
    setDraftSet((prev) =>
      prev ?? {
        key: normalizeKey(lineDescription).slice(0, 80) || "trade.scope",
        label: lineDescription.trim() || "New clarification set",
        description: "",
        aliases: [],
        keywords: [],
        questions: [],
        attachToTemplateTags: true,
        activateNow: true,
      },
    );
  };

  const blankDraftQuestion = (): DraftQuestion => ({
    key: "",
    label: "",
    inputType: "short_text",
    helpText: "",
    allowOther: false,
    unit: "",
    customerFacing: true,
    aliases: [],
    options: [],
  });

  const beginEditingExistingSet = (appendBlank = false) => {
    if (!questionSet) return;
    setSetDraftError(null);
    setIsEditingExistingSet(true);
    setDraftSet({
      key: questionSet.key,
      label: questionSet.label,
      description: questionSet.description ?? "",
      aliases: [],
      keywords: [],
      questions: [
        ...questionSet.questions.map((question) => ({
          key: question.key,
          label: question.label,
          inputType: question.inputType as DraftInputType,
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
        ...(appendBlank ? [blankDraftQuestion()] : []),
      ],
      attachToTemplateTags: false,
      activateNow: true,
    });
  };

  const cancelEditingExistingSet = () => {
    setIsEditingExistingSet(false);
    setDraftSet(null);
    setSetDraftError(null);
  };

  const handleUpdateSet = async () => {
    if (!normalizedDraftPayload || !questionSet) return;
    if (draftBlockingErrors) {
      setSetDraftError(
        draftValidationIssues.find((issue) => issue.severity === "error")?.message ??
          "Fix validation errors before saving.",
      );
      return;
    }
    setSetDraftError(null);
    const ok = await onUpdateSet(questionSet.key, questionSet.version, {
      questions: normalizedDraftPayload.questions,
    });
    if (ok) cancelEditingExistingSet();
  };

  const isUpdatingExisting = Boolean(questionSet && isEditingExistingSet);
  const showDraftEditor = Boolean(draftSet) && (!questionSet || isEditingExistingSet);

  const handleCreateSet = async () => {
    if (!normalizedDraftPayload) {
      setSetDraftError("Create or generate a question set draft first.");
      return;
    }
    if (draftBlockingErrors) {
      setSetDraftError(
        draftValidationIssues.find((issue) => issue.severity === "error")?.message ??
          "Fix validation errors before saving.",
      );
      return;
    }
    setSetDraftError(null);
    await onCreateSet(normalizedDraftPayload);
  };

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => isAnswerProvided(v)).length,
    [answers],
  );

  const handleApply = async () => {
    if (!questionSet) return;
    setError(null);
    const built: ClarificationAnswer[] = [];
    for (const question of questionSet.questions) {
      const value = answers[question.key];
      if (!value || !isAnswerProvided(value)) continue;
      const result = validateAnswerValue(question, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      built.push(buildClarificationAnswer(questionSet, question, value));
    }
    if (built.length === 0) {
      setError("Answer at least one question before applying.");
      return;
    }
    await onApply({
      questionSetKey: questionSet.key,
      questionSetVersion: questionSet.version,
      answers: built,
    });
  };

  const renderQuestion = (question: ClarificationQuestion) => {
    const value = answers[question.key];
    const isUnknown = value?.kind === "unknown";
    const choiceKeys = value?.kind === "choice" ? value.optionKeys : [];
    const otherText = value?.kind === "choice" ? value.otherText ?? "" : "";

    const showOther = question.allowOther && choiceKeys.includes(OTHER_KEY);

    return (
      <div key={question.key} className="space-y-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">{question.label}</p>
            {question.helpText ? (
              <p className="mt-0.5 text-[11px] text-foreground-subtle">{question.helpText}</p>
            ) : null}
          </div>
          {!question.customerFacing ? (
            <span className="shrink-0 rounded bg-foreground/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground-subtle">
              Internal
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {question.inputType === "yes_no_unknown" ? (
            <>
              <button
                type="button"
                className={chipClass(choiceKeys.includes("yes"))}
                onClick={() => setChoice(question, "yes")}
              >
                Yes
              </button>
              <button
                type="button"
                className={chipClass(choiceKeys.includes("no"))}
                onClick={() => setChoice(question, "no")}
              >
                No
              </button>
            </>
          ) : null}

          {(question.inputType === "single_choice" || question.inputType === "multi_choice") &&
            (question.options ?? []).map((option) => (
              <button
                key={option.key}
                type="button"
                className={chipClass(choiceKeys.includes(option.key))}
                onClick={() => setChoice(question, option.key)}
              >
                {option.label}
              </button>
            ))}

          {question.allowOther &&
          (question.inputType === "single_choice" || question.inputType === "multi_choice") ? (
            <button
              type="button"
              className={chipClass(choiceKeys.includes(OTHER_KEY))}
              onClick={() => setChoice(question, OTHER_KEY)}
            >
              Other
            </button>
          ) : null}

          {question.inputType !== "notes" ? (
            <button
              type="button"
              className={chipClass(isUnknown)}
              onClick={() => setUnknown(question)}
            >
              Needs field verify
            </button>
          ) : null}
        </div>

        {showOther ? (
          <input
            type="text"
            value={otherText}
            placeholder="Enter custom value"
            onChange={(e) => setOtherText(question, e.target.value)}
            className={`${workspaceFormControlClass} text-sm`}
          />
        ) : null}

        {question.inputType === "short_text" ? (
          <input
            type="text"
            value={value?.kind === "text" ? value.text : ""}
            disabled={isUnknown}
            onChange={(e) => setText(question, e.target.value)}
            className={`${workspaceFormControlClass} text-sm`}
          />
        ) : null}

        {question.inputType === "notes" ? (
          <textarea
            rows={2}
            value={value?.kind === "text" ? value.text : ""}
            onChange={(e) => setText(question, e.target.value)}
            className={`${workspaceFormControlClass} text-sm`}
          />
        ) : null}

        {question.inputType === "number" ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={value?.kind === "number" ? String(value.value) : ""}
              disabled={isUnknown}
              onChange={(e) => setNumber(question, e.target.value)}
              className={`${workspaceFormControlClass} text-sm`}
            />
            {question.unit ? (
              <span className="text-xs text-foreground-subtle">{question.unit}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const dialogNode = (
    <dialog
      ref={dialogRef}
      data-workspace-child-dialog="true"
      aria-labelledby="clarify-scope-title"
      aria-busy={isApplying}
      className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl outline-none [&::backdrop]:bg-black/40 [&:not([open])]:hidden"
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="clarify-scope-title" className="text-base font-semibold text-foreground">
              Clarify scope
            </h2>
            <p className="mt-1 line-clamp-1 text-xs text-foreground-muted">{lineDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="rounded-lg border border-border p-2 text-foreground-subtle hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="size-4 animate-spin" />
              Finding scope questions…
            </div>
          ) : showDraftEditor && draftSet ? (
            <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
              {isUpdatingExisting ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-foreground-muted">
                    Add or edit questions for <span className="font-medium text-foreground">{questionSet?.label}</span>.
                    Saving updates the library for future lines too.
                  </p>
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    disabled={isUpdatingSet}
                    onClick={cancelEditingExistingSet}
                  >
                    Cancel editing
                  </button>
                </div>
              ) : null}
              {!isUpdatingExisting ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className={workspaceFormFieldLabelClass}>Set label</span>
                      <input
                        value={draftSet.label}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, label: event.target.value } : prev,
                          )
                        }
                        className={workspaceFormControlClass}
                        placeholder="Roof replacement clarifications"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={workspaceFormFieldLabelClass}>Set key</span>
                      <input
                        value={draftSet.key}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, key: event.target.value } : prev,
                          )
                        }
                        className={workspaceFormControlClass}
                        placeholder="roof.replacement"
                      />
                      {draftValidationIssues
                        .filter((issue) => issue.path === "key")
                        .map((issue) => (
                          <p
                            key={`${issue.severity}-${issue.message}`}
                            className={
                              issue.severity === "error"
                                ? "text-xs text-danger"
                                : "text-xs text-foreground-muted"
                            }
                          >
                            {issue.message}
                          </p>
                        ))}
                    </label>
                  </div>

                  <label className="space-y-1">
                    <span className={workspaceFormFieldLabelClass}>Description</span>
                    <textarea
                      rows={2}
                      value={draftSet.description}
                      onChange={(event) =>
                        setDraftSet((prev) =>
                          prev ? { ...prev, description: event.target.value } : prev,
                        )
                      }
                      className={workspaceFormControlClass}
                    />
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className={workspaceFormFieldLabelClass}>Aliases (comma separated)</span>
                      <input
                        value={listToCsv(draftSet.aliases)}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, aliases: csvToList(event.target.value) } : prev,
                          )
                        }
                        className={workspaceFormControlClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className={workspaceFormFieldLabelClass}>Keywords (comma separated)</span>
                      <input
                        value={listToCsv(draftSet.keywords)}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, keywords: csvToList(event.target.value) } : prev,
                          )
                        }
                        className={workspaceFormControlClass}
                      />
                    </label>
                  </div>
                </>
              ) : null}

                  <div className="space-y-2">
                    {draftSet.questions.map((question, qIndex) => (
                      <div key={`${question.key}-${qIndex}`} className="space-y-2 rounded-md border border-border p-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            value={question.label}
                            onChange={(event) =>
                              setDraftSet((prev) => {
                                if (!prev) return prev;
                                const questions = [...prev.questions];
                                questions[qIndex] = { ...question, label: event.target.value };
                                return { ...prev, questions };
                              })
                            }
                            className={workspaceFormControlClass}
                            placeholder="Question label"
                          />
                          <input
                            value={question.key}
                            onChange={(event) =>
                              setDraftSet((prev) => {
                                if (!prev) return prev;
                                const questions = [...prev.questions];
                                questions[qIndex] = { ...question, key: event.target.value };
                                return { ...prev, questions };
                              })
                            }
                            className={workspaceFormControlClass}
                            placeholder="question.key"
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={question.inputType}
                            onChange={(event) =>
                              setDraftSet((prev) => {
                                if (!prev) return prev;
                                const questions = [...prev.questions];
                                questions[qIndex] = {
                                  ...question,
                                  inputType: event.target.value as DraftInputType,
                                };
                                return { ...prev, questions };
                              })
                            }
                            className={workspaceFormControlClass}
                          >
                            <option value="single_choice">Single choice</option>
                            <option value="multi_choice">Multi choice</option>
                            <option value="yes_no_unknown">Yes / No / Unknown</option>
                            <option value="short_text">Short text</option>
                            <option value="number">Number</option>
                            <option value="notes">Notes</option>
                          </select>
                          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted">
                            <input
                              type="checkbox"
                              checked={question.customerFacing}
                              onChange={(event) =>
                                setDraftSet((prev) => {
                                  if (!prev) return prev;
                                  const questions = [...prev.questions];
                                  questions[qIndex] = {
                                    ...question,
                                    customerFacing: event.target.checked,
                                  };
                                  return { ...prev, questions };
                                })
                              }
                            />
                            Customer facing
                          </label>
                        </div>

                        {(question.inputType === "single_choice" ||
                          question.inputType === "multi_choice") && (
                          <div className="space-y-2">
                            {(question.options ?? []).map((option, optionIndex) => (
                              <div key={`${option.key}-${optionIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <input
                                  value={option.label}
                                  onChange={(event) =>
                                    setDraftSet((prev) => {
                                      if (!prev) return prev;
                                      const questions = [...prev.questions];
                                      const options = [...questions[qIndex].options];
                                      options[optionIndex] = {
                                        ...option,
                                        label: event.target.value,
                                      };
                                      questions[qIndex] = { ...questions[qIndex], options };
                                      return { ...prev, questions };
                                    })
                                  }
                                  className={workspaceFormControlClass}
                                  placeholder="Option label"
                                />
                                <input
                                  value={option.key}
                                  onChange={(event) =>
                                    setDraftSet((prev) => {
                                      if (!prev) return prev;
                                      const questions = [...prev.questions];
                                      const options = [...questions[qIndex].options];
                                      options[optionIndex] = {
                                        ...option,
                                        key: event.target.value,
                                      };
                                      questions[qIndex] = { ...questions[qIndex], options };
                                      return { ...prev, questions };
                                    })
                                  }
                                  className={workspaceFormControlClass}
                                  placeholder="option.key"
                                />
                                <button
                                  type="button"
                                  className={workspaceFormSecondaryButtonClass}
                                  onClick={() =>
                                    setDraftSet((prev) => {
                                      if (!prev) return prev;
                                      const questions = [...prev.questions];
                                      questions[qIndex] = {
                                        ...questions[qIndex],
                                        options: questions[qIndex].options.filter(
                                          (_, idx) => idx !== optionIndex,
                                        ),
                                      };
                                      return { ...prev, questions };
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={workspaceFormSecondaryButtonClass}
                                onClick={() =>
                                  setDraftSet((prev) => {
                                    if (!prev) return prev;
                                    const questions = [...prev.questions];
                                    questions[qIndex] = {
                                      ...questions[qIndex],
                                      options: [
                                        ...questions[qIndex].options,
                                        { key: "", label: "", aliases: [] },
                                      ],
                                    };
                                    return { ...prev, questions };
                                  })
                                }
                              >
                                Add option
                              </button>
                              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted">
                                <input
                                  type="checkbox"
                                  checked={question.allowOther}
                                  onChange={(event) =>
                                    setDraftSet((prev) => {
                                      if (!prev) return prev;
                                      const questions = [...prev.questions];
                                      questions[qIndex] = {
                                        ...question,
                                        allowOther: event.target.checked,
                                      };
                                      return { ...prev, questions };
                                    })
                                  }
                                />
                                Allow "Other"
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            className={workspaceFormSecondaryButtonClass}
                            onClick={() =>
                              setDraftSet((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      questions: prev.questions.filter((_, idx) => idx !== qIndex),
                                    }
                                  : prev,
                              )
                            }
                          >
                            Remove question
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={workspaceFormSecondaryButtonClass}
                      onClick={() =>
                        setDraftSet((prev) =>
                          prev
                            ? {
                                ...prev,
                                questions: [
                                  ...prev.questions,
                                  {
                                    key: "",
                                    label: "",
                                    inputType: "short_text",
                                    helpText: "",
                                    allowOther: false,
                                    unit: "",
                                    customerFacing: true,
                                    aliases: [],
                                    options: [],
                                  },
                                ],
                              }
                            : prev,
                        )
                      }
                    >
                      Add question
                    </button>
                    {!isUpdatingExisting ? (
                      <>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted">
                      <input
                        type="checkbox"
                        checked={draftSet.attachToTemplateTags}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, attachToTemplateTags: event.target.checked } : prev,
                          )
                        }
                      />
                      Attach to this line template's tags
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted">
                      <input
                        type="checkbox"
                        checked={draftSet.activateNow}
                        onChange={(event) =>
                          setDraftSet((prev) =>
                            prev ? { ...prev, activateNow: event.target.checked } : prev,
                          )
                        }
                      />
                      Activate now (off = save as draft library entry)
                    </label>
                      </>
                    ) : null}
                  </div>

                  {draftValidationIssues.filter((issue) => issue.path !== "key").length > 0 ? (
                    <ul className="space-y-1 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs">
                      {draftValidationIssues
                        .filter((issue) => issue.path !== "key")
                        .map((issue) => (
                          <li
                            key={`${issue.path}-${issue.message}`}
                            className={
                              issue.severity === "error" ? "text-danger" : "text-foreground-muted"
                            }
                          >
                            {issue.message}
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  {setDraftError ? (
                    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger">
                      {setDraftError}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    className={workspaceFormPrimaryButtonClass}
                    disabled={
                      (isUpdatingExisting ? isUpdatingSet : isCreatingSet) || draftBlockingErrors
                    }
                    onClick={() =>
                      void (isUpdatingExisting ? handleUpdateSet() : handleCreateSet())
                    }
                  >
                    {isUpdatingExisting ? (
                      isUpdatingSet ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Saving questions…
                        </>
                      ) : (
                        "Save questions"
                      )
                    ) : isCreatingSet ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Creating question set…
                      </>
                    ) : (
                      "Save and use these questions"
                    )}
                  </button>
            </div>
          ) : !questionSet ? (
            <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className="text-sm text-foreground-muted">
                No scope question set matched this line yet. Create one here, then answer it right
                away.
              </p>
              <div className="space-y-2">
                <p className={workspaceFormFieldLabelClass}>Start from a trade template</p>
                <div className="flex flex-wrap gap-2">
                  {CLARIFICATION_TRADE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.description}
                      className={workspaceFormSecondaryButtonClass}
                      disabled={isGeneratingSet || isCreatingSet}
                      onClick={() => applyTradePreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={workspaceFormSecondaryButtonClass}
                  disabled={isGeneratingSet || isCreatingSet}
                  onClick={() => void handleGenerateSet()}
                >
                  {isGeneratingSet ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating questions…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      AI draft questions
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={workspaceFormSecondaryButtonClass}
                  disabled={isGeneratingSet || isCreatingSet}
                  onClick={ensureDraft}
                >
                  Create manually
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={workspaceFormFieldLabelClass}>Question set</p>
                  <p className="text-sm font-medium text-foreground">{questionSet.label}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    disabled={isSuggesting || isApplying || isUpdatingSet}
                    onClick={() => beginEditingExistingSet(true)}
                  >
                    <Plus className="size-4" />
                    Add / edit questions
                  </button>
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    disabled={isSuggesting || isApplying || isUpdatingSet}
                    onClick={() => void onSuggest()}
                  >
                  {isSuggesting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Suggesting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      AI suggest answers
                    </>
                  )}
                </button>
                </div>
              </div>

              {alternatives.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-foreground-subtle">Not right?</span>
                  {alternatives.map((alt) => (
                    <button
                      key={alt.key}
                      type="button"
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground-muted hover:border-border-strong"
                      onClick={() => onSelectAlternative(alt.key)}
                    >
                      {alt.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {aiGeneration?.isSimulated ? (
                <p className="rounded-md border border-border bg-foreground/[0.02] px-3 py-2 text-xs text-foreground-muted">
                  Demo AI output — live provider unavailable. Review before applying.
                </p>
              ) : null}

              {aiProposal && aiProposal.notes.length > 0 ? (
                <ul className="space-y-1 text-[11px] text-foreground-subtle">
                  {aiProposal.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-3">{questionSet.questions.map(renderQuestion)}</div>

              {error ? (
                <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <p className="text-xs text-foreground-subtle">
            {!questionSet
              ? "Create a matching question set, then answer it for this line."
              : answeredCount > 0
              ? `${answeredCount} answered — applies to this line's scope notes`
              : "Tap answers — customer-facing facts feed the proposal, internal facts stay staff-only"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={workspaceFormSecondaryButtonClass}
              onClick={onClose}
              disabled={!canClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={workspaceFormPrimaryButtonClass}
              disabled={isApplying || answeredCount === 0 || !questionSet}
              onClick={() => void handleApply()}
            >
              {isApplying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Apply to line scope
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );

  if (!mounted) return null;
  return createPortal(dialogNode, document.body);
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight, Library, Loader2, Plus, Sparkles, X } from "lucide-react";
import type { ClarificationDraftValidationIssue } from "@/lib/clarification/clarification-draft-validation";
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
  ClarificationQuestionSetPickerRow,
  ClarificationSetOption,
} from "@/app/(workspace)/quotes/quote-line-clarification-types";
import type { ClarificationMatchConfidence } from "@/lib/clarification/clarification-matching";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";
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
  lineId: string | null;
  lineDescription: string;
  questionSet: ClarifyScopeQuestionSet | null;
  savedAnswers: LineClarificationAnswers | null;
  alternatives: ClarificationSetOption[];
  setPickerRows: ClarificationQuestionSetPickerRow[];
  pickerQueryFromParent: string;
  autoMatchedSetKey: string | null;
  recommendedConfidence: ClarificationMatchConfidence | null;
  isSetPickerLoading: boolean;
  onSearchSets: (query?: string) => Promise<void>;
  isLoading: boolean;
  onSelectAlternative: (setKey: string) => void;
  aiProposal: ClarificationAnswerProposal | null;
  aiGeneration: ClarificationAnswerGenerationMeta | null;
  isSuggesting: boolean;
  onSuggest: () => Promise<void>;
  isGeneratingSet: boolean;
  onGenerateSet: () => Promise<ClarificationQuestionSetProposal | null>;
  isCreatingSet: boolean;
  onCreateSet: (payload: ClarificationSetDraftPayload) => Promise<boolean>;
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
  openScopeDecisions: readonly QuoteScopeDecisionPayload[];
  onScopeGapAction: (
    decisionId: string,
    action: "not_needed" | "defer_to_execution",
  ) => Promise<{ error?: string }>;
};

type AnswerMap = Record<string, ClarificationAnswerValue>;

type PanelMode = "start" | "answer" | "choose" | "create";
type ActiveSetSource = "recommended" | "selected" | "created";

function confidenceLabel(confidence: ClarificationMatchConfidence): string {
  if (confidence === "high") return "Strong recommendation";
  if (confidence === "medium") return "Possible recommendation";
  return "Weak recommendation";
}

function setSourceBadge(source: ActiveSetSource): string {
  if (source === "recommended") return "Recommended";
  if (source === "created") return "Created";
  return "Selected";
}

function chipClass(active: boolean): string {
  return [
    "rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[40px]",
    active
      ? "border-primary bg-primary/15 text-primary"
      : "border-border bg-surface text-foreground-muted hover:border-border-strong",
  ].join(" ");
}

const DRAFT_INPUT_TYPE_LABELS: Record<DraftInputType, string> = {
  single_choice: "Single choice",
  multi_choice: "Multi choice",
  yes_no_unknown: "Yes / No / Unknown",
  short_text: "Short text",
  number: "Number",
  notes: "Notes",
};

function draftInputTypeLabel(inputType: DraftInputType): string {
  return DRAFT_INPUT_TYPE_LABELS[inputType];
}

function draftQuestionOptionCountLabel(question: DraftQuestion): string | null {
  if (question.inputType !== "single_choice" && question.inputType !== "multi_choice") {
    return null;
  }
  const count = question.options.length;
  if (count === 0) return "No options";
  return count === 1 ? "1 option" : `${count} options`;
}

function draftQuestionVisibilityLabel(customerFacing: boolean): string {
  return customerFacing ? "Customer" : "Internal";
}

function issuesForQuestionIndex(
  issues: ClarificationDraftValidationIssue[],
  qIndex: number,
): ClarificationDraftValidationIssue[] {
  const prefix = `questions[${qIndex}]`;
  return issues.filter(
    (issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
  );
}

function hasQuestionValidationError(
  issues: ClarificationDraftValidationIssue[],
  qIndex: number,
): boolean {
  return issuesForQuestionIndex(issues, qIndex).some((issue) => issue.severity === "error");
}

function shiftExpandedIndicesAfterRemove(
  expanded: Set<number>,
  removedIndex: number,
): Set<number> {
  const next = new Set<number>();
  for (const index of expanded) {
    if (index < removedIndex) next.add(index);
    else if (index > removedIndex) next.add(index - 1);
  }
  return next;
}

export function ClarifyScopePanel({
  open,
  onClose,
  lineId,
  lineDescription,
  questionSet,
  savedAnswers,
  alternatives,
  setPickerRows,
  pickerQueryFromParent,
  autoMatchedSetKey,
  recommendedConfidence,
  isSetPickerLoading,
  onSearchSets,
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
  openScopeDecisions,
  onScopeGapAction,
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
  const [expandedDraftQuestionIndices, setExpandedDraftQuestionIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [panelMode, setPanelMode] = useState<PanelMode>("start");
  const [activeSetSource, setActiveSetSource] = useState<ActiveSetSource | null>(null);
  const [recommendedSetSnapshot, setRecommendedSetSnapshot] =
    useState<ClarifyScopeQuestionSet | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [gapActionPendingId, setGapActionPendingId] = useState<string | null>(null);
  const [gapActionErrorById, setGapActionErrorById] = useState<Record<string, string>>({});
  const prevSetIdentityRef = useRef<string | null>(null);
  const prevLineIdRef = useRef<string | null>(null);
  const prevProposalRef = useRef<ClarificationAnswerProposal | null>(null);

  const canClose = !isApplying && gapActionPendingId == null;

  // Reset / hydrate answers when the question set changes.
  const currentSetKey = questionSet?.key ?? null;
  const currentSetVersion = questionSet?.version ?? null;
  const savedKey = savedAnswers?.questionSetKey ?? null;
  const savedVersion = savedAnswers?.questionSetVersion ?? null;
  const setIdentity =
    currentSetKey && currentSetVersion != null
      ? `${currentSetKey}@${currentSetVersion}`
      : null;

  useEffect(() => {
    if (!open) {
      setAnswers({});
      setError(null);
      setSetDraftError(null);
      setDraftSet(null);
      setExistingSetKey(null);
      setIsEditingExistingSet(false);
      setExpandedDraftQuestionIndices(new Set());
      setPanelMode("start");
      setActiveSetSource(null);
      setRecommendedSetSnapshot(null);
      setGapActionPendingId(null);
      setGapActionErrorById({});
      prevSetIdentityRef.current = null;
      prevLineIdRef.current = null;
      prevProposalRef.current = null;
      return;
    }
    const lineChanged = prevLineIdRef.current !== lineId;
    if (lineChanged) {
      setPanelMode("start");
      setActiveSetSource(null);
      setRecommendedSetSnapshot(null);
      setSetDraftError(null);
      setDraftSet(null);
      setExistingSetKey(null);
      setIsEditingExistingSet(false);
      setExpandedDraftQuestionIndices(new Set());
      setError(null);
      setGapActionPendingId(null);
      setGapActionErrorById({});
      prevProposalRef.current = null;
    }
    prevLineIdRef.current = lineId;
  }, [lineId, open, questionSet]);

  useEffect(() => {
    if (!open) return;
    const previousSetIdentity = prevSetIdentityRef.current;
    const canHydrate =
      savedAnswers &&
      currentSetKey === savedKey &&
      currentSetVersion === savedVersion;
    setAnswers((prev) => {
      if (canHydrate && savedAnswers) {
        return lineClarificationAnswersToAnswerMap(savedAnswers);
      }
      if (
        previousSetIdentity &&
        currentSetKey &&
        previousSetIdentity.startsWith(`${currentSetKey}@`) &&
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
    prevProposalRef.current = null;
    if (currentSetKey && !isEditingExistingSet) {
      setDraftSet(null);
      setSetDraftError(null);
    }
    prevSetIdentityRef.current = setIdentity;
  }, [
    open,
    setIdentity,
    savedAnswers,
    currentSetKey,
    currentSetVersion,
    savedKey,
    savedVersion,
    questionSet,
    isEditingExistingSet,
  ]);

  useEffect(() => {
    if (!open || !questionSet || !aiProposal) return;
    if (aiProposal === prevProposalRef.current) return;
    prevProposalRef.current = aiProposal;
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
  }, [aiProposal, open, questionSet]);

  useEffect(() => {
    if (!open) return;
    setPickerQuery(pickerQueryFromParent);
  }, [open, pickerQueryFromParent]);

  useEffect(() => {
    if (!open || isLoading) return;
    if (!autoMatchedSetKey || !questionSet || questionSet.key !== autoMatchedSetKey) return;
    setRecommendedSetSnapshot(questionSet);
  }, [open, isLoading, autoMatchedSetKey, questionSet]);




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

  const collapseAllDraftQuestions = () => {
    setExpandedDraftQuestionIndices(new Set());
  };

  const expandDraftQuestion = (qIndex: number) => {
    setExpandedDraftQuestionIndices((prev) => new Set(prev).add(qIndex));
  };

  const toggleDraftQuestionExpanded = (qIndex: number) => {
    setExpandedDraftQuestionIndices((prev) => {
      const next = new Set(prev);
      if (next.has(qIndex)) next.delete(qIndex);
      else next.add(qIndex);
      return next;
    });
  };

  const removeDraftQuestion = (qIndex: number) => {
    setDraftSet((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.filter((_, idx) => idx !== qIndex),
          }
        : prev,
    );
    setExpandedDraftQuestionIndices((prev) =>
      shiftExpandedIndicesAfterRemove(prev, qIndex),
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

  const addDraftQuestion = () => {
    setDraftSet((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.questions.length;
      expandDraftQuestion(nextIndex);
      return {
        ...prev,
        questions: [...prev.questions, blankDraftQuestion()],
      };
    });
  };

  const applyProposalToDraft = (proposal: ClarificationQuestionSetProposal) => {
    setExistingSetKey(null);
    collapseAllDraftQuestions();
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
    collapseAllDraftQuestions();
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
        helpText: question.helpText ?? "",
        allowOther: question.allowOther ?? false,
        unit: question.unit ?? "",
        customerFacing: question.customerFacing ?? true,
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
    collapseAllDraftQuestions();
  };

  const beginEditingExistingSet = (appendBlank = false) => {
    if (!questionSet) return;
    setSetDraftError(null);
    setPanelMode("create");
    setIsEditingExistingSet(true);
    const questions = [
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
    ];
    setDraftSet({
      key: questionSet.key,
      label: questionSet.label,
      description: questionSet.description ?? "",
      aliases: [],
      keywords: [],
      questions,
      attachToTemplateTags: false,
      activateNow: true,
    });
    if (appendBlank) {
      setExpandedDraftQuestionIndices(new Set([questions.length - 1]));
    } else {
      collapseAllDraftQuestions();
    }
  };

  const cancelEditingExistingSet = () => {
    setIsEditingExistingSet(false);
    setDraftSet(null);
    setSetDraftError(null);
    collapseAllDraftQuestions();
    setPanelMode(activeSetSource ? "answer" : "start");
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
  const showDraftEditor = Boolean(draftSet) && (panelMode === "create" || isUpdatingExisting);

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
    const ok = await onCreateSet(normalizedDraftPayload);
    if (ok) {
      setDraftSet(null);
      setActiveSetSource("created");
      setPanelMode("answer");
    }
  };

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => isAnswerProvided(v)).length,
    [answers],
  );
  const lineScopeDecisions = useMemo(
    () => openScopeDecisions.filter((decision) => decision.quoteLineItemId === lineId),
    [lineId, openScopeDecisions],
  );
  const quoteWideScopeDecisions = useMemo(
    () => openScopeDecisions.filter((decision) => decision.quoteLineItemId == null),
    [openScopeDecisions],
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

  const handleScopeGapAction = async (
    decisionId: string,
    action: "not_needed" | "defer_to_execution",
  ) => {
    setGapActionPendingId(decisionId);
    setGapActionErrorById((prev) => ({ ...prev, [decisionId]: "" }));
    const result = await onScopeGapAction(decisionId, action);
    if (result.error) {
      setGapActionErrorById((prev) => ({ ...prev, [decisionId]: result.error ?? "Failed to update gap." }));
    }
    setGapActionPendingId(null);
  };

  const goBackToStart = () => {
    setPanelMode("start");
    setSetDraftError(null);
    if (!isEditingExistingSet) {
      setDraftSet(null);
    }
  };

  const openSetPicker = () => {
    setPanelMode("choose");
    void onSearchSets(pickerQuery.trim() || undefined);
  };

  const startCreateSet = () => {
    setPanelMode("create");
    setIsEditingExistingSet(false);
    setDraftSet(null);
    setSetDraftError(null);
    setExistingSetKey(null);
    collapseAllDraftQuestions();
  };

  const acceptRecommendation = async () => {
    if (!autoMatchedSetKey || !recommendedSetSnapshot) return;
    if (questionSet?.key !== autoMatchedSetKey) {
      await Promise.resolve(onSelectAlternative(autoMatchedSetKey));
    }
    setActiveSetSource("recommended");
    setPanelMode("answer");
  };

  const selectQuestionSet = async (setKey: string) => {
    await Promise.resolve(onSelectAlternative(setKey));
    setActiveSetSource(
      setKey === autoMatchedSetKey ? "recommended" : "selected",
    );
    setPanelMode("answer");
  };

  const draftQuestionSummaryBadgeClass =
    "rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground-muted";

  const renderDraftQuestionCard = (question: DraftQuestion, qIndex: number) => {
    const expanded = expandedDraftQuestionIndices.has(qIndex);
    const questionIssues = issuesForQuestionIndex(draftValidationIssues, qIndex);
    const hasError = hasQuestionValidationError(draftValidationIssues, qIndex);
    const optionCountLabel = draftQuestionOptionCountLabel(question);
    const summaryLabel = question.label.trim() || `Question ${qIndex + 1}`;

    return (
      <div
        key={`draft-q-${qIndex}`}
        className={[
          "overflow-hidden rounded-lg border bg-surface",
          hasError ? "border-danger/40" : "border-border",
        ].join(" ")}
      >
        <button
          type="button"
          className="flex w-full items-start gap-2 p-3 text-left transition-colors hover:bg-foreground/[0.02]"
          aria-expanded={expanded}
          onClick={() => toggleDraftQuestionExpanded(qIndex)}
        >
          {expanded ? (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
          ) : (
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={[
                "text-sm font-medium",
                question.label.trim() ? "text-foreground" : "text-foreground-muted",
              ].join(" ")}
            >
              {summaryLabel}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={draftQuestionSummaryBadgeClass}>
                {draftInputTypeLabel(question.inputType)}
              </span>
              <span className={draftQuestionSummaryBadgeClass}>
                {draftQuestionVisibilityLabel(question.customerFacing)}
              </span>
              {optionCountLabel ? (
                <span className={draftQuestionSummaryBadgeClass}>{optionCountLabel}</span>
              ) : null}
              {hasError ? (
                <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                  Needs fix
                </span>
              ) : null}
            </div>
            {!expanded && questionIssues.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {questionIssues.map((issue) => (
                  <li
                    key={`${issue.path}-${issue.message}`}
                    className={
                      issue.severity === "error"
                        ? "text-[11px] text-danger"
                        : "text-[11px] text-foreground-muted"
                    }
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </button>

        {expanded ? (
          <div className="space-y-2 border-t border-border px-3 pb-3 pt-2">
            <label className="space-y-1">
              <span className={workspaceFormFieldLabelClass}>Question text</span>
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
                placeholder="How many windows need replacing?"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={workspaceFormFieldLabelClass}>Answer type</span>
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
              </label>
              <label className="flex items-end gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground-muted">
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

            <label className="space-y-1">
              <span className={workspaceFormFieldLabelClass}>Question key</span>
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
                placeholder="windows.count"
              />
            </label>

            {(question.inputType === "single_choice" ||
              question.inputType === "multi_choice") && (
              <div className="space-y-2 rounded-md border border-dashed border-border bg-foreground/[0.01] p-2">
                <p className={workspaceFormFieldLabelClass}>Answer options</p>
                {(question.options ?? []).map((option, optionIndex) => (
                  <div
                    key={`${option.key}-${optionIndex}`}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
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
                    Allow &quot;Other&quot;
                  </label>
                </div>
              </div>
            )}

            {questionIssues.length > 0 ? (
              <ul className="space-y-0.5 rounded-md border border-border bg-foreground/[0.02] px-2 py-1.5 text-[11px]">
                {questionIssues.map((issue) => (
                  <li
                    key={`expanded-${issue.path}-${issue.message}`}
                    className={
                      issue.severity === "error" ? "text-danger" : "text-foreground-muted"
                    }
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                className={workspaceFormSecondaryButtonClass}
                onClick={() => removeDraftQuestion(qIndex)}
              >
                Remove question
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
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
      className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl outline-none [&::backdrop]:bg-black/40 [&:not([open])]:hidden"
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
          ) : panelMode === "start" ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted">
                Pick how to capture the missing scope facts for this line.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {recommendedSetSnapshot ? (
                  <div className="flex flex-col rounded-lg border border-border bg-foreground/[0.02] p-4">
                    <p className={workspaceFormFieldLabelClass}>Recommended question set</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {recommendedSetSnapshot.label}
                    </p>
                    {recommendedConfidence ? (
                      <p className="mt-1 text-[11px] text-foreground-subtle">
                        {confidenceLabel(recommendedConfidence)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-foreground-muted">
                      {recommendedSetSnapshot.questions.length} question
                      {recommendedSetSnapshot.questions.length === 1 ? "" : "s"}
                    </p>
                    {alternatives.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-foreground-subtle">
                          Other options
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {alternatives.slice(0, 3).map((alt) => (
                            <span
                              key={alt.key}
                              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-foreground-muted"
                            >
                              {alt.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={`${workspaceFormPrimaryButtonClass} mt-auto pt-4`}
                      disabled={isApplying}
                      onClick={() => void acceptRecommendation()}
                    >
                      Use recommendation
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col rounded-lg border border-dashed border-border bg-foreground/[0.02] p-4 md:col-span-1">
                    <p className={workspaceFormFieldLabelClass}>Recommended question set</p>
                    <p className="mt-2 text-sm text-foreground-muted">
                      No good recommendation yet. Choose from the library or create questions for
                      this line.
                    </p>
                  </div>
                )}

                <div className="flex flex-col rounded-lg border border-border bg-foreground/[0.02] p-4">
                  <p className={workspaceFormFieldLabelClass}>Choose from library</p>
                  <p className="mt-2 flex-1 text-sm text-foreground-muted">
                    Search active question sets and pick the one that fits this line.
                  </p>
                  <button
                    type="button"
                    className={`${workspaceFormSecondaryButtonClass} mt-auto pt-4`}
                    disabled={isSetPickerLoading}
                    onClick={openSetPicker}
                  >
                    <Library className="size-4" />
                    Choose from library
                  </button>
                </div>

                <div className="flex flex-col rounded-lg border border-border bg-foreground/[0.02] p-4">
                  <p className={workspaceFormFieldLabelClass}>Create questions</p>
                  <p className="mt-2 flex-1 text-sm text-foreground-muted">
                    Start from a trade template, AI draft, or build questions manually.
                  </p>
                  <button
                    type="button"
                    className={`${workspaceFormSecondaryButtonClass} mt-auto pt-4`}
                    disabled={isGeneratingSet || isCreatingSet}
                    onClick={startCreateSet}
                  >
                    <Plus className="size-4" />
                    Create questions
                  </button>
                </div>
              </div>
            </div>
          ) : panelMode === "choose" ? (
            <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Choose from library</p>
                <button
                  type="button"
                  className={workspaceFormSecondaryButtonClass}
                  onClick={goBackToStart}
                >
                  Back
                </button>
              </div>
              <input
                type="search"
                value={pickerQuery}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setPickerQuery(nextQuery);
                  void onSearchSets(nextQuery.trim() || undefined);
                }}
                placeholder="Search by set name, key, tags, aliases, keywords..."
                className={workspaceFormControlClass}
              />
              {alternatives.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-foreground-subtle">Suggested for this line</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {alternatives.map((alt) => (
                      <button
                        key={alt.key}
                        type="button"
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground-muted hover:border-border-strong"
                        onClick={() => void selectQuestionSet(alt.key)}
                      >
                        {alt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {isSetPickerLoading ? (
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading question sets…
                </div>
              ) : null}
              {!isSetPickerLoading && setPickerRows.length === 0 ? (
                <p className="text-xs text-foreground-muted">
                  No active question sets match this search. Create one for this line.
                </p>
              ) : null}
              {!isSetPickerLoading && setPickerRows.length > 0 ? (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {setPickerRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-border-strong"
                      onClick={() => void selectQuestionSet(row.key)}
                    >
                      <p className="text-sm font-medium text-foreground">{row.label}</p>
                      <p className="text-[11px] text-foreground-subtle">{row.key}</p>
                      {row.description ? (
                        <p className="mt-1 text-xs text-foreground-muted">{row.description}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-foreground-subtle">
                        {row.questionCount} question{row.questionCount === 1 ? "" : "s"}
                        {row.tagNames.length > 0 ? ` · tags: ${row.tagNames.join(", ")}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className={workspaceFormSecondaryButtonClass}
                disabled={isGeneratingSet || isCreatingSet}
                onClick={startCreateSet}
              >
                <Plus className="size-4" />
                Create new question set
              </button>
            </div>
          ) : panelMode === "create" && showDraftEditor && draftSet ? (
            <div className="space-y-4 rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {isUpdatingExisting ? "Edit questions" : "Create question set"}
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Review what you&apos;ll ask first. Expand a question to edit answer type, options,
                    and visibility.
                  </p>
                </div>
                {!isUpdatingExisting ? (
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    onClick={goBackToStart}
                  >
                    Back
                  </button>
                ) : null}
              </div>

              {isUpdatingExisting ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                  <p className="text-sm text-foreground-muted">
                    Add or edit questions for{" "}
                    <span className="font-medium text-foreground">{questionSet?.label}</span>.
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
                <div className="space-y-2">
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
                      placeholder="Residential window replacement details"
                    />
                    {draftValidationIssues
                      .filter((issue) => issue.path === "label")
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

                  <details className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-foreground-muted">
                      Library details (key, description, tags)
                    </summary>
                    <div className="mt-3 space-y-2">
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
                          placeholder="windows.replacement"
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
                          <span className={workspaceFormFieldLabelClass}>
                            Aliases (comma separated)
                          </span>
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
                          <span className={workspaceFormFieldLabelClass}>
                            Keywords (comma separated)
                          </span>
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
                    </div>
                  </details>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={workspaceFormFieldLabelClass}>
                    Questions ({draftSet.questions.length})
                  </p>
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    onClick={addDraftQuestion}
                  >
                    <Plus className="size-4" />
                    Add question
                  </button>
                </div>

                {draftSet.questions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-foreground-muted">
                    No questions yet. Add one manually or start from a trade template or AI draft.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draftSet.questions.map((question, qIndex) =>
                      renderDraftQuestionCard(question, qIndex),
                    )}
                  </div>
                )}
              </div>

              {!isUpdatingExisting ? (
                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-foreground-muted">
                    <input
                      type="checkbox"
                      checked={draftSet.attachToTemplateTags}
                      onChange={(event) =>
                        setDraftSet((prev) =>
                          prev ? { ...prev, attachToTemplateTags: event.target.checked } : prev,
                        )
                      }
                    />
                    Attach to this line template&apos;s tags
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground-muted">
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
                </div>
              ) : null}

              {draftValidationIssues.filter(
                (issue) =>
                  issue.path !== "key" &&
                  issue.path !== "label" &&
                  !/^questions\[\d+\]/.test(issue.path),
              ).length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs">
                  {draftValidationIssues
                    .filter(
                      (issue) =>
                        issue.path !== "key" &&
                        issue.path !== "label" &&
                        !/^questions\[\d+\]/.test(issue.path),
                    )
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
          ) : panelMode === "create" ? (
            <div className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Create questions</p>
                <button
                  type="button"
                  className={workspaceFormSecondaryButtonClass}
                  onClick={goBackToStart}
                >
                  Back
                </button>
              </div>
              <p className="text-sm text-foreground-muted">
                Build reusable questions for this line, then answer and apply them.
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
          ) : panelMode === "answer" && questionSet ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-foreground/[0.02] p-3">
                <div>
                  <p className={workspaceFormFieldLabelClass}>Question set</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{questionSet.label}</p>
                    {activeSetSource ? (
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground-subtle">
                        {setSourceBadge(activeSetSource)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    disabled={isLoading || isApplying}
                    onClick={goBackToStart}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className={workspaceFormSecondaryButtonClass}
                    disabled={isLoading || isApplying || isUpdatingSet || isCreatingSet}
                    onClick={openSetPicker}
                  >
                    Choose another
                  </button>
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
                  <span className="text-[11px] text-foreground-subtle">Suggested alternatives</span>
                  {alternatives.map((alt) => (
                    <button
                      key={alt.key}
                      type="button"
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground-muted hover:border-border-strong"
                      onClick={() => void selectQuestionSet(alt.key)}
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

              {(lineScopeDecisions.length > 0 || quoteWideScopeDecisions.length > 0) ? (
                <div className="space-y-3 rounded-lg border border-dashed border-border bg-foreground/[0.02] p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Clear open gap records</p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      Save to quote is preferred. Use these only when a gap is not needed yet or should move to execution.
                    </p>
                  </div>
                  {lineScopeDecisions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                        This line
                      </p>
                      {lineScopeDecisions.map((decision) => (
                        <div key={decision.id} className="rounded-md border border-border bg-surface p-2">
                          <p className="text-xs font-medium text-foreground">{decision.title}</p>
                          {decision.detail ? (
                            <p className="mt-0.5 text-[11px] text-foreground-muted">{decision.detail}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={workspaceFormSecondaryButtonClass}
                              disabled={gapActionPendingId === decision.id}
                              onClick={() => void handleScopeGapAction(decision.id, "not_needed")}
                            >
                              {gapActionPendingId === decision.id ? <Loader2 className="size-4 animate-spin" /> : null}
                              Not needed
                            </button>
                            <button
                              type="button"
                              className={workspaceFormSecondaryButtonClass}
                              disabled={gapActionPendingId === decision.id}
                              onClick={() => void handleScopeGapAction(decision.id, "defer_to_execution")}
                            >
                              Defer to execution
                            </button>
                          </div>
                          {gapActionErrorById[decision.id] ? (
                            <p className="mt-1 text-[11px] text-danger">{gapActionErrorById[decision.id]}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {quoteWideScopeDecisions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
                        Quote-wide gaps
                      </p>
                      {quoteWideScopeDecisions.map((decision) => (
                        <div key={decision.id} className="rounded-md border border-border bg-surface p-2">
                          <p className="text-xs font-medium text-foreground">{decision.title}</p>
                          {decision.detail ? (
                            <p className="mt-0.5 text-[11px] text-foreground-muted">{decision.detail}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={workspaceFormSecondaryButtonClass}
                              disabled={gapActionPendingId === decision.id}
                              onClick={() => void handleScopeGapAction(decision.id, "not_needed")}
                            >
                              Not needed
                            </button>
                            <button
                              type="button"
                              className={workspaceFormSecondaryButtonClass}
                              disabled={gapActionPendingId === decision.id}
                              onClick={() => void handleScopeGapAction(decision.id, "defer_to_execution")}
                            >
                              Defer to execution
                            </button>
                          </div>
                          {gapActionErrorById[decision.id] ? (
                            <p className="mt-1 text-[11px] text-danger">{gapActionErrorById[decision.id]}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <p className="text-xs text-foreground-subtle">
            {panelMode === "start"
              ? "Pick how to capture the missing scope facts for this line."
              : panelMode === "choose"
              ? "Select an existing question set from the library."
              : panelMode === "create"
              ? "Create reusable questions, then answer them for this line."
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
              disabled={
                isApplying ||
                gapActionPendingId !== null ||
                answeredCount === 0 ||
                !questionSet ||
                panelMode !== "answer"
              }
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





















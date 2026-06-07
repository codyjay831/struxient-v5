/**
 * Scope Clarification — core types.
 *
 * Pure data shapes only. No DB, no `"use server"`, no React. These describe a
 * data-driven clarification library (reusable questions) and the per-line
 * answers captured against a quote line item.
 *
 * Design rules (see scope clarification plan):
 * - Every reusable question / option / set carries a stable **canonical key**,
 *   not just a display label. Labels can change without breaking stored answers.
 * - Aliases map messy user vocabulary onto canonical records.
 * - Question sets are **versioned** so old answers stay interpretable after the
 *   library changes.
 * - Answers carry denormalized label snapshots so they render even if the
 *   library record is later edited, archived, or merged.
 *
 * This file intentionally does NOT touch execution tasks, signals, or
 * activation. Clarification is an authoring-time scope concern only.
 */

export type ClarificationInputType =
  | "single_choice"
  | "multi_choice"
  | "yes_no_unknown"
  | "short_text"
  | "number"
  | "notes";

export type ClarificationQuestionSetStatus = "draft" | "active" | "archived" | "merged";

/** A controlled choice for a single/multi choice question. */
export type ClarificationOption = {
  /** Canonical option key, e.g. "200a". Stable across label edits. */
  key: string;
  /** Human display label, e.g. "200A". */
  label: string;
  /** Synonyms used for alias matching / AI normalization. */
  aliases?: string[];
};

/** A reusable question definition. */
export type ClarificationQuestion = {
  /** Canonical key, e.g. "electrical.service.new_service_size". */
  key: string;
  label: string;
  inputType: ClarificationInputType;
  helpText?: string;
  /** Options for single/multi choice. Ignored for text/number/notes. */
  options?: ClarificationOption[];
  /** User-vocabulary synonyms that map onto this question. */
  aliases?: string[];
  /** When true, choice questions allow a free-text "Other" value. */
  allowOther?: boolean;
  /** Optional unit hint for number questions, e.g. "ft". */
  unit?: string;
  /**
   * Whether the answer is appropriate to surface in customer-facing scope text.
   * Internal-only facts (e.g. permit logistics) stay out of the customer view.
   */
  customerFacing?: boolean;
};

/** A reusable, versioned group of questions. */
export type ClarificationQuestionSet = {
  /** Canonical key, e.g. "electrical.service_upgrade". */
  key: string;
  /** Monotonic version. Bump when questions change in a breaking way. */
  version: number;
  label: string;
  status: ClarificationQuestionSetStatus;
  /** Short description shown to staff in the picker. */
  description?: string;
  /** User-vocabulary synonyms that map onto this set (for matching + dedupe). */
  aliases: string[];
  questions: ClarificationQuestion[];
  /** Set only when status === "merged"; points at the surviving canonical set. */
  mergedIntoKey?: string;
};

/**
 * Where a question set applies. Bindings keep trade knowledge out of code:
 * a set is matched to a line by tag/classification keys or description keywords.
 */
export type ClarificationBinding = {
  questionSetKey: string;
  /** Classification / tag canonical keys that trigger this set. */
  tagKeys?: string[];
  /** Fallback keywords matched against the line description. */
  keywords?: string[];
};

/* ── Instance answers (per quote line) ─────────────────────────────────── */

export type ClarificationAnswerValue =
  | { kind: "choice"; optionKeys: string[]; otherText?: string | null }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number; unit?: string | null }
  | { kind: "unknown" };

/**
 * A single saved answer. Carries denormalized labels so it remains renderable
 * even if the underlying library question/options are later changed.
 */
export type ClarificationAnswer = {
  questionSetKey: string;
  questionSetVersion: number;
  questionKey: string;
  /** Snapshot of the question label at answer time (version-safe rendering). */
  questionLabelSnapshot: string;
  inputType: ClarificationInputType;
  value: ClarificationAnswerValue;
  /**
   * Snapshot of chosen option labels at answer time, keyed by option key.
   * Lets old answers render correct labels after library edits.
   */
  optionLabelSnapshots?: Record<string, string>;
  /** Whether this fact is customer-facing (snapshot of question setting). */
  customerFacing?: boolean;
};

/**
 * The full clarification answer set for one quote line, ready to persist as
 * JSON (interim) or to map onto durable rows later.
 */
export type LineClarificationAnswers = {
  questionSetKey: string;
  questionSetVersion: number;
  answers: ClarificationAnswer[];
};

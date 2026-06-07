/** Shared clarification types — safe for client imports (no server actions). */
import type {
  ClarificationQuestion,
  ClarificationQuestionSetStatus,
} from "@/lib/clarification/clarification-types";
import type { ClarificationMatchConfidence } from "@/lib/clarification/clarification-matching";
import type {
  ClarificationAnswerGenerationMeta,
  ClarificationAnswerProposal,
} from "@/lib/ai/clarification-answer-proposal-schema";
import type { LineClarificationAnswers } from "@/lib/clarification/clarification-types";

export type ClarificationSetOption = {
  key: string;
  label: string;
  confidence: ClarificationMatchConfidence;
};

export type ClarificationLineModel = {
  lineId: string;
  lineDescription: string;
  /** Top matched set, fully resolved for rendering. Null when nothing matched. */
  matchedSet: {
    key: string;
    version: number;
    label: string;
    status: ClarificationQuestionSetStatus;
    description?: string;
    questions: ClarificationQuestion[];
  } | null;
  /** Alternative sets the user can switch to. */
  alternatives: ClarificationSetOption[];
  /** Previously saved answers for the matched set on this line, if any. */
  savedAnswers: LineClarificationAnswers | null;
};

export type GetClarificationLineModelResult = {
  error?: string;
  model?: ClarificationLineModel;
};

export type ApplyLineClarificationResult = {
  error?: string;
  success?: boolean;
  customerLineCount?: number;
  internalLineCount?: number;
};

export type SuggestLineClarificationResult = {
  error?: string;
  proposal?: ClarificationAnswerProposal;
  generation?: ClarificationAnswerGenerationMeta;
};

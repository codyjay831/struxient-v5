import type { QuoteScopeCaptureSourceFlags } from "@/lib/ai/quote-scope-capture-context";
import type {
  ApplyQuoteScopeSuggestionsInput,
  QuoteScopeSuggestionsGenerationMeta,
  QuoteScopeSuggestionsProposal,
} from "@/lib/ai/quote-line-items-proposal-schema";

export type QuoteScopeSuggestionsGenerateOptions = {
  captureText?: string;
  additionalInstructions?: string;
  sources?: QuoteScopeCaptureSourceFlags;
  priorMissingInfo?: string[];
};

export type QuoteScopeSuggestionsGenerateResult = {
  error?: string;
  proposal?: QuoteScopeSuggestionsProposal;
  generation?: QuoteScopeSuggestionsGenerationMeta;
};

export type QuoteScopeSuggestionsApplyResult = {
  error?: string;
  success?: boolean;
  warnings?: string[];
  createdCount?: number;
};

export type QuoteScopeSuggestionsApplyOptions = {
  approved: ApplyQuoteScopeSuggestionsInput;
  generation?: QuoteScopeSuggestionsGenerationMeta;
};

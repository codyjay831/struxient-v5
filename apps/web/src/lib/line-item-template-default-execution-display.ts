import type {
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
} from "@prisma/client";

export type DefaultExecutionTaskRow = {
  id: string;
  title: string;
  stageId: string | null;
  category: TaskTemplateCategory;
  instructions: string | null;
  sortOrder: number;
  sourceType: LineItemTemplateTaskSource;
  sourceTaskTemplateId: string | null;
  /** Quote-line draft rows only — set when copied from a saved line item default task. */
  sourceLineItemTemplateTaskId?: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  requirementsJson: unknown;
};

export type DefaultExecutionStageGroup = {
  stageId: string | null;
  label: string;
  tasks: DefaultExecutionTaskRow[];
};

export type ReusableTaskPickerOption = {
  id: string;
  title: string;
  stageLabel: string;
  categoryLabel: string;
};

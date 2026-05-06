import type {
  ExecutionStageKey,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
} from "@prisma/client";

export type DefaultExecutionTaskRow = {
  id: string;
  title: string;
  stageKey: ExecutionStageKey;
  category: TaskTemplateCategory;
  instructions: string | null;
  sortOrder: number;
  sourceType: LineItemTemplateTaskSource;
  sourceTaskTemplateId: string | null;
  /** Quote-line draft rows only — set when copied from a saved line item default task. */
  sourceLineItemTemplateTaskId?: string | null;
};

export type DefaultExecutionStageGroup = {
  stageKey: ExecutionStageKey;
  label: string;
  tasks: DefaultExecutionTaskRow[];
};

export type ReusableTaskPickerOption = {
  id: string;
  title: string;
  stageLabel: string;
  categoryLabel: string;
};

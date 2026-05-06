import type { ExecutionStageKey, TaskTemplateCategory } from "@prisma/client";

/** Row shape for Scope Library task template list + edit forms. */
export type TaskTemplateLibraryRow = {
  id: string;
  title: string;
  stageKey: ExecutionStageKey;
  category: TaskTemplateCategory;
  instructions: string | null;
};

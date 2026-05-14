import type { TaskTemplateCategory } from "@prisma/client";

/** Row shape for Scope Library task template list + edit forms. */
export type TaskTemplateLibraryRow = {
  id: string;
  title: string;
  stageId: string | null;
  stageName?: string | null;
  category: TaskTemplateCategory;
  instructions: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  requirementsJson: unknown;
};

import type { TaskTemplateCategory } from "@prisma/client";
import type { TagDisplay } from "./line-item-template-display";

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
  tags: TagDisplay[];
  hardSignal: boolean;
  requirementsJson: unknown;
  partsRequiredJson: unknown;
};

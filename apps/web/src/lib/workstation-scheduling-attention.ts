import { TaskTemplateCategory } from "@prisma/client";

export type SchedulingAttentionOverride = {
  status: string;
  priority: "high";
  group: "ready";
  lens: "today";
  reason: string;
  nextStep: string;
};

export function deriveSchedulingAttentionOverride(input: {
  category: TaskTemplateCategory;
  derivedState: "READY" | "BLOCKED_BY_ISSUE" | "BLOCKED_BY_SIGNAL" | "NEEDS_PROOF" | "COMPLETED";
  dueAt: Date | null;
  scheduledStartAt: Date | null;
}): SchedulingAttentionOverride | null {
  const needsTiming =
    input.category === TaskTemplateCategory.SCHEDULING &&
    input.derivedState === "READY" &&
    !input.dueAt &&
    !input.scheduledStartAt;
  if (!needsTiming) return null;

  return {
    status: "Needs schedule",
    priority: "high",
    group: "ready",
    lens: "today",
    reason: "Coordination task is ready but no due date or schedule block is set.",
    nextStep: "Set due date or scheduled work block.",
  };
}


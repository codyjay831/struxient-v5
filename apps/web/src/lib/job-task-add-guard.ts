import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";
import { TASK_TEMPLATE_FIELD_LIMITS } from "@/app/(workspace)/settings/scope-library/task-template-field-limits";

export type AddJobTaskInput = {
  jobId: string;
  jobStageId: string;
  title: string;
  instructions?: string;
};

export type AddJobTaskValidationContext = {
  jobId: string;
  jobStageId: string;
  stageTitle: string;
  stageBelongsToJob: boolean;
  jobIsActive: boolean;
};

export type AddJobTaskValidationResult =
  | { ok: true; title: string; instructions: string | null }
  | { ok: false; error: string };

export function normalizeJobTaskTitle(title: string): string {
  return title.trim();
}

export function normalizeJobTaskInstructions(
  instructions: string | undefined,
): string | null {
  const trimmed = instructions?.trim();
  return trimmed ? trimmed : null;
}

export function computeNextTaskSortOrder(maxSortOrder: number | null | undefined): number {
  return (maxSortOrder ?? -1) + 1;
}

export function assertCanAddOrdinaryJobTaskToStage(
  context: AddJobTaskValidationContext,
): { ok: true } | { ok: false; error: string } {
  if (!context.jobIsActive) {
    return { ok: false, error: "Tasks can only be added to active jobs." };
  }

  if (!context.stageBelongsToJob) {
    return { ok: false, error: "Stage not found on this job." };
  }

  if (context.stageTitle === CORRECTIONS_STAGE_NAME) {
    return {
      ok: false,
      error:
        "Use Issue / Recovery to add correction tasks. Ordinary tasks cannot be added to the Corrections stage.",
    };
  }

  return { ok: true };
}

export function validateAddJobTaskInput(
  input: AddJobTaskInput,
  context: AddJobTaskValidationContext,
): AddJobTaskValidationResult {
  const stageGate = assertCanAddOrdinaryJobTaskToStage(context);
  if (!stageGate.ok) {
    return stageGate;
  }

  const title = normalizeJobTaskTitle(input.title);
  if (!title) {
    return { ok: false, error: "Task title is required." };
  }

  if (title.length > TASK_TEMPLATE_FIELD_LIMITS.title) {
    return {
      ok: false,
      error: `Task title must be ${TASK_TEMPLATE_FIELD_LIMITS.title} characters or fewer.`,
    };
  }

  const instructions = normalizeJobTaskInstructions(input.instructions);
  if (
    instructions &&
    instructions.length > TASK_TEMPLATE_FIELD_LIMITS.instructions
  ) {
    return {
      ok: false,
      error: `Instructions must be ${TASK_TEMPLATE_FIELD_LIMITS.instructions} characters or fewer.`,
    };
  }

  if (input.jobId.trim() !== context.jobId || input.jobStageId.trim() !== context.jobStageId) {
    return { ok: false, error: "Invalid job or stage reference." };
  }

  return { ok: true, title, instructions };
}

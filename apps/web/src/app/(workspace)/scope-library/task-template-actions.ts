"use server";

import { redirect } from "next/navigation";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import { parseExecutionStageKey } from "@/lib/execution-stage-catalog";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import { TASK_TEMPLATE_FIELD_LIMITS } from "./task-template-field-limits";

export type TaskTemplateFormState = {
  error?: string;
};

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function trimRequired(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): TaskTemplateFormState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

function parseTaskTemplateUpsertForm(
  formData: FormData,
): TaskTemplateFormState | {
  data: {
    title: string;
    stageKey: NonNullable<ReturnType<typeof parseExecutionStageKey>>;
    category: NonNullable<ReturnType<typeof parseTaskTemplateCategory>>;
    instructions: string | null;
  };
} {
  const title = trimRequired(formData.get("title"));
  if (!title) {
    return { error: "Title is required." };
  }
  const titleErr = enforceMaxLength("Title", title, TASK_TEMPLATE_FIELD_LIMITS.title);
  if (titleErr) {
    return titleErr;
  }

  const stageKey = parseExecutionStageKey(formData.get("stageKey"));
  if (!stageKey) {
    return { error: "Choose a valid execution stage." };
  }

  const category = parseTaskTemplateCategory(formData.get("category"));
  if (!category) {
    return { error: "Choose a valid task category." };
  }

  const instructionsRaw = trimOrNull(formData.get("instructions"));
  if (instructionsRaw) {
    const instErr = enforceMaxLength(
      "Instructions",
      instructionsRaw,
      TASK_TEMPLATE_FIELD_LIMITS.instructions,
    );
    if (instErr) {
      return instErr;
    }
  }

  return {
    data: {
      title,
      stageKey,
      category,
      instructions: instructionsRaw,
    },
  };
}

export async function createTaskTemplateFromScopeLibraryAction(
  _prevState: TaskTemplateFormState,
  formData: FormData,
): Promise<TaskTemplateFormState> {
  const parsed = parseTaskTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const org = await getDevOrganizationOrThrow();

  await db.taskTemplate.create({
    data: {
      organizationId: org.id,
      title: parsed.data.title,
      stageKey: parsed.data.stageKey,
      category: parsed.data.category,
      instructions: parsed.data.instructions,
    },
  });

  redirect("/scope-library/tasks");
}

/**
 * `templateId` must be supplied via `.bind(null, template.id)`.
 */
export async function updateTaskTemplateFromScopeLibraryAction(
  templateId: string,
  _prevState: TaskTemplateFormState,
  formData: FormData,
): Promise<TaskTemplateFormState> {
  const tid = templateId.trim();
  if (!tid) {
    return { error: "Missing template id." };
  }

  const parsed = parseTaskTemplateUpsertForm(formData);
  if (!("data" in parsed)) {
    return parsed;
  }

  const org = await getDevOrganizationOrThrow();

  const result = await db.taskTemplate.updateMany({
    where: {
      id: tid,
      organizationId: org.id,
      archivedAt: null,
    },
    data: {
      title: parsed.data.title,
      stageKey: parsed.data.stageKey,
      category: parsed.data.category,
      instructions: parsed.data.instructions,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This reusable task could not be updated. It may be hidden, missing, or outside your organization.",
    };
  }

  redirect("/scope-library/tasks");
}

/**
 * `templateId` must be supplied via `.bind(null, template.id)`.
 */
export async function archiveTaskTemplateFromScopeLibraryAction(
  templateId: string,
  _prevState: TaskTemplateFormState,
  formData: FormData,
): Promise<TaskTemplateFormState> {
  void formData;
  const tid = templateId.trim();
  if (!tid) {
    return { error: "Missing template id." };
  }

  const org = await getDevOrganizationOrThrow();

  const result = await db.taskTemplate.updateMany({
    where: {
      id: tid,
      organizationId: org.id,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  if (result.count === 0) {
    return {
      error:
        "This reusable task could not be hidden. It may already be hidden, missing, or outside your organization.",
    };
  }

  redirect("/scope-library/tasks");
}

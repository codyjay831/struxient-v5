"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { parseTaskTemplateCategory } from "@/lib/task-template-category";
import type { TaskCompletionRequirements } from "@/lib/task-readiness";
import type { TaskResourceRequirement } from "@/lib/task-resource";
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

function parseSignals(value: FormDataEntryValue | null): string[] {
  if (value == null || typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function parseTaskTemplateUpsertForm(
  formData: FormData,
): TaskTemplateFormState | {
  data: {
    title: string;
    stageId: string | null;
    category: NonNullable<ReturnType<typeof parseTaskTemplateCategory>>;
    instructions: string | null;
    providesSignals: string[];
    requiresSignals: string[];
    hardSignal: boolean;
    requirementsJson: TaskCompletionRequirements | null;
    partsRequiredJson: TaskResourceRequirement | null;
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

  const stageId = trimOrNull(formData.get("stageId"));

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

  const providesSignals = parseSignals(formData.get("providesSignals"));
  const requiresSignals = parseSignals(formData.get("requiresSignals"));
  const hardSignal = formData.get("hardSignal") === "on";

  const requirementsJson: TaskCompletionRequirements = {
    noteRequired: formData.get("noteRequired") === "on",
    photoRequired: formData.get("photoRequired") === "on",
    attachmentRequired: formData.get("attachmentRequired") === "on",
  };

  const checklistRaw = formData.get("checklistJson");
  if (typeof checklistRaw === "string" && checklistRaw) {
    try {
      requirementsJson.checklist = JSON.parse(checklistRaw);
    } catch (e) {
      console.error("Failed to parse checklistJson", e);
    }
  }

  const partsRaw = formData.get("partsRequiredJson");
  let partsRequiredJson: TaskResourceRequirement | null = null;
  if (typeof partsRaw === "string" && partsRaw) {
    try {
      partsRequiredJson = JSON.parse(partsRaw);
    } catch (e) {
      console.error("Failed to parse partsRequiredJson", e);
    }
  }

  return {
    data: {
      title,
      stageId,
      category,
      instructions: instructionsRaw,
      providesSignals,
      requiresSignals,
      hardSignal,
      requirementsJson,
      partsRequiredJson,
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

  const ctx = await getRequestContextOrThrow();

  await db.taskTemplate.create({
    data: {
      organizationId: ctx.organizationId,
      title: parsed.data.title,
      stageId: parsed.data.stageId,
      category: parsed.data.category,
      instructions: parsed.data.instructions,
      providesSignals: parsed.data.providesSignals,
      requiresSignals: parsed.data.requiresSignals,
      hardSignal: parsed.data.hardSignal,
      requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  redirect("/settings/scope-library/tasks");
}

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

  const ctx = await getRequestContextOrThrow();

  const result = await db.taskTemplate.updateMany({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
      archivedAt: null,
    },
    data: {
      title: parsed.data.title,
      stageId: parsed.data.stageId,
      category: parsed.data.category,
      instructions: parsed.data.instructions,
      providesSignals: parsed.data.providesSignals,
      requiresSignals: parsed.data.requiresSignals,
      hardSignal: parsed.data.hardSignal,
      requirementsJson: (parsed.data.requirementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      partsRequiredJson: (parsed.data.partsRequiredJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  if (result.count === 0) {
    return {
      error:
        "This reusable task could not be updated. It may be hidden, missing, or outside your organization.",
    };
  }

  redirect("/settings/scope-library/tasks");
}

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

  const ctx = await getRequestContextOrThrow();

  const result = await db.taskTemplate.updateMany({
    where: {
      id: tid,
      organizationId: ctx.organizationId,
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

  redirect("/settings/scope-library/tasks");
}

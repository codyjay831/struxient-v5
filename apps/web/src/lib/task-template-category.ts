import { TaskTemplateCategory } from "@prisma/client";

const CATEGORY_DEFS: readonly { key: TaskTemplateCategory; label: string; sortOrder: number }[] = [
  { key: TaskTemplateCategory.GENERAL, label: "General", sortOrder: 0 },
  { key: TaskTemplateCategory.PERMIT, label: "Permit", sortOrder: 1 },
  { key: TaskTemplateCategory.INSPECTION, label: "Inspection", sortOrder: 2 },
  { key: TaskTemplateCategory.MATERIAL, label: "Material", sortOrder: 3 },
  { key: TaskTemplateCategory.PAYMENT, label: "Payment", sortOrder: 4 },
  { key: TaskTemplateCategory.CUSTOMER_COMMUNICATION, label: "Customer communication", sortOrder: 5 },
  { key: TaskTemplateCategory.PHOTO_EVIDENCE, label: "Photo / evidence", sortOrder: 6 },
  { key: TaskTemplateCategory.SCHEDULING, label: "Scheduling", sortOrder: 7 },
] as const;

const LABEL_BY_KEY = Object.fromEntries(
  CATEGORY_DEFS.map((d) => [d.key, d.label]),
) as Record<TaskTemplateCategory, string>;

export const TASK_TEMPLATE_CATEGORIES_ORDERED: readonly TaskTemplateCategory[] =
  CATEGORY_DEFS.map((d) => d.key);

export function isTaskTemplateCategory(value: string): value is TaskTemplateCategory {
  return (Object.values(TaskTemplateCategory) as string[]).includes(value);
}

export function parseTaskTemplateCategory(
  value: FormDataEntryValue | string | null | undefined,
): TaskTemplateCategory | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return isTaskTemplateCategory(trimmed) ? trimmed : null;
}

export function getTaskTemplateCategoryLabel(key: TaskTemplateCategory): string {
  return LABEL_BY_KEY[key];
}

export function taskTemplateCategorySelectOptions(): {
  value: TaskTemplateCategory;
  label: string;
}[] {
  return CATEGORY_DEFS.map(({ key, label }) => ({ value: key, label }));
}

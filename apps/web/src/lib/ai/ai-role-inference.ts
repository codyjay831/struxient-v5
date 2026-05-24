import { StaffRole, TaskTemplateCategory } from "@prisma/client";
import type { AILibraryProposedTask } from "./library-proposal-schema";

const INSPECTION_SCHEDULE_PATTERN =
  /\b(request|schedule|book|coordinate)\b.*\binspection\b|\binspection\b.*\b(request|schedule|book|coordinate)\b/i;
const INSPECTION_ATTEND_PATTERN =
  /\b(attend|present|on[\s-]?site|onsite|meet inspector)\b.*\binspection\b|\binspection\b.*\b(attend|present|on[\s-]?site|onsite|meet inspector)\b/i;

export function inferAssigneeRoleForTask(task: Pick<AILibraryProposedTask, "title" | "category" | "assigneeRole">): StaffRole | null {
  if (task.assigneeRole) return task.assigneeRole;

  if (
    task.category === TaskTemplateCategory.PERMIT ||
    task.category === TaskTemplateCategory.PAYMENT ||
    task.category === TaskTemplateCategory.SCHEDULING ||
    task.category === TaskTemplateCategory.CUSTOMER_COMMUNICATION
  ) {
    return StaffRole.OFFICE;
  }

  if (task.category === TaskTemplateCategory.INSPECTION) {
    if (INSPECTION_SCHEDULE_PATTERN.test(task.title)) return StaffRole.OFFICE;
    if (INSPECTION_ATTEND_PATTERN.test(task.title)) return StaffRole.FIELD;
    return null;
  }

  if (task.category === TaskTemplateCategory.MATERIAL) {
    if (/\b(order|purchase|procure)\b/i.test(task.title)) return StaffRole.OFFICE;
    if (/\b(stage|load|deliver|install|receive)\b/i.test(task.title)) return StaffRole.FIELD;
    return null;
  }

  return null;
}

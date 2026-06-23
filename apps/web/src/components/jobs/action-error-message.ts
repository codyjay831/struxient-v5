export function getActionErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("internal notes")) {
    return "Internal notes are restricted.";
  }

  if (normalized.includes("not assigned")) {
    return "You are not assigned to this work.";
  }

  if (normalized.includes("payment requirement")) {
    return "You do not have permission to manage payments.";
  }

  if (
    normalized.includes("resolve job issues") ||
    normalized.includes("review daily logs") ||
    normalized.includes("void daily logs") ||
    normalized.includes("override task readiness") ||
    normalized.includes("task schedule") ||
    normalized.includes("task deadlines") ||
    normalized.includes("schedule events") ||
    normalized.includes("schedule blocks") ||
    normalized.includes("this visit") ||
    normalized.includes("visit access details") ||
    normalized.includes("work package") ||
    normalized.includes("field hold")
  ) {
    return "This action is restricted to office users.";
  }

  if (
    normalized.includes("access denied") ||
    normalized.includes("collaborator") ||
    normalized.includes("permission")
  ) {
    return "You do not have access to update this item.";
  }

  return message;
}

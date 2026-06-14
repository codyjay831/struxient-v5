"use server";

import { db } from "@/lib/db";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

export type WorkstationSettingsUpdatePayload = {
  showQuickActions?: boolean;
  quickActions?: string[];
  urgentThresholdHours?: number;
};

export async function updateWorkstationSettingsAction(payload: WorkstationSettingsUpdatePayload) {
  const ctx = await getSettingsRequestContextOrThrow();
  const updates: {
    showQuickActions?: boolean;
    quickActionsJson?: string[];
    urgentThresholdHours?: number;
  } = {};

  if (typeof payload.showQuickActions === "boolean") {
    updates.showQuickActions = payload.showQuickActions;
  }

  if (payload.quickActions !== undefined) {
    const allowed = new Set(["new-intake", "new-quote", "browse-jobs"]);
    const deduped = Array.from(new Set(payload.quickActions));
    if (deduped.some((value) => !allowed.has(value))) {
      return { success: false, error: "Invalid quick action selection." };
    }
    updates.quickActionsJson = deduped;
  }

  if (payload.urgentThresholdHours !== undefined) {
    if (
      !Number.isInteger(payload.urgentThresholdHours) ||
      payload.urgentThresholdHours < 1 ||
      payload.urgentThresholdHours > 168
    ) {
      return { success: false, error: "Urgent threshold must be between 1 and 168 hours." };
    }
    updates.urgentThresholdHours = payload.urgentThresholdHours;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No settings were provided to update." };
  }

  try {
    await db.workstationSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        showQuickActions: updates.showQuickActions ?? true,
        quickActionsJson: updates.quickActionsJson ?? ["new-intake", "new-quote", "browse-jobs"],
        urgentThresholdHours: updates.urgentThresholdHours ?? 24,
      },
      update: updates,
    });

    revalidatePath("/workstation");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to update workstation settings:", error);
    return { success: false, error: "Failed to save settings." };
  }
}

export async function updateWorkstationShowQuickActionsAction(showQuickActions: boolean) {
  return updateWorkstationSettingsAction({ showQuickActions });
}

export async function updateWorkstationUrgentThresholdAction(urgentThresholdHours: number) {
  return updateWorkstationSettingsAction({ urgentThresholdHours });
}

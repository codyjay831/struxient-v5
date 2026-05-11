"use server";

import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

export type WorkstationSettingsUpdatePayload = {
  showQuickActions: boolean;
  quickActions: string[];
  urgentThresholdHours: number;
};

export async function updateWorkstationSettingsAction(payload: WorkstationSettingsUpdatePayload) {
  const ctx = await getRequestContextOrThrow();

  try {
    await db.workstationSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        showQuickActions: payload.showQuickActions,
        quickActionsJson: payload.quickActions,
        urgentThresholdHours: payload.urgentThresholdHours,
      },
      update: {
        showQuickActions: payload.showQuickActions,
        quickActionsJson: payload.quickActions,
        urgentThresholdHours: payload.urgentThresholdHours,
      },
    });

    revalidatePath("/workstation");
    return { success: true };
  } catch (error) {
    console.error("Failed to update workstation settings:", error);
    return { success: false, error: "Failed to save settings." };
  }
}

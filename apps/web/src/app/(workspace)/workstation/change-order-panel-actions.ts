"use server";

import { getCommercialRequestContextOrNull } from "@/lib/auth-context";
import { loadChangeOrderWorkstationPanel } from "@/lib/change-order/change-order-workstation-panel";

export async function loadChangeOrderWorkstationPanelAction(
  changeOrderId: string,
  jobId: string,
) {
  const id = changeOrderId.trim();
  const resolvedJobId = jobId.trim();
  if (!id || !resolvedJobId) {
    return { ok: false as const, error: "Missing Change Order context." };
  }

  const ctx = await getCommercialRequestContextOrNull();
  if (!ctx) {
    return { ok: false as const, error: "You do not have access to Change Order records." };
  }

  const panel = await loadChangeOrderWorkstationPanel({
    organizationId: ctx.organizationId,
    role: ctx.role,
    changeOrderId: id,
    jobId: resolvedJobId,
  });

  if (!panel) {
    return { ok: false as const, error: "Change Order not found in your organization." };
  }

  return { ok: true as const, panel };
}

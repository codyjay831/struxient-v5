import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { resolveWorkstationSelectionSurface } from "@/lib/workstation/selection-routing";

/** Task, job, issue, and change-order items use WorkstationWorkPanel; lead/quote use dedicated dialog bodies. */
export function usesGenericPanel(item: WorkstationWorkItem): boolean {
  const surface = resolveWorkstationSelectionSurface(item);
  return surface === "generic-panel" || surface === "change-order-panel";
}

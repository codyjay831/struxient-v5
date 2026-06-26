import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { resolveWorkstationSelectionSurface } from "@/lib/workstation/selection-routing";

/** Task, job, and issue items use WorkstationWorkPanel; lead/quote/change-order use dedicated dialog bodies. */
export function usesGenericPanel(item: WorkstationWorkItem): boolean {
  const surface = resolveWorkstationSelectionSurface(item);
  return surface === "generic-panel";
}

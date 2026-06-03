import type { WorkstationWorkItem } from "@/lib/workstation-query";

/** Task, job, and issue items use WorkstationWorkPanel; lead/quote use dedicated dialog bodies. */
export function usesGenericPanel(item: WorkstationWorkItem): boolean {
  return item.kind !== "lead" && item.kind !== "quote";
}

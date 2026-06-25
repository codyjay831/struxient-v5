import type { WorkstationWorkItem } from "@/lib/workstation-query";

export type WorkstationSelectionSurface =
  | "lead-opportunity"
  | "quote-opportunity"
  | "quote-workspace"
  | "change-order-panel"
  | "generic-panel";

/** Which drawer body to render for a selected Workstation item. */
export function resolveWorkstationSelectionSurface(
  item: WorkstationWorkItem,
): WorkstationSelectionSurface {
  if (item.kind === "lead") return "lead-opportunity";
  if (item.kind === "change-order") return "change-order-panel";
  if (item.kind === "quote" && item.leadAnchorId) return "quote-opportunity";
  if (item.kind === "quote") return "quote-workspace";
  return "generic-panel";
}

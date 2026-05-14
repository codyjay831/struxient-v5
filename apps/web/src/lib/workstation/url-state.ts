import { WorkstationLens, WorkstationFilterCategory, WorkstationWorkItemKind } from "../workstation-query";

export interface WorkstationSelection {
  id: string;
  kind: WorkstationWorkItemKind;
  step?: string;
}

export interface WorkstationUrlState {
  v: number;
  lens: WorkstationLens;
  filter: WorkstationFilterCategory;
  selected?: WorkstationSelection;
}

const CURRENT_VERSION = 1;

/**
 * Central parser/serializer for Workstation URL state.
 *
 * Schema: ?v=1&lens=&filter=&selectedId=&selectedKind=&step=
 */
export function parseWorkstationUrlState(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
): WorkstationUrlState {
  const get = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) || undefined;
    }
    const val = searchParams[key];
    return typeof val === "string" ? val : undefined;
  };

  const v = parseInt(get("v") || "1", 10);
  const lens = (get("lens") || "attention") as WorkstationLens;
  const filter = (get("filter") || "all") as WorkstationFilterCategory;
  
  const selectedId = get("selectedId");
  const selectedKind = get("selectedKind") as WorkstationWorkItemKind | undefined;
  const step = get("step");

  let selected: WorkstationSelection | undefined;
  if (selectedId && selectedKind) {
    selected = { id: selectedId, kind: selectedKind, step };
  }

  return { v, lens, filter, selected };
}

export function serializeWorkstationUrlState(
  state: Partial<WorkstationUrlState>
): string {
  const p = new URLSearchParams();
  p.set("v", (state.v || CURRENT_VERSION).toString());
  
  if (state.lens && state.lens !== "attention") p.set("lens", state.lens);
  if (state.filter && state.filter !== "all") p.set("filter", state.filter);
  
  if (state.selected) {
    p.set("selectedId", state.selected.id);
    p.set("selectedKind", state.selected.kind);
    if (state.selected.step) p.set("step", state.selected.step);
  }

  const str = p.toString();
  return str ? `?${str}` : "";
}

/**
 * Helper to update existing state and return the new query string.
 */
export function buildWorkstationUrl(
  currentState: WorkstationUrlState,
  updates: Partial<WorkstationUrlState>
): string {
  return serializeWorkstationUrlState({ ...currentState, ...updates });
}

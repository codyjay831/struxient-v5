import {
  WorkstationLens,
  WorkstationFilterCategory,
  WorkstationWorkItemKind,
} from "../workstation-query";

export type WorkstationTab =
  | "overview"
  | "tasks"
  | "jobs"
  | "calendar"
  | "commercial"
  | "money"
  | "activity";

export interface WorkstationSelection {
  id: string;
  kind: WorkstationWorkItemKind;
  /** Optional sub-step hint; panel resolves via work item action* fields in v1. */
  step?: string;
}

export interface WorkstationUrlState {
  v: number;
  tab: WorkstationTab;
  lens: WorkstationLens;
  filter: WorkstationFilterCategory;
  /** Domain queue sidebar filter; "all" is omitted from the URL. */
  queueFilter?: string;
  selected?: WorkstationSelection;
}

const CURRENT_VERSION = 1;

const VALID_TABS = new Set<WorkstationTab>([
  "overview",
  "tasks",
  "jobs",
  "calendar",
  "commercial",
  "money",
  "activity",
]);

/** Map legacy lens URLs to the new tab model. */
export function resolveWorkstationTab(
  tabParam: string | undefined,
  lens: WorkstationLens,
): WorkstationTab {
  if (tabParam && VALID_TABS.has(tabParam as WorkstationTab)) {
    return tabParam as WorkstationTab;
  }
  if (lens === "attention") return "overview";
  if (lens === "today" || lens === "upcoming") return "calendar";
  if (lens === "waiting") return "tasks";
  if (lens === "all") return "tasks";
  return "overview";
}

/**
 * Central parser/serializer for Workstation URL state.
 *
 * Schema: ?v=1&tab=&lens=&filter=&selectedId=&selectedKind=&step=
 */
export function parseWorkstationUrlState(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
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
  const tab = resolveWorkstationTab(get("tab"), lens);

  const queueFilterRaw = get("queueFilter");
  const queueFilter =
    queueFilterRaw && queueFilterRaw !== "all" ? queueFilterRaw : undefined;

  const selectedId = get("selectedId");
  const selectedKind = get("selectedKind") as WorkstationWorkItemKind | undefined;
  const step = get("step");

  let selected: WorkstationSelection | undefined;
  if (selectedId && selectedKind) {
    selected = { id: selectedId, kind: selectedKind, step };
  }

  return { v, tab, lens, filter, queueFilter, selected };
}

export function serializeWorkstationUrlState(
  state: Partial<WorkstationUrlState>,
): string {
  const p = new URLSearchParams();
  p.set("v", (state.v || CURRENT_VERSION).toString());

  if (state.tab && state.tab !== "overview") p.set("tab", state.tab);
  if (state.lens && state.lens !== "attention") p.set("lens", state.lens);
  if (state.filter && state.filter !== "all") p.set("filter", state.filter);
  if (state.queueFilter && state.queueFilter !== "all") {
    p.set("queueFilter", state.queueFilter);
  }

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
  updates: Partial<WorkstationUrlState>,
): string {
  return serializeWorkstationUrlState({ ...currentState, ...updates });
}

export const WORKSTATION_TABS: {
  tab: WorkstationTab;
  label: string;
  description: string;
  /** Queue section heading when different from the tab label. */
  queueHeading?: string;
}[] = [
  { tab: "overview", label: "Overview", description: "Morning command center" },
  { tab: "tasks", label: "Tasks", description: "Assigned, blocked, and ready work" },
  { tab: "jobs", label: "Jobs", description: "Active job health and next steps" },
  { tab: "calendar", label: "Calendar", description: "Schedule, due work, and timing risk" },
  {
    tab: "commercial",
    label: "Sales",
    queueHeading: "Sales Queue",
    description: "Leads, quotes & change orders needing action",
  },
  { tab: "money", label: "Money", description: "Payments due and execution holds" },
  { tab: "activity", label: "Activity", description: "Recent changes and log review" },
];

import { StaffRole } from "@prisma/client";
import { WorkstationLens, WorkstationFilterCategory } from "../workstation-query";
import type { WorkstationTab, WorkstationUrlState } from "./url-state";
import { resolveWorkstationTab } from "./url-state";

export type WorkstationOverviewLimits = {
  criticalPerGroup: number;
  nextActions: number;
  today: number;
  waitingBlocked: number;
  activeJobs: number;
  unassigned: number;
  operationalExceptions: number;
};

export interface RoleFeedSpec {
  role: StaffRole;
  defaultLens: WorkstationLens;
  defaultTab: WorkstationTab;
  allowedLenses: WorkstationLens[];
  allowedTabs: WorkstationTab[];
  defaultFilter: WorkstationFilterCategory;
  overviewLimits: WorkstationOverviewLimits;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const ALL_TABS: WorkstationTab[] = [
  "overview",
  "tasks",
  "jobs",
  "calendar",
  "commercial",
  "money",
  "activity",
];

const FIELD_TABS: WorkstationTab[] = ["overview", "tasks", "jobs", "calendar", "activity"];

const SUBCONTRACTOR_TABS: WorkstationTab[] = ["tasks", "calendar", "activity"];

const VIEWER_TABS: WorkstationTab[] = [
  "overview",
  "tasks",
  "jobs",
  "calendar",
  "commercial",
  "money",
  "activity",
];

const OWNER_LIMITS: WorkstationOverviewLimits = {
  criticalPerGroup: 2,
  nextActions: 6,
  today: 5,
  waitingBlocked: 4,
  activeJobs: 4,
  unassigned: 4,
  operationalExceptions: 3,
};

const FIELD_LIMITS: WorkstationOverviewLimits = {
  criticalPerGroup: 1,
  nextActions: 4,
  today: 8,
  waitingBlocked: 3,
  activeJobs: 2,
  unassigned: 0,
  operationalExceptions: 2,
};

export const ROLE_FEED_SPECS: Record<StaffRole, RoleFeedSpec> = {
  OWNER: {
    role: StaffRole.OWNER,
    defaultLens: "attention",
    defaultTab: "overview",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    allowedTabs: ALL_TABS,
    defaultFilter: "all",
    overviewLimits: OWNER_LIMITS,
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  ADMIN: {
    role: StaffRole.ADMIN,
    defaultLens: "attention",
    defaultTab: "overview",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    allowedTabs: ALL_TABS,
    defaultFilter: "all",
    overviewLimits: OWNER_LIMITS,
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  OFFICE: {
    role: StaffRole.OFFICE,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    allowedTabs: ALL_TABS,
    defaultFilter: "all",
    overviewLimits: {
      criticalPerGroup: 2,
      nextActions: 5,
      today: 6,
      waitingBlocked: 4,
      activeJobs: 4,
      unassigned: 5,
      operationalExceptions: 3,
    },
    priorityWeights: { critical: 1, high: 1, medium: 0.8, low: 0.5 },
  },
  FIELD: {
    role: StaffRole.FIELD,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["today", "waiting", "upcoming"],
    allowedTabs: FIELD_TABS,
    defaultFilter: "tasks",
    overviewLimits: FIELD_LIMITS,
    priorityWeights: { critical: 1, high: 1, medium: 1, low: 0.8 },
  },
  VIEWER: {
    role: StaffRole.VIEWER,
    defaultLens: "all",
    defaultTab: "tasks",
    allowedLenses: ["all"],
    allowedTabs: VIEWER_TABS,
    defaultFilter: "all",
    overviewLimits: {
      criticalPerGroup: 1,
      nextActions: 4,
      today: 3,
      waitingBlocked: 2,
      activeJobs: 2,
      unassigned: 0,
      operationalExceptions: 2,
    },
    priorityWeights: { critical: 1, high: 0.5, medium: 0.2, low: 0 },
  },
  SUBCONTRACTOR: {
    role: StaffRole.SUBCONTRACTOR,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["today", "waiting"],
    allowedTabs: SUBCONTRACTOR_TABS,
    defaultFilter: "tasks",
    overviewLimits: FIELD_LIMITS,
    priorityWeights: { critical: 1, high: 1, medium: 1, low: 0.8 },
  },
};

export function getSpecForRole(role: StaffRole): RoleFeedSpec {
  return ROLE_FEED_SPECS[role] || ROLE_FEED_SPECS.VIEWER;
}

/** Resolve the landing tab when the URL has no explicit tab param. */
export function resolveDefaultWorkstationTab(
  tabParam: string | undefined,
  lens: WorkstationLens,
  role: StaffRole,
): WorkstationTab {
  if (tabParam) {
    return resolveWorkstationTab(tabParam, lens);
  }
  return getSpecForRole(role).defaultTab;
}

/**
 * Clamp URL state to role-allowed tabs/lenses. Returns a new state if adjustment
 * is needed, or null when the state is already valid for the role.
 */
export function clampWorkstationUrlStateForRole(
  state: WorkstationUrlState,
  role: StaffRole,
): WorkstationUrlState | null {
  const spec = getSpecForRole(role);
  let next: WorkstationUrlState | null = null;

  const set = (patch: Partial<WorkstationUrlState>) => {
    next = { ...(next ?? state), ...patch };
  };

  if (!spec.allowedTabs.includes(state.tab)) {
    set({ tab: spec.defaultTab, selected: undefined, queueFilter: undefined });
  }

  if (!spec.allowedLenses.includes(state.lens)) {
    set({ lens: spec.defaultLens });
  }

  if (next == null) return null;
  return next;
}

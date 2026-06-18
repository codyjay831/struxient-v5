import { StaffRole } from "@prisma/client";
import { WorkstationLens, WorkstationFilterCategory } from "../workstation-query";
import type { WorkstationTab } from "./url-state";
import { resolveWorkstationTab } from "./url-state";

export type WorkstationOverviewLimits = {
  criticalPerGroup: number;
  nextActions: number;
  today: number;
};

export interface RoleFeedSpec {
  role: StaffRole;
  defaultLens: WorkstationLens;
  defaultTab: WorkstationTab;
  allowedLenses: WorkstationLens[];
  defaultFilter: WorkstationFilterCategory;
  overviewLimits: WorkstationOverviewLimits;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

const OWNER_LIMITS: WorkstationOverviewLimits = {
  criticalPerGroup: 2,
  nextActions: 6,
  today: 5,
};

const FIELD_LIMITS: WorkstationOverviewLimits = {
  criticalPerGroup: 1,
  nextActions: 4,
  today: 8,
};

export const ROLE_FEED_SPECS: Record<StaffRole, RoleFeedSpec> = {
  OWNER: {
    role: StaffRole.OWNER,
    defaultLens: "attention",
    defaultTab: "overview",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    overviewLimits: OWNER_LIMITS,
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  ADMIN: {
    role: StaffRole.ADMIN,
    defaultLens: "attention",
    defaultTab: "overview",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    overviewLimits: OWNER_LIMITS,
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  OFFICE: {
    role: StaffRole.OFFICE,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    overviewLimits: { criticalPerGroup: 2, nextActions: 5, today: 6 },
    priorityWeights: { critical: 1, high: 1, medium: 0.8, low: 0.5 },
  },
  FIELD: {
    role: StaffRole.FIELD,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["today", "waiting", "upcoming"],
    defaultFilter: "tasks",
    overviewLimits: FIELD_LIMITS,
    priorityWeights: { critical: 1, high: 1, medium: 1, low: 0.8 },
  },
  VIEWER: {
    role: StaffRole.VIEWER,
    defaultLens: "all",
    defaultTab: "tasks",
    allowedLenses: ["all"],
    defaultFilter: "all",
    overviewLimits: { criticalPerGroup: 1, nextActions: 4, today: 3 },
    priorityWeights: { critical: 1, high: 0.5, medium: 0.2, low: 0 },
  },
  SUBCONTRACTOR: {
    role: StaffRole.SUBCONTRACTOR,
    defaultLens: "today",
    defaultTab: "calendar",
    allowedLenses: ["today", "waiting"],
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

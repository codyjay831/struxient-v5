import { StaffRole } from "@prisma/client";
import { WorkstationLens, WorkstationFilterCategory } from "../workstation-query";

export interface RoleFeedSpec {
  role: StaffRole;
  defaultLens: WorkstationLens;
  allowedLenses: WorkstationLens[];
  defaultFilter: WorkstationFilterCategory;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export const ROLE_FEED_SPECS: Record<StaffRole, RoleFeedSpec> = {
  OWNER: {
    role: StaffRole.OWNER,
    defaultLens: "attention",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  ADMIN: {
    role: StaffRole.ADMIN,
    defaultLens: "attention",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    priorityWeights: { critical: 1, high: 0.8, medium: 0.5, low: 0.2 },
  },
  OFFICE: {
    role: StaffRole.OFFICE,
    defaultLens: "today",
    allowedLenses: ["attention", "today", "waiting", "upcoming", "all"],
    defaultFilter: "all",
    priorityWeights: { critical: 1, high: 1, medium: 0.8, low: 0.5 },
  },
  FIELD: {
    role: StaffRole.FIELD,
    defaultLens: "today",
    allowedLenses: ["today", "waiting", "upcoming"],
    defaultFilter: "tasks",
    priorityWeights: { critical: 1, high: 1, medium: 1, low: 0.8 },
  },
  VIEWER: {
    role: StaffRole.VIEWER,
    defaultLens: "all",
    allowedLenses: ["all"],
    defaultFilter: "all",
    priorityWeights: { critical: 1, high: 0.5, medium: 0.2, low: 0 },
  },
  SUBCONTRACTOR: {
    role: StaffRole.SUBCONTRACTOR,
    defaultLens: "today",
    allowedLenses: ["today", "waiting"],
    defaultFilter: "tasks",
    priorityWeights: { critical: 1, high: 1, medium: 1, low: 0.8 },
  },
};

export function getSpecForRole(role: StaffRole): RoleFeedSpec {
  return ROLE_FEED_SPECS[role] || ROLE_FEED_SPECS.VIEWER;
}

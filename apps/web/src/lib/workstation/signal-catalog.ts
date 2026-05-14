import { StaffRole } from "@prisma/client";
import { WorkstationLane } from "./rank";

export interface SignalCopy {
  what: string;
  why: string;
  action: string;
}

export interface SignalCatalogEntry {
  id: string;
  defaultLane: WorkstationLane;
  roleWeights: Record<StaffRole, number>;
  copy: SignalCopy;
  openTarget: {
    surface: "lead" | "quote" | "task" | "job";
    // In a real implementation, this would point to a loader or route
  };
}

export const SIGNAL_CATALOG: Record<string, SignalCatalogEntry> = {
  "job.execution.blocked": {
    id: "job.execution.blocked",
    defaultLane: "critical",
    roleWeights: {
      OWNER: 1,
      ADMIN: 1,
      OFFICE: 0.8,
      FIELD: 0.5,
      VIEWER: 0,
      SUBCONTRACTOR: 0.2,
    },
    copy: {
      what: "Job execution is blocked.",
      why: "A critical issue or payment gate is stopping work.",
      action: "Resolve blocker",
    },
    openTarget: { surface: "job" },
  },
  "task.due_today.assigned": {
    id: "task.due_today.assigned",
    defaultLane: "due",
    roleWeights: {
      OWNER: 0.5,
      ADMIN: 0.5,
      OFFICE: 0.8,
      FIELD: 1,
      VIEWER: 0,
      SUBCONTRACTOR: 1,
    },
    copy: {
      what: "Task is due today.",
      why: "This work is scheduled for today and needs completion.",
      action: "Complete task",
    },
    openTarget: { surface: "task" },
  },
  "lead.ready_to_send_quote": {
    id: "lead.ready_to_send_quote",
    defaultLane: "due",
    roleWeights: {
      OWNER: 0.8,
      ADMIN: 0.8,
      OFFICE: 1,
      FIELD: 0.2,
      VIEWER: 0,
      SUBCONTRACTOR: 0,
    },
    copy: {
      what: "Quote is ready to send.",
      why: "The draft is complete and meets all requirements.",
      action: "Review & send",
    },
    openTarget: { surface: "lead" },
  },
  "delivery.upcoming": {
    id: "delivery.upcoming",
    defaultLane: "upcoming",
    roleWeights: {
      OWNER: 0.2,
      ADMIN: 0.2,
      OFFICE: 0.5,
      FIELD: 1,
      VIEWER: 0,
      SUBCONTRACTOR: 0.8,
    },
    copy: {
      what: "Upcoming delivery.",
      why: "Materials or permits are expected within 48 hours.",
      action: "Prepare for arrival",
    },
    openTarget: { surface: "job" },
  },
  "lead.aging": {
    id: "lead.aging",
    defaultLane: "watch",
    roleWeights: {
      OWNER: 1,
      ADMIN: 1,
      OFFICE: 0.8,
      FIELD: 0,
      VIEWER: 0,
      SUBCONTRACTOR: 0,
    },
    copy: {
      what: "Lead is aging.",
      why: "No progress has been logged for several days.",
      action: "Follow up",
    },
    openTarget: { surface: "lead" },
  },
};

/**
 * Centralized Workstation microcopy.
 */

export const WORKSTATION_LENS_LABELS: Record<
  "attention" | "today" | "waiting" | "upcoming" | "all",
  string
> = {
  attention: "The Board",
  today: "Today",
  waiting: "Waiting",
  upcoming: "Upcoming",
  all: "All items",
};

export const WORKSTATION_COPY = {
  investigate: {
    sectionTitle: "Needs action",
    sectionDescription:
      "Records that are blocked, need a decision, or require follow-up.",
    severityTitle: "Priority",
    previewLabel: "Preview",
    previewTooltip: "Preview signal — live data feeds this section",
    previewSectionTitle: "Signals",
    previewSectionLead:
      "Blocked tasks, payment holds, overdue follow-ups, and coordination needs appear here.",
    emptyTitle: "Nothing needs action right now.",
    emptyDescription:
      "When something is blocked, late, or needs a decision, it surfaces here.",
  },

  severity: {
    high: "High",
    medium: "Medium",
    low: "Low",
  },

  summaryStrip: {
    investigateLabel: "Needs action",
    investigateHint: "Blocked or blocked-pending items.",
    openPipelineLabel: "Open opportunities",
    openPipelineHint: "Opportunity records still in the pipeline.",
    unlinkedLabel: "Unlinked opportunities",
    unlinkedHint: "Opportunities not tied to a customer yet.",
  },

  reservedAreas: {
    title: "Browse",
    description: "Deep views for tasks, jobs, and scheduling.",
    tasksLabel: "Tasks",
    jobsLabel: "Jobs",
    scheduleLabel: "Schedule",
  },

  continuation: {
    backToToday: "← Today",
    backToWorkstation: "← Workstation",
    openLeads: "Sales",
    openCustomers: "Customers",
    openQuotes: "Sales",
    openJobs: "Jobs",
    openSchedule: "Schedule",
    openPayments: "Payments",
  },
} as const;

/**
 * Centralized Workstation microcopy.
 */

export const WORKSTATION_LENS_LABELS: Record<
  "attention" | "today" | "waiting" | "upcoming" | "all",
  string
> = {
  attention: "Needs attention",
  today: "Today",
  waiting: "Waiting",
  upcoming: "Upcoming",
  all: "All",
};

export const WORKSTATION_COPY = {
  investigate: {
    sectionTitle: "Review",
    sectionDescription:
      "Records that need a second look before you move forward.",
    severityTitle: "Priority",
    previewLabel: "Preview",
    previewTooltip: "Sample layout — live data coming soon",
    previewSectionTitle: "Coming soon",
    previewSectionLead:
      "Duplicate detection, quote readiness, payment follow-ups, and activity alerts will show up here.",
    emptyTitle: "Nothing to review right now.",
    emptyDescription:
      "When something looks off or incomplete, it will appear here before it becomes a problem.",
  },

  severity: {
    high: "High",
    medium: "Medium",
    low: "Low",
  },

  summaryStrip: {
    investigateLabel: "Review",
    investigateHint: "Items flagged for a closer look.",
    openPipelineLabel: "Open sales",
    openPipelineHint: "Leads still in the pipeline.",
    unlinkedLabel: "Unlinked",
    unlinkedHint: "Leads not tied to a customer yet.",
  },

  reservedAreas: {
    title: "More views",
    description:
      "Tasks, jobs, and schedule each get their own lens as more data comes online.",
    tasksLabel: "Tasks",
    jobsLabel: "Jobs",
    scheduleLabel: "Schedule",
  },

  continuation: {
    backToToday: "Back to Workstation",
    backToWorkstation: "← Workstation",
    openLeads: "Sales",
    openCustomers: "Customers",
    openQuotes: "Sales",
    openJobs: "Jobs",
    openSchedule: "Schedule",
    openPayments: "Payments",
  },
} as const;

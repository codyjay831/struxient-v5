/**
 * Centralized Workstation microcopy. Importing from here keeps the honesty
 * disclaimers, lens descriptions, and severity labels consistent across pages
 * and avoids drift when copy changes.
 *
 * Only strings that are reused (or that share the same honesty tone) live
 * here. Page-unique paragraphs stay inline at their call site.
 */

export const WORKSTATION_COPY = {
  /** Investigate lane (lib/workstation-investigate-signals.ts + section). */
  investigate: {
    sectionTitle: "Investigate",
    sectionDescription:
      "Records with open questions or missing context. Review these before taking the next step.",
    severityTitle: "Investigate severity",
    previewLabel: "Preview",
    previewTooltip: "Illustrative preview — not derived from live data yet",
    previewSectionTitle: "Coming soon — preview signals",
    previewSectionSalesIntake:
      "These cards show the categories the Investigate lane will surface once duplicate detection, quote readiness scans, payment review, and activity feeds are wired. Not derived from live records.",
    emptyTitle: "No investigation signals right now.",
    emptyDescription:
      "Struxient will surface unclear, risky, or missing-context items here before they become tasks. Only org-scoped sales intake linkage is wired today.",
  },

  /** Severity wording used in AttentionCard pills and elsewhere. */
  severity: {
    high: "High",
    medium: "Medium",
    low: "Low",
  },

  /** Summary-strip counters at the top of Workstation Today. */
  summaryStrip: {
    investigateLabel: "Investigate",
    investigateHint: "Records flagged for review.",
    openPipelineLabel: "Sales pipeline",
    openPipelineHint: "Opportunities in Open or Qualifying.",
    unlinkedLabel: "Unlinked",
    unlinkedHint: "Opportunities with no customer linked yet.",
  },

  /** Reserved-lens footer that replaces the always-on Future Attention Feed. */
  reservedAreas: {
    title: "Reserved lens areas",
    description:
      "Tasks, Jobs, and Schedule lenses will surface their own attention signals as that data becomes derivable. They stay reserved on their own pages so this Today view focuses on what is actionable now.",
    tasksLabel: "Open tasks lens",
    jobsLabel: "Open jobs lens",
    scheduleLabel: "Open schedule lens",
  },

  /** Continuation CTA labels for empty states across Workstation lenses. */
  continuation: {
    backToToday: "Back to Workstation Today",
    backToWorkstation: "← Workstation",
    openSalesIntakes: "Open sales intakes",
    openCustomers: "Open customers",
    openQuotes: "Open quotes",
    openJobs: "Open jobs",
    openSchedule: "Open schedule",
    openPayments: "Open payments (reserved)",
  },
} as const;

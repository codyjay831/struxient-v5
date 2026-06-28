import type { WorkstationWorkItem } from "@/lib/workstation-query";
import type { ScheduleEvent } from "@/lib/schedule-query";
import { getWeekDays, isOnDay } from "@/lib/scheduling/week-range";
import { resolveJobActivitySubtitle } from "@/lib/work-item-context";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { findOrBuildWorkItemForScheduleEvent } from "@/lib/workstation/resolve-work-item-selection";
import { resolveExecutableWorkItem } from "@/lib/workstation/schedule-event-task-routing";
import type { WorkstationOverviewLimits } from "@/lib/workstation/role-feeds";
import { compareWorkstationItemsByRank } from "@/lib/workstation/rank";
import type { Prisma } from "@prisma/client";

const DEFAULT_OVERVIEW_LIMITS: WorkstationOverviewLimits = {
  criticalPerGroup: 2,
  nextActions: 6,
  today: 5,
  waitingBlocked: 3,
  activeJobs: 3,
  unassigned: 3,
  operationalExceptions: 2,
};

export function formatCalendarDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findJobWorkItemForActivity(
  sorted: WorkstationWorkItem[],
  jobId: string,
): WorkstationWorkItem | undefined {
  return sorted.find(
    (item) =>
      item.recordId === jobId &&
      (item.kind === "job" || item.kind === "investigate"),
  );
}

export type WorkstationPresentationTone = "neutral" | "warning" | "danger";

export type WorkstationSignalItem = {
  id: string;
  label: string;
  value: number;
  context: string;
  tone: WorkstationPresentationTone;
  href?: string;
};

export type CriticalCategory =
  | "blocked_jobs"
  | "payment_holds"
  | "schedule_risk"
  | "sales_handoffs"
  | "customer_decisions"
  | "proof_logs";

export const CRITICAL_CATEGORY_LABELS: Record<CriticalCategory, string> = {
  blocked_jobs: "Blocked jobs",
  payment_holds: "Payment holds",
  schedule_risk: "Schedule risk",
  sales_handoffs: "Sales to Production",
  customer_decisions: "Customer decisions",
  proof_logs: "Proof / logs needed",
};

export const CRITICAL_CATEGORY_EMPTY: Record<CriticalCategory, string> = {
  blocked_jobs: "No blocked jobs right now.",
  payment_holds: "No payment holds blocking work.",
  schedule_risk: "No schedule risks flagged.",
  sales_handoffs: "No approved quotes waiting for job setup.",
  customer_decisions: "No customer decisions waiting.",
  proof_logs: "No proof or log review needed.",
};

export type CriticalGroupItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  title: string;
  reason: string;
  categoryLabel: string;
  nextAction: string;
  tone: WorkstationPresentationTone;
};

export type CriticalGroup = {
  category: CriticalCategory;
  label: string;
  items: CriticalGroupItem[];
  emptyMessage: string;
};

export type NeedsActionItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  identity: string;
  workItem: string;
  addressLine?: string;
  reason: string;
  nextAction: string;
  tone: WorkstationPresentationTone;
  categoryLabel?: string;
  badgeLabels?: string[];
};

export type TodayAgendaItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  timeLabel: string;
  identity: string;
  title: string;
  addressLine?: string;
  ownerLabel?: string;
  tone: WorkstationPresentationTone;
  categoryLabel?: string;
  badgeLabels?: string[];
};

export type ActiveJobSignal = {
  id: string;
  selectedId: string;
  selectedKind: string;
  identity: string;
  headline: string;
  signalChips: string[];
  nextAction: string;
  tone: WorkstationPresentationTone;
};

export type WeekPreviewItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  dayLabel: string;
  identity: string;
  title: string;
  tone: WorkstationPresentationTone;
};

export type WeekDaySummary = {
  dayLabel: string;
  date: Date;
  isToday: boolean;
  summary: string;
  eventCount: number;
  riskCount: number;
};

export type WaitingBlockedItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  identity: string;
  holdReason: string;
  context: string;
  tone: WorkstationPresentationTone;
};

export type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  selectedId?: string;
  selectedKind?: string;
  fallbackHref?: string;
};

export type ExceptionItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  identity: string;
  workItem: string;
  reason: string;
  nextAction: string;
  tone: WorkstationPresentationTone;
};

export type UnassignedItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  identity: string;
  workItem: string;
  stageLabel?: string;
  reason: string;
  tone: WorkstationPresentationTone;
};

export type CommercialSegment =
  | "lead"
  | "quote"
  | "change_order"
  | "customer_response"
  | "needs_setup";

export type QueueRowItem = {
  id: string;
  selectedId: string;
  selectedKind: string;
  title: string;
  subtitle: string;
  addressLine?: string;
  reason: string;
  nextAction: string;
  tone: WorkstationPresentationTone;
  statusLabel?: string;
  categoryLabel?: string;
  badgeLabels?: string[];
  /** Commercial tab sidebar filters — an item may belong to multiple segments. */
  commercialSegments?: CommercialSegment[];
  /** YYYY-MM-DD local day key for calendar queue filtering. */
  calendarDay?: string;
  /** Task waiting on prerequisite signals — used by queue filters. */
  isWaiting?: boolean;
};

export type DomainQueues = {
  tasks: QueueRowItem[];
  jobs: QueueRowItem[];
  calendar: QueueRowItem[];
  commercial: QueueRowItem[];
  money: QueueRowItem[];
  activity: QueueRowItem[];
};

export type WorkstationPresentation = {
  signalStrip: {
    actionNowCount: number;
    todayCount: number;
    jobRiskCount: number;
    waitingCount: number;
    scheduleRiskCount: number;
  };
  overviewCriticalGroups: CriticalGroup[];
  overviewNextActions: NeedsActionItem[];
  overviewTodayAgenda: TodayAgendaItem[];
  overviewWeekPreview: WeekDaySummary[];
  domainQueues: DomainQueues;
  /** @deprecated use overviewNextActions */
  needsAction: NeedsActionItem[];
  /** @deprecated use overviewTodayAgenda */
  today: TodayAgendaItem[];
  activeJobs: ActiveJobSignal[];
  /** @deprecated use overviewWeekPreview */
  thisWeek: WeekPreviewItem[];
  waitingBlocked: WaitingBlockedItem[];
  recentActivity: ActivityItem[];
  operationalExceptions: ExceptionItem[];
  overviewUnassigned: UnassignedItem[];
};

type RecentActivityRaw = {
  id: string;
  title: string;
  actorUser: { name: string | null } | null;
  job: {
    id: string;
    title: string;
    customer: { displayName: string | null } | null;
    lead: {
      contact: Prisma.JsonValue;
      request: Prisma.JsonValue;
      address: Prisma.JsonValue;
      signals: Prisma.JsonValue;
    } | null;
  };
};

const CRITICAL_CATEGORY_ORDER: CriticalCategory[] = [
  "payment_holds",
  "blocked_jobs",
  "schedule_risk",
  "sales_handoffs",
  "customer_decisions",
  "proof_logs",
];

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isWaitingItem(item: WorkstationWorkItem): boolean {
  return Boolean(item.isWaitingOnSignals) || item.group === "waiting";
}

function isBlockedItem(item: WorkstationWorkItem): boolean {
  return Boolean(item.isBlocked) && !item.isWaitingOnSignals;
}

function isChangeOrderItem(item: WorkstationWorkItem): boolean {
  return item.kind === "change-order" || item.id.startsWith("change-order-");
}

function isQuoteJobSetupHandoff(item: WorkstationWorkItem): boolean {
  if (isChangeOrderItem(item)) return false;
  if (item.kind !== "quote" || item.filterCategory !== "quotes") return false;
  const actionType = item.workflow?.nextAction?.type;
  if (actionType === "OPEN_EXECUTION_REVIEW" || actionType === "ACTIVATE_JOB") {
    return true;
  }

  const rawAction = (item.actionLabel ?? item.nextStep ?? "").trim();
  return (
    /^Build execution plan\.?$/i.test(rawAction) ||
    /^Review job plan\.?$/i.test(rawAction) ||
    /^Activate job\.?$/i.test(rawAction) ||
    /^Create job\.?$/i.test(rawAction)
  );
}

function normalizeActionLabel(item: WorkstationWorkItem): string {
  const raw = (item.actionLabel ?? item.nextStep ?? "").trim();
  if (raw.length === 0) return "Review details";

  if (/^Complete the task\.?$/i.test(raw)) return "Complete task";
  if (/^Resolve blocker\.?$/i.test(raw)) return "Resolve blocker";
  if (/^Wait for prerequisites\.?$/i.test(raw)) return "Track prerequisites";

  return raw.replace(/\.$/, "");
}

function normalizeReason(item: WorkstationWorkItem): string {
  const raw = item.reason.trim();
  if (raw.length > 0 && !/^Needs attention\.?$/i.test(raw)) {
    return raw;
  }

  if (isBlockedItem(item)) return "Blocked by an open issue.";
  if (isWaitingItem(item)) return "Waiting on prerequisite work.";
  if (item.status === "Overdue") return "Work due date has passed.";
  if (item.status === "Due today") return "Work is due today.";
  if (item.status === "Needs schedule") return "Work cannot proceed until it is scheduled.";

  return "Review this item and confirm the next step.";
}

function compactDetailLine(item: WorkstationWorkItem): string {
  const segments = [normalizeReason(item), item.ageLabel, item.valueLabel]
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment));
  return [...new Set(segments)].join(" · ");
}

function formatStatusBadgeLabel(status?: string): string | null {
  const raw = status?.trim();
  if (!raw) return null;
  return raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isQuoteCustomerResponse(item: WorkstationWorkItem): boolean {
  if (item.kind !== "quote" || isChangeOrderItem(item)) return false;
  const status = (item.status ?? "").toLowerCase();
  if (status === "sent") return true;
  if (status.includes("customer requested")) return true;
  if (status.includes("revision")) return true;
  if (item.workflow?.statusLabel?.toLowerCase().includes("awaiting customer")) return true;
  return false;
}

function isChangeOrderCustomerResponse(item: WorkstationWorkItem): boolean {
  if (!isChangeOrderItem(item)) return false;
  const status = (item.status ?? "").toLowerCase();
  return status.includes("sent") || status.includes("requested");
}

function isChangeOrderNeedsSetup(item: WorkstationWorkItem): boolean {
  if (!isChangeOrderItem(item)) return false;
  const status = (item.status ?? "").toLowerCase();
  return (
    status.includes("accepted") ||
    status.includes("execution review") ||
    status.includes("apply failed")
  );
}

function isLeadCustomerResponse(item: WorkstationWorkItem): boolean {
  if (item.kind !== "lead") return false;
  const status = (item.status ?? "").toLowerCase();
  return status.includes("waiting") || item.group === "waiting";
}

/** Derive commercial tab filter segments from existing work item fields. */
export function resolveCommercialSegments(item: WorkstationWorkItem): CommercialSegment[] {
  const segments = new Set<CommercialSegment>();

  if (item.kind === "lead") {
    segments.add("lead");
  }

  if (item.kind === "quote" && !isChangeOrderItem(item)) {
    segments.add("quote");
  }

  if (isChangeOrderItem(item)) {
    segments.add("change_order");
  }

  if (
    isQuoteCustomerResponse(item) ||
    isChangeOrderCustomerResponse(item) ||
    isLeadCustomerResponse(item)
  ) {
    segments.add("customer_response");
  }

  if (isQuoteJobSetupHandoff(item) || isChangeOrderNeedsSetup(item)) {
    segments.add("needs_setup");
  }

  return [...segments];
}

function resolveCommercialActionChip(item: WorkstationWorkItem): string | null {
  if (isQuoteJobSetupHandoff(item)) return "Set up job";

  if (isChangeOrderItem(item)) {
    const status = (item.status ?? "").toLowerCase();
    if (status.includes("apply failed") || status.includes("execution review")) {
      return "Review and apply";
    }
    if (status.includes("accepted")) return "Apply change order";
    if (status.includes("sent")) return "Waiting on customer";
    if (status.includes("requested")) return "Review customer request";
    return null;
  }

  if (item.kind === "quote") {
    if (isQuoteCustomerResponse(item)) {
      const status = (item.status ?? "").toLowerCase();
      if (status.includes("requested") || status.includes("revision")) {
        return "Review customer request";
      }
      if (status === "sent" || item.workflow?.statusLabel?.toLowerCase().includes("awaiting")) {
        return "Waiting on customer";
      }
    }
  }

  return null;
}

function resolveBadgeLabels(item: WorkstationWorkItem): string[] {
  const typeLabel =
    item.typeLabel ??
    (isChangeOrderItem(item)
      ? "Change Order"
      : item.kind === "quote"
        ? "Quote"
        : item.kind === "lead"
          ? "Lead"
          : item.kind === "job"
            ? "Job"
            : item.kind === "task"
              ? "Task"
              : item.filterCategory === "payments"
                ? "Payment"
                : item.kind === "schedule"
                  ? "Calendar"
                  : null);

  const commercialChip = resolveCommercialActionChip(item);
  const statusLabel = commercialChip ? null : formatStatusBadgeLabel(item.status);
  const labels = [typeLabel, commercialChip ?? statusLabel].filter(
    (label): label is string => Boolean(label),
  );
  if (item.paymentHoldLabel) {
    labels.push("Payment hold");
  }
  return labels;
}

function resolveIdentityAndWorkItem(item: WorkstationWorkItem): {
  identity: string;
  workItem: string;
} {
  const context = item.contextLine ?? item.parentLabel ?? item.subtitle;
  if (item.parentLabel && item.scopeLabel) {
    return {
      identity: `${item.parentLabel} · ${item.scopeLabel}`,
      workItem: item.title,
    };
  }

  if (item.parentLabel && item.parentLabel !== item.title) {
    return {
      identity: item.parentLabel,
      workItem: item.title,
    };
  }

  if (context && context !== item.title) {
    return {
      identity: context,
      workItem: item.title,
    };
  }

  return {
    identity: item.title,
    workItem: item.kind.replace("-", " "),
  };
}

function resolveTone(item: WorkstationWorkItem): WorkstationPresentationTone {
  if (isBlockedItem(item) || item.status === "Overdue" || item.priority === "critical") {
    return "danger";
  }

  if (
    isWaitingItem(item) ||
    item.status === "Due today" ||
    item.status === "Needs schedule" ||
    item.priority === "high"
  ) {
    return "warning";
  }

  return "neutral";
}

function resolveCategoryLabel(item: WorkstationWorkItem): string | undefined {
  if (item.filterCategory === "payments") return "Money";
  if (isQuoteJobSetupHandoff(item)) {
    return "Sales to Production";
  }
  if (item.filterCategory === "leads" || item.filterCategory === "quotes") return "Sales";
  if (item.filterCategory === "tasks") return "Tasks";
  if (item.filterCategory === "jobs" || item.filterCategory === "issues") return "Jobs";
  if (item.filterCategory === "logs") return "Activity";
  if (item.kind === "schedule") return "Calendar";
  return undefined;
}

export function resolveCriticalCategory(item: WorkstationWorkItem): CriticalCategory | null {
  if (item.filterCategory === "payments" && (item.group === "investigate" || isBlockedItem(item))) {
    return "payment_holds";
  }
  if (isQuoteJobSetupHandoff(item)) {
    return "sales_handoffs";
  }
  if (item.status === "Needs schedule" || item.status === "Missed") {
    return "schedule_risk";
  }
  if (item.status === "Needs proof" || item.filterCategory === "logs") {
    return "proof_logs";
  }
  if (
    (item.kind === "lead" || item.kind === "quote") &&
    (item.group === "investigate" || item.lens === "attention")
  ) {
    return "customer_decisions";
  }
  if (isBlockedItem(item)) {
    return "blocked_jobs";
  }
  if (item.priority === "critical" || item.status === "Overdue") {
    if (item.filterCategory === "payments") return "payment_holds";
    if (item.status === "Needs schedule") return "schedule_risk";
    return "blocked_jobs";
  }
  return null;
}

function isNeedsActionItem(item: WorkstationWorkItem): boolean {
  if (isWaitingItem(item)) return false;
  return (
    item.lens === "attention" ||
    item.group === "investigate" ||
    isBlockedItem(item) ||
    item.priority === "critical" ||
    item.status === "Overdue" ||
    item.status === "Due today" ||
    item.status === "Needs schedule" ||
    item.status === "Needs proof"
  );
}

function getNeedsActionPriority(item: WorkstationWorkItem): number {
  if (isBlockedItem(item)) return 0;
  if (item.priority === "critical") return 1;
  if (item.status === "Overdue") return 2;
  if (item.status === "Due today") return 3;
  if (item.status === "Needs proof") return 4;
  if (item.status === "Needs schedule") return 5;
  if (item.group === "investigate") return 6;
  if (item.priority === "high") return 7;
  return 8;
}

function toJobKey(item: WorkstationWorkItem): string | null {
  if (item.kind === "lead" || item.kind === "quote") return null;
  if (item.kind === "job") return item.recordId;
  return item.parentRecordId ?? null;
}

function isTodayItem(item: WorkstationWorkItem, now: Date): boolean {
  if (isWaitingItem(item)) return false;
  if (item.status === "Overdue" || item.status === "Due today" || item.status === "Today") {
    return true;
  }
  if (item.scheduledStartAt && isSameDay(new Date(item.scheduledStartAt), now)) return true;
  if (item.dueAt && isSameDay(new Date(item.dueAt), now)) return true;
  return item.lens === "today";
}

function isScheduleRiskItem(item: WorkstationWorkItem): boolean {
  return item.status === "Needs schedule" || item.status === "Missed";
}

function isUnassignedTask(item: WorkstationWorkItem): boolean {
  return (
    item.kind === "task" &&
    item.assignedUserId == null &&
    item.status !== "Completed" &&
    item.status !== "Canceled"
  );
}

function toUnassignedItem(item: WorkstationWorkItem): UnassignedItem {
  const identityInfo = resolveIdentityAndWorkItem(item);
  return {
    id: item.id,
    selectedId: item.id,
    selectedKind: item.kind,
    identity: identityInfo.identity,
    workItem: identityInfo.workItem,
    stageLabel: item.subtitle?.trim() || undefined,
    reason: compactDetailLine(item),
    tone: resolveTone(item),
  };
}

function isOperationalExceptionItem(item: WorkstationWorkItem): boolean {
  return (
    item.priority === "critical" ||
    item.status === "Overdue" ||
    item.status === "Missed" ||
    (item.filterCategory === "payments" && item.group === "investigate") ||
    (item.filterCategory === "issues" && item.group === "investigate")
  );
}

function toNeedsAction(item: WorkstationWorkItem): NeedsActionItem {
  const identityInfo = resolveIdentityAndWorkItem(item);
  return {
    id: item.id,
    selectedId: item.id,
    selectedKind: item.kind,
    identity: identityInfo.identity,
    workItem: identityInfo.workItem,
    addressLine: item.addressLine?.trim() || undefined,
    reason: compactDetailLine(item),
    nextAction: normalizeActionLabel(item),
    tone: resolveTone(item),
    categoryLabel: resolveCategoryLabel(item),
    badgeLabels: resolveBadgeLabels(item),
  };
}

function toCriticalGroupItem(item: WorkstationWorkItem): CriticalGroupItem {
  const identityInfo = resolveIdentityAndWorkItem(item);
  const category = resolveCriticalCategory(item);
  return {
    id: item.id,
    selectedId: item.id,
    selectedKind: item.kind,
    title: identityInfo.workItem !== item.kind ? identityInfo.identity : item.title,
    reason: compactDetailLine(item),
    categoryLabel: category ? CRITICAL_CATEGORY_LABELS[category] : "Critical",
    nextAction: normalizeActionLabel(item),
    tone: resolveTone(item),
  };
}

function toQueueRow(item: WorkstationWorkItem): QueueRowItem {
  const identityInfo = resolveIdentityAndWorkItem(item);
  const calendarDate = item.scheduledStartAt
    ? new Date(item.scheduledStartAt)
    : item.dueAt
      ? new Date(item.dueAt)
      : null;

  return {
    id: item.id,
    selectedId: item.id,
    selectedKind: item.kind,
    title: identityInfo.workItem,
    subtitle: identityInfo.identity,
    addressLine: item.addressLine?.trim() || undefined,
    reason: compactDetailLine(item),
    nextAction: normalizeActionLabel(item),
    tone: resolveTone(item),
    statusLabel: item.status,
    categoryLabel: resolveCategoryLabel(item),
    badgeLabels: resolveBadgeLabels(item),
    commercialSegments: resolveCommercialSegments(item),
    calendarDay: calendarDate ? formatCalendarDayKey(calendarDate) : undefined,
    isWaiting: Boolean(item.isWaitingOnSignals) || item.group === "waiting",
  };
}

function toExceptionItem(item: WorkstationWorkItem): ExceptionItem {
  const identityInfo = resolveIdentityAndWorkItem(item);
  return {
    id: item.id,
    selectedId: item.id,
    selectedKind: item.kind,
    identity: identityInfo.identity,
    workItem: identityInfo.workItem,
    reason: normalizeReason(item),
    nextAction: normalizeActionLabel(item),
    tone: resolveTone(item),
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildCriticalGroups(
  sorted: WorkstationWorkItem[],
  nextActionIds: Set<string>,
  criticalPerGroup = DEFAULT_OVERVIEW_LIMITS.criticalPerGroup,
): CriticalGroup[] {
  const criticalRaw = sorted
    .filter((item) => resolveCriticalCategory(item) !== null)
    .sort((a, b) => {
      const priorityDiff = getNeedsActionPriority(a) - getNeedsActionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.withinLaneRank - b.withinLaneRank;
    });

  const grouped = new Map<CriticalCategory, CriticalGroupItem[]>();

  for (const item of criticalRaw) {
    const category = resolveCriticalCategory(item);
    if (!category) continue;
    if (nextActionIds.has(item.id) && category !== "sales_handoffs") continue;

    const list = grouped.get(category) ?? [];
    if (list.length >= criticalPerGroup) continue;
    list.push(toCriticalGroupItem(item));
    grouped.set(category, list);
  }

  return CRITICAL_CATEGORY_ORDER.map((category) => ({
    category,
    label: CRITICAL_CATEGORY_LABELS[category],
    items: grouped.get(category) ?? [],
    emptyMessage: CRITICAL_CATEGORY_EMPTY[category],
  }));
}

export function buildDomainQueues(sorted: WorkstationWorkItem[]): DomainQueues {
  const toRows = (predicate: (item: WorkstationWorkItem) => boolean, limit = 25) =>
    dedupeById(sorted.filter(predicate).map(toQueueRow)).slice(0, limit);

  return {
    tasks: toRows(
      (item) =>
        item.kind === "task" ||
        item.filterCategory === "tasks" ||
        (item.kind === "investigate" && item.filterCategory !== "payments"),
    ),
    jobs: toRows(
      (item) =>
        item.kind === "job" ||
        item.filterCategory === "jobs" ||
        item.filterCategory === "issues",
    ),
    calendar: toRows(
      (item) =>
        item.kind === "schedule" ||
        item.lens === "today" ||
        item.lens === "upcoming" ||
        item.status === "Needs schedule" ||
        item.status === "Missed" ||
        Boolean(item.scheduledStartAt),
    ),
    commercial: toRows(
      (item) =>
        item.kind === "lead" ||
        item.kind === "quote" ||
        item.kind === "change-order" ||
        item.filterCategory === "leads" ||
        item.filterCategory === "quotes",
    ),
    money: toRows((item) => item.filterCategory === "payments"),
    activity: toRows(
      (item) =>
        item.filterCategory === "logs" ||
        item.kind === "daily-log" ||
        item.group === "investigate",
      15,
    ),
  };
}

function buildWeekDaySummaries(
  scheduleEvents: ScheduleEvent[],
  sorted: WorkstationWorkItem[],
  now: Date,
): WeekDaySummary[] {
  const weekDays = getWeekDays(now);

  return weekDays.map((day) => {
    const dayEvents = scheduleEvents.filter(
      (event) => event.kind !== "schedule-block" && isOnDay(event.startAt, day.date),
    );
    const dayRisks = sorted.filter(
      (item) =>
        isScheduleRiskItem(item) &&
        ((item.scheduledStartAt && isOnDay(new Date(item.scheduledStartAt), day.date)) ||
          (item.dueAt && isOnDay(new Date(item.dueAt), day.date))),
    );

    let summary = "No scheduled work";
    if (dayEvents.length > 0 && dayRisks.length > 0) {
      summary = `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"} · ${dayRisks.length} risk${dayRisks.length === 1 ? "" : "s"}`;
    } else if (dayEvents.length > 0) {
      summary = `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"} scheduled`;
    } else if (dayRisks.length > 0) {
      summary = `${dayRisks.length} risk${dayRisks.length === 1 ? "" : "s"}`;
    }

    return {
      dayLabel: day.date.toLocaleDateString([], { weekday: "short" }),
      date: day.date,
      isToday: day.isToday,
      summary,
      eventCount: dayEvents.length,
      riskCount: dayRisks.length,
    };
  });
}

export function buildWorkstationPresentation({
  items,
  scheduleEvents,
  recentActivityRaw,
  viewerUserId,
  now,
  overviewLimits = DEFAULT_OVERVIEW_LIMITS,
}: {
  items: WorkstationWorkItem[];
  scheduleEvents: ScheduleEvent[];
  recentActivityRaw: RecentActivityRaw[];
  viewerUserId: string;
  now: Date;
  overviewLimits?: Partial<WorkstationOverviewLimits>;
}): WorkstationPresentation {
  const limits: WorkstationOverviewLimits = {
    ...DEFAULT_OVERVIEW_LIMITS,
    ...overviewLimits,
  };
  const synthesizedTodayItems: WorkstationWorkItem[] = scheduleEvents
    .filter((event) => isOnDay(event.startAt, now) && event.kind !== "schedule-block")
    .flatMap((event) => {
      const linked = findOrBuildWorkItemForScheduleEvent(event, items);
      if (!linked) return [];
      return [resolveExecutableWorkItem(linked, items)];
    });

  const combinedItems = [...items, ...synthesizedTodayItems];
  const sorted = combinedItems.sort(compareWorkstationItemsByRank);

  const needsActionRaw = [...sorted]
    .filter(isNeedsActionItem)
    .sort((a, b) => {
      const priorityDiff = getNeedsActionPriority(a) - getNeedsActionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return compareWorkstationItemsByRank(a, b);
    });
  const overviewNextActions = dedupeById(needsActionRaw.map(toNeedsAction)).slice(
    0,
    limits.nextActions,
  );
  const needsActionIds = new Set(overviewNextActions.map((x) => x.id));

  const todayRaw = sorted.filter((item) => isTodayItem(item, now));
  const overviewTodayAgenda: TodayAgendaItem[] = dedupeById(
    todayRaw.map((item) => {
      const identityInfo = resolveIdentityAndWorkItem(item);
      let timeLabel = "Today";
      if (item.status === "Overdue") timeLabel = "Overdue";
      else if (item.status === "Due today") timeLabel = "Due today";
      else if (item.scheduledStartAt) {
        timeLabel = new Date(item.scheduledStartAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
      }

      return {
        id: item.id,
        selectedId: item.id,
        selectedKind: item.kind,
        identity: identityInfo.identity,
        title: item.title,
        addressLine: item.addressLine?.trim() || undefined,
        timeLabel,
        ownerLabel: item.assignedUserId === viewerUserId ? "You" : undefined,
        tone: resolveTone(item),
        categoryLabel: resolveCategoryLabel(item),
        badgeLabels: resolveBadgeLabels(item),
      };
    }),
  ).slice(0, limits.today);

  const overviewCriticalGroups = buildCriticalGroups(
    sorted,
    needsActionIds,
    limits.criticalPerGroup,
  );

  const jobsMap = new Map<string, WorkstationWorkItem[]>();
  for (const item of sorted) {
    const key = toJobKey(item);
    if (!key) continue;
    let list = jobsMap.get(key);
    if (!list) {
      list = [];
      jobsMap.set(key, list);
    }
    list.push(item);
  }

  const activeJobs: ActiveJobSignal[] = [];
  for (const [, jobItems] of jobsMap.entries()) {
    const jobSorted = [...jobItems].sort((a, b) => {
      const priorityDiff = getNeedsActionPriority(a) - getNeedsActionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return compareWorkstationItemsByRank(a, b);
    });
    const primary = jobSorted[0];
    if (!primary) continue;

    const identityInfo = resolveIdentityAndWorkItem(primary);

    let jobTone: WorkstationPresentationTone = "neutral";
    if (jobItems.some((i) => resolveTone(i) === "danger")) jobTone = "danger";
    else if (jobItems.some((i) => resolveTone(i) === "warning")) jobTone = "warning";

    const headline =
      primary.executionHealthHeadline ??
      (isBlockedItem(primary) ? "Blocked" : (primary.status ?? "Active"));

    const chips: string[] = [];
    const readyTasks = jobItems.filter((i) => i.status === "Ready" || i.status === "Needs proof");
    if (readyTasks.length > 0)
      chips.push(`${readyTasks.length} ready task${readyTasks.length > 1 ? "s" : ""}`);
    const blockers = jobItems.filter(isBlockedItem);
    if (blockers.length > 0)
      chips.push(`${blockers.length} blocker${blockers.length > 1 ? "s" : ""}`);
    const holds = jobItems.filter((i) => i.filterCategory === "payments" && i.group === "investigate");
    if (holds.length > 0) chips.push("payment hold");
    const dueToday = jobItems.filter((i) => i.status === "Due today");
    if (dueToday.length > 0) chips.push("due today");

    activeJobs.push({
      id: primary.id,
      selectedId: primary.id,
      selectedKind: primary.kind,
      identity: identityInfo.identity,
      headline,
      signalChips: chips,
      nextAction: `Next: ${normalizeActionLabel(primary)}`,
      tone: jobTone,
    });
  }
  const deduplicatedJobs = dedupeById(activeJobs).slice(0, limits.activeJobs);

  const weekEvents = scheduleEvents
    .filter((event) => !isOnDay(event.startAt, now) && event.kind !== "schedule-block")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 7);

  const thisWeek: WeekPreviewItem[] = weekEvents.map((event) => {
    const mapped = findOrBuildWorkItemForScheduleEvent(event, items);
    const executable = mapped ? resolveExecutableWorkItem(mapped, items) : null;
    const day = event.startAt.toLocaleDateString([], { weekday: "short" });

    return {
      id: event.id,
      selectedId: executable ? executable.id : event.id,
      selectedKind: executable ? executable.kind : event.kind,
      dayLabel: day,
      identity: event.subtitle ?? event.assigneeLabel ?? "Schedule",
      title: event.title,
      tone: "neutral",
    };
  });

  const overviewWeekPreview = buildWeekDaySummaries(scheduleEvents, sorted, now);

  const waitingBlockedRaw = sorted.filter((item) => isWaitingItem(item) || isBlockedItem(item));
  const waitingBlocked: WaitingBlockedItem[] = dedupeById(
    waitingBlockedRaw.map((item) => {
      const identityInfo = resolveIdentityAndWorkItem(item);
      return {
        id: item.id,
        selectedId: item.id,
        selectedKind: item.kind,
        identity: identityInfo.identity,
        holdReason: isBlockedItem(item) ? "Issue hold" : "External hold",
        context: item.title,
        tone: (isBlockedItem(item) ? "danger" : "warning") as WorkstationPresentationTone,
      };
    }),
  )
    .filter((x) => !needsActionIds.has(x.id))
    .slice(0, limits.waitingBlocked);

  const overviewUnassigned: UnassignedItem[] =
    limits.unassigned > 0
      ? dedupeById(
          sorted
            .filter(isUnassignedTask)
            .filter((x) => !needsActionIds.has(x.id))
            .map(toUnassignedItem),
        ).slice(0, limits.unassigned)
      : [];

  const recentActivity: ActivityItem[] = recentActivityRaw.map((activity) => {
    const jobsite = resolveJobsiteLineForQuoteOrJob({
      serviceLocation: null,
      customerLocations: [],
      leadRow: activity.job.lead
        ? {
            address: activity.job.lead.address as Prisma.JsonValue,
            signals: activity.job.lead.signals,
          }
        : null,
    });
    const jobWorkItem = findJobWorkItemForActivity(sorted, activity.job.id);

    return {
      id: activity.id,
      title: activity.title,
      subtitle: resolveJobActivitySubtitle({
        jobTitle: activity.job.title,
        customer: activity.job.customer,
        lead: activity.job.lead,
        jobsiteLine: jobsite,
        actorName: activity.actorUser?.name,
      }),
      selectedId: jobWorkItem?.id,
      selectedKind: jobWorkItem?.kind,
      fallbackHref: jobWorkItem ? undefined : `/jobs/${activity.job.id}`,
    };
  });

  const exceptionsRaw = sorted.filter(isOperationalExceptionItem);
  const operationalExceptions: ExceptionItem[] = dedupeById(exceptionsRaw.map(toExceptionItem))
    .filter((x) => !needsActionIds.has(x.id))
    .slice(0, limits.operationalExceptions);

  const scheduleRiskCount = sorted.filter(isScheduleRiskItem).length;
  const criticalCount = overviewCriticalGroups.reduce((sum, g) => sum + g.items.length, 0);

  const domainQueues = buildDomainQueues(sorted);

  return {
    signalStrip: {
      actionNowCount: criticalCount + overviewNextActions.length,
      todayCount: overviewTodayAgenda.length,
      jobRiskCount: deduplicatedJobs.filter((row) => row.tone === "danger").length,
      waitingCount: waitingBlocked.length,
      scheduleRiskCount,
    },
    overviewCriticalGroups,
    overviewNextActions,
    overviewTodayAgenda,
    overviewWeekPreview,
    domainQueues,
    needsAction: overviewNextActions,
    today: overviewTodayAgenda,
    activeJobs: deduplicatedJobs,
    thisWeek,
    waitingBlocked,
    recentActivity,
    operationalExceptions,
    overviewUnassigned,
  };
}

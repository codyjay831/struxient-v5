import assert from "node:assert/strict";
import test from "node:test";
import type { WorkstationWorkItem } from "./workstation-query";
import {
  buildWorkstationPresentation,
  buildCriticalGroups,
  buildDomainQueues,
  resolveCriticalCategory,
  resolveCommercialSegments,
} from "./workstation-presentation";
import { applyWorkstationQueueFilter, countWorkstationQueueFilters } from "./workstation/queue-filters";
import { resolveWorkstationTab, WORKSTATION_TABS } from "./workstation/url-state";
import { resolveWorkstationSelectionSurface } from "./workstation/selection-routing";

const now = new Date("2026-06-18T08:00:00.000Z");

function makeItem(overrides: Partial<WorkstationWorkItem>): WorkstationWorkItem {
  return {
    id: "task-1",
    kind: "task",
    title: "Conduct site survey",
    priority: "high",
    group: "active",
    lens: "attention",
    lane: "due",
    withinLaneRank: 1,
    filterCategory: "tasks",
    reason: "Task is due today.",
    nextStep: "Complete the task.",
    recordId: "task-1",
    parentRecordId: "job-1",
    parentLabel: "Cody Barbour",
    updatedAt: now,
    ...overrides,
  };
}

test("resolveWorkstationTab maps legacy lens URLs to tabs", () => {
  assert.equal(resolveWorkstationTab(undefined, "attention"), "overview");
  assert.equal(resolveWorkstationTab(undefined, "today"), "calendar");
  assert.equal(resolveWorkstationTab(undefined, "waiting"), "tasks");
  assert.equal(resolveWorkstationTab("money", "attention"), "money");
});

test("resolveCriticalCategory classifies payment holds and schedule risk", () => {
  const payment = makeItem({
    id: "pay-1",
    filterCategory: "payments",
    group: "investigate",
    kind: "investigate",
  });
  const schedule = makeItem({
    id: "sched-1",
    status: "Needs schedule",
    kind: "task",
  });

  assert.equal(resolveCriticalCategory(payment), "payment_holds");
  assert.equal(resolveCriticalCategory(schedule), "schedule_risk");
});

test("buildWorkstationPresentation groups waiting items separately", () => {
  const waiting = makeItem({
    id: "task-waiting",
    reason: "Needs attention.",
    isWaitingOnSignals: true,
    group: "waiting",
    lens: "waiting",
    nextStep: "Wait for prerequisites.",
  });

  const result = buildWorkstationPresentation({
    items: [waiting],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.waitingBlocked.length, 1);
  assert.equal(result.overviewNextActions.length, 0);
  assert.equal(result.waitingBlocked[0]?.holdReason, "External hold");
});

test("buildWorkstationPresentation keeps today compact when no due work", () => {
  const investigate = makeItem({
    id: "issue-1",
    kind: "investigate",
    title: "Review plan assumptions",
    priority: "medium",
    group: "investigate",
    lens: "attention",
    status: "Action needed",
    reason: "Plan has unresolved execution item.",
  });

  const result = buildWorkstationPresentation({
    items: [investigate],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewNextActions.length, 1);
  assert.equal(result.overviewTodayAgenda.length, 0);
});

test("buildWorkstationPresentation exposes owner and due context when available", () => {
  const dueToday = makeItem({
    id: "task-due",
    status: "Due today",
    dueAt: new Date("2026-06-18T19:00:00.000Z"),
    assignedUserId: "user-1",
    reason: "Needs attention.",
  });

  const result = buildWorkstationPresentation({
    items: [dueToday],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewNextActions.length, 1);
  assert.equal(result.overviewTodayAgenda.length, 1);
  assert.equal(result.activeJobs.length, 1);
  assert.equal(result.overviewTodayAgenda[0]?.ownerLabel, "You");
  assert.equal(result.overviewTodayAgenda[0]?.timeLabel, "Due today");
  assert.equal(result.overviewNextActions[0]?.nextAction, "Complete task");
});

test("buildWorkstationPresentation prioritizes blocked over standard due work", () => {
  const blocked = makeItem({
    id: "task-blocked",
    title: "Resolve permit issue",
    isBlocked: true,
    priority: "critical",
    status: "Blocked",
    group: "blocked",
    lane: "critical",
    reason: "Needs attention.",
    withinLaneRank: 5000,
  });
  const due = makeItem({
    id: "task-due",
    title: "Complete site survey",
    status: "Due today",
    lane: "due",
    reason: "Task is due today.",
    withinLaneRank: 0,
  });

  const result = buildWorkstationPresentation({
    items: [due, blocked],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewNextActions.length, 2);
  assert.equal(result.overviewNextActions[0]?.id, "task-blocked");
  assert.equal(result.operationalExceptions.length, 0);
});

test("buildWorkstationPresentation sorts critical lane above due even with lower withinLaneRank", () => {
  const critical = makeItem({
    id: "critical-task",
    lane: "critical",
    withinLaneRank: 9000,
    priority: "critical",
    reason: "Blocked by issue.",
    isBlocked: true,
    group: "blocked",
  });
  const due = makeItem({
    id: "due-task",
    lane: "due",
    withinLaneRank: 1,
    priority: "high",
    status: "Due today",
    reason: "Due today.",
  });

  const result = buildWorkstationPresentation({
    items: [due, critical],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewNextActions[0]?.id, "critical-task");
});

test("buildWorkstationPresentation summarizes active job health", () => {
  const dueToday = makeItem({
    id: "task-due",
    status: "Due today",
  });
  const readyTask = makeItem({
    id: "task-ready",
    status: "Ready",
  });
  const blocker = makeItem({
    id: "issue-1",
    isBlocked: true,
    status: "Blocked",
    actionLabel: "Resolve blocker",
  });

  const result = buildWorkstationPresentation({
    items: [dueToday, readyTask, blocker],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.activeJobs.length, 1);
  const job = result.activeJobs[0];
  assert.equal(job?.headline, "Blocked");
  assert.equal(job?.tone, "danger");
  assert.ok(job?.signalChips.includes("1 ready task"));
  assert.ok(job?.signalChips.includes("1 blocker"));
  assert.ok(job?.signalChips.includes("due today"));
});

test("buildCriticalGroups dedupes items already in next actions", () => {
  const blocked = makeItem({
    id: "task-blocked",
    isBlocked: true,
    priority: "critical",
    status: "Blocked",
    group: "blocked",
  });

  const sorted = [blocked];
  const nextActionIds = new Set(["task-blocked"]);
  const groups = buildCriticalGroups(sorted, nextActionIds);
  const blockedGroup = groups.find((g) => g.category === "blocked_jobs");

  assert.equal(blockedGroup?.items.length, 0);
});

test("buildDomainQueues filters tasks and money separately", () => {
  const task = makeItem({ id: "t1", kind: "task", filterCategory: "tasks" });
  const payment = makeItem({
    id: "p1",
    kind: "investigate",
    filterCategory: "payments",
    title: "Deposit due",
  });
  const lead = makeItem({
    id: "l1",
    kind: "lead",
    filterCategory: "leads",
    title: "New lead",
  });

  const sorted = [task, payment, lead];
  const queues = buildDomainQueues(sorted);

  assert.equal(queues.tasks.length, 1);
  assert.equal(queues.money.length, 1);
  assert.equal(queues.commercial.length, 1);
  assert.equal(queues.jobs.length, 0);
});

test("buildWorkstationPresentation surfaces quote handoffs as critical sales to production work", () => {
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    filterCategory: "quotes",
    title: "Estimate / Quote - Cody Barbour",
    parentLabel: "Cody Barbour",
    scopeLabel: "Bathroom remodel",
    addressLine: "123 Main St, Springfield",
    ageLabel: "Age 4d",
    valueLabel: "$8,450",
    typeLabel: "Quote",
    status: "APPROVED",
    reason: "Approved quote is waiting for job setup.",
    nextStep: "Build execution plan.",
    recordId: "quote-1",
  });

  const result = buildWorkstationPresentation({
    items: [quote],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewNextActions[0]?.identity, "Cody Barbour · Bathroom remodel");
  assert.equal(result.overviewNextActions[0]?.addressLine, "123 Main St, Springfield");
  assert.equal(
    result.overviewNextActions[0]?.reason,
    "Approved quote is waiting for job setup. · Age 4d · $8,450",
  );
  assert.equal(result.overviewNextActions[0]?.nextAction, "Build execution plan");
  assert.equal(result.overviewNextActions[0]?.categoryLabel, "Sales to Production");
  assert.deepEqual(result.overviewNextActions[0]?.badgeLabels, ["Quote", "Set up job"]);
  assert.equal(
    result.overviewCriticalGroups.find((group) => group.category === "sales_handoffs")?.items[0]
      ?.categoryLabel,
    "Sales to Production",
  );
});

test("buildWorkstationPresentation builds seven-day week preview", () => {
  const result = buildWorkstationPresentation({
    items: [],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.equal(result.overviewWeekPreview.length, 7);
  assert.ok(result.overviewWeekPreview.some((day) => day.isToday));
});

test("buildWorkstationPresentation exposes critical groups with categories", () => {
  const payment = makeItem({
    id: "pay-1",
    filterCategory: "payments",
    group: "investigate",
    kind: "investigate",
    priority: "critical",
    lens: "attention",
  });

  const result = buildWorkstationPresentation({
    items: [payment],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  const paymentGroup = result.overviewCriticalGroups.find(
    (g) => g.category === "payment_holds",
  );
  assert.ok(paymentGroup);
  assert.equal(paymentGroup?.items.length, 0);
  assert.equal(result.overviewNextActions.length, 1);
});

test("buildWorkstationPresentation respects role overview limits", () => {
  const items = Array.from({ length: 8 }, (_, index) =>
    makeItem({
      id: `task-${index}`,
      title: `Task ${index}`,
      withinLaneRank: index + 1,
      priority: index === 0 ? "critical" : "high",
      reason: `Reason ${index}`,
    }),
  );

  const result = buildWorkstationPresentation({
    items,
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
    overviewLimits: { criticalPerGroup: 1, nextActions: 3, today: 2 },
  });

  assert.equal(result.overviewNextActions.length, 3);
});

test("buildDomainQueues includes calendarDay for scheduled items", () => {
  const scheduled = makeItem({
    id: "task-scheduled",
    scheduledStartAt: new Date("2026-06-19T14:00:00.000Z"),
    lens: "today",
  });

  const queues = buildDomainQueues([scheduled]);
  assert.equal(queues.calendar[0]?.calendarDay, "2026-06-19");
});

test("buildWorkstationPresentation surfaces unassigned tasks for office roles", () => {
  const unassigned = makeItem({
    id: "task-unassigned",
    assignedUserId: null,
    status: "Ready",
    lens: "upcoming",
    priority: "medium",
    group: "active",
    reason: "Task is ready to complete.",
  });
  const assigned = makeItem({
    id: "task-assigned",
    assignedUserId: "user-2",
    status: "Ready",
  });

  const result = buildWorkstationPresentation({
    items: [unassigned, assigned],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
    overviewLimits: { unassigned: 3 },
  });

  assert.equal(result.overviewUnassigned.length, 1);
  assert.equal(result.overviewUnassigned[0]?.id, "task-unassigned");
});

test("buildWorkstationPresentation adds payment hold badge on tasks", () => {
  const held = makeItem({
    id: "task-held",
    paymentHoldLabel: "Deposit",
    status: "Ready",
  });

  const result = buildWorkstationPresentation({
    items: [held],
    scheduleEvents: [],
    recentActivityRaw: [],
    viewerUserId: "user-1",
    now,
  });

  assert.ok(result.domainQueues.tasks[0]?.badgeLabels?.includes("Payment hold"));
});

test("applyWorkstationQueueFilter waiting filter matches prerequisite holds", () => {
  const waiting = {
    id: "row-wait",
    selectedId: "task-w",
    selectedKind: "task",
    title: "Install panels",
    reason: "Waiting",
    nextAction: "Wait",
    tone: "warning" as const,
    isWaiting: true,
  };
  const ready = {
    id: "row-ready",
    selectedId: "task-r",
    selectedKind: "task",
    title: "Rough-in",
    reason: "Ready",
    nextAction: "Complete",
    tone: "neutral" as const,
    isWaiting: false,
  };

  const filtered = applyWorkstationQueueFilter([waiting, ready], "tasks", "waiting");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, "row-wait");
});

test("WORKSTATION_TABS commercial label and description", () => {
  const commercial = WORKSTATION_TABS.find((t) => t.tab === "commercial");
  assert.equal(commercial?.label, "Commercial");
  assert.equal(commercial?.tab, "commercial");
  assert.match(commercial?.description ?? "", /change orders needing action/i);
});

test("resolveCommercialSegments separates change orders from quotes", () => {
  const changeOrder = makeItem({
    id: "change-order-co1",
    kind: "change-order",
    filterCategory: "quotes",
    typeLabel: "Change Order",
    status: "Change Order SENT",
    title: "CO-001 · Add panel",
  });

  assert.deepEqual(resolveCommercialSegments(changeOrder), [
    "change_order",
    "customer_response",
  ]);
});

test("commercial queue filters use segments not title substring", () => {
  const lead = makeItem({ id: "lead-1", kind: "lead", filterCategory: "leads" });
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    filterCategory: "quotes",
    title: "Bathroom remodel",
    status: "DRAFT",
  });
  const changeOrder = makeItem({
    id: "change-order-1",
    kind: "change-order",
    filterCategory: "quotes",
    typeLabel: "Change Order",
    status: "Change Order ACCEPTED",
    title: "CO-001 · Extra work",
    nextStep: "Apply accepted Change Order.",
  });
  const handoff = makeItem({
    id: "quote-handoff",
    kind: "quote",
    filterCategory: "quotes",
    status: "APPROVED",
    nextStep: "Build execution plan.",
  });
  const customerQuote = makeItem({
    id: "quote-sent",
    kind: "quote",
    filterCategory: "quotes",
    status: "SENT",
  });

  const rows = buildDomainQueues([lead, quote, changeOrder, handoff, customerQuote]).commercial;

  assert.equal(applyWorkstationQueueFilter(rows, "commercial", "leads").length, 1);
  assert.equal(applyWorkstationQueueFilter(rows, "commercial", "quotes").length, 3);
  assert.equal(applyWorkstationQueueFilter(rows, "commercial", "change-orders").length, 1);
  assert.equal(applyWorkstationQueueFilter(rows, "commercial", "needs-setup").length, 2);
  assert.equal(applyWorkstationQueueFilter(rows, "commercial", "customer-responses").length, 1);

  const filters = [
    { label: "All", filter: "all" },
    { label: "Leads", filter: "leads" },
    { label: "Quotes", filter: "quotes" },
    { label: "Change Orders", filter: "change-orders" },
    { label: "Customer responses", filter: "customer-responses" },
    { label: "Needs setup", filter: "needs-setup" },
  ];
  const counts = countWorkstationQueueFilters(rows, "commercial", filters);
  assert.equal(counts["change-orders"], 1);
  assert.equal(counts["needs-setup"], 2);
});

test("change order queue row uses Change Order badge not Quote", () => {
  const changeOrder = makeItem({
    id: "change-order-1",
    kind: "change-order",
    filterCategory: "quotes",
    typeLabel: "Change Order",
    status: "Change Order ACCEPTED",
    title: "CO-001 · Panel upgrade",
    nextStep: "Apply accepted Change Order.",
  });

  const row = buildDomainQueues([changeOrder]).commercial[0];
  assert.deepEqual(row?.badgeLabels, ["Change Order", "Apply change order"]);
  assert.equal(row?.categoryLabel, "Commercial");
});

test("customer requested quote changes appear under customer responses filter", () => {
  const quote = makeItem({
    id: "quote-revision",
    kind: "quote",
    filterCategory: "quotes",
    status: "Customer requested changes",
    nextStep: "Create revision draft.",
  });

  const row = buildDomainQueues([quote]).commercial[0];
  assert.ok(row?.commercialSegments?.includes("customer_response"));
  assert.ok(row?.commercialSegments?.includes("quote"));
  assert.deepEqual(row?.badgeLabels, ["Quote", "Review customer request"]);
  assert.equal(
    applyWorkstationQueueFilter([row!], "commercial", "customer-responses").length,
    1,
  );
});

test("approved quote handoff appears under needs setup with Set up job chip", () => {
  const handoff = makeItem({
    id: "quote-handoff",
    kind: "quote",
    filterCategory: "quotes",
    status: "APPROVED",
    nextStep: "Activate job.",
    reason: "Approved quote is waiting for job setup.",
  });

  const row = buildDomainQueues([handoff]).commercial[0];
  assert.ok(row?.commercialSegments?.includes("needs_setup"));
  assert.deepEqual(row?.badgeLabels, ["Quote", "Set up job"]);
  assert.equal(applyWorkstationQueueFilter([row!], "commercial", "needs-setup").length, 1);
});

test("queue rows expose nextAction for commercial cards", () => {
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    filterCategory: "quotes",
    reason: "Quote draft needs review.",
    nextStep: "Send quote.",
  });

  const row = buildDomainQueues([quote]).commercial[0];
  assert.equal(row?.nextAction, "Send quote");
  assert.equal(row?.reason, "Quote draft needs review.");
});

test("change order selection surface avoids quote workspace drawer", () => {
  const changeOrder = makeItem({
    id: "change-order-1",
    kind: "change-order",
    recordId: "co-record-id",
    filterCategory: "quotes",
    href: "/jobs/job-1/change-orders?focus=co-record-id",
  });
  const quote = makeItem({
    id: "quote-1",
    kind: "quote",
    recordId: "quote-id",
    filterCategory: "quotes",
  });

  assert.equal(resolveWorkstationSelectionSurface(changeOrder), "change-order-panel");
  assert.equal(resolveWorkstationSelectionSurface(quote), "quote-workspace");
});

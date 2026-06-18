import assert from "node:assert/strict";
import test from "node:test";
import type { WorkstationWorkItem } from "./workstation-query";
import {
  buildWorkstationPresentation,
  buildCriticalGroups,
  buildDomainQueues,
  resolveCriticalCategory,
} from "./workstation-presentation";
import { resolveWorkstationTab } from "./workstation/url-state";

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
    reason: "Needs attention.",
  });
  const due = makeItem({
    id: "task-due",
    title: "Complete site survey",
    status: "Due today",
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

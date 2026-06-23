"use client";

import { useMemo, useState, useTransition } from "react";
import {
  JobScheduleEventCompletionOutcome,
  JobScheduleEventKind,
  JobScheduleEventStatus,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  cancelJobScheduleEventFromScheduleAction,
  completeJobScheduleEventFromScheduleAction,
  confirmJobScheduleEventAction,
  createJobScheduleEventAction,
  linkTasksToScheduleEventAction,
  rescheduleJobScheduleEventFromScheduleAction,
} from "@/app/(workspace)/schedule/schedule-actions";
import { getActionErrorMessage } from "@/components/jobs/action-error-message";

type ScheduleTask = { id: string; title: string; status: "TODO" | "DONE" | "CANCELED" };

type ScheduleEventRow = {
  id: string;
  title: string | null;
  kind: JobScheduleEventKind;
  status: JobScheduleEventStatus;
  startAt: Date;
  endAt: Date;
  completionOutcome: JobScheduleEventCompletionOutcome | null;
  taskLinks: Array<{ jobTask: ScheduleTask }>;
};

export function JobScheduleEventsPanel({
  jobId,
  events,
  tasks,
}: {
  jobId: string;
  events: ScheduleEventRow[];
  tasks: ScheduleTask[];
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<JobScheduleEventKind>(JobScheduleEventKind.CREW_WORK);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [externalWindowStartAt, setExternalWindowStartAt] = useState("");
  const [externalWindowEndAt, setExternalWindowEndAt] = useState("");
  const [customerVisible, setCustomerVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openTasks = useMemo(() => tasks.filter((task) => task.status === "TODO"), [tasks]);

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((value) => value !== taskId)
        : [...previous, taskId],
    );
  };

  return (
    <WorkspacePanel className="mb-6">
      <SectionHeading
        title="Schedule events"
        description="Canonical commitments for this job. Use outcomes to support split and return scheduling."
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <input
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          placeholder="Event title (optional)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={kind}
          onChange={(event) => setKind(event.target.value as JobScheduleEventKind)}
        >
          {Object.values(JobScheduleEventKind).map((option) => (
            <option key={option} value={option}>
              {option.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={startAt}
          onChange={(event) => setStartAt(event.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={endAt}
          onChange={(event) => setEndAt(event.target.value)}
        />
        <input
          type="datetime-local"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={externalWindowStartAt}
          onChange={(event) => setExternalWindowStartAt(event.target.value)}
          placeholder="External window start (optional)"
        />
        <input
          type="datetime-local"
          className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
          value={externalWindowEndAt}
          onChange={(event) => setExternalWindowEndAt(event.target.value)}
          placeholder="External window end (optional)"
        />
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={customerVisible}
          onChange={(event) => setCustomerVisible(event.target.checked)}
        />
        Customer visible
      </label>

      {openTasks.length > 0 ? (
        <div className="mb-4 rounded border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Link tasks (optional)
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {openTasks.slice(0, 20).map((task) => (
              <label key={task.id} className="flex items-center gap-2 text-xs text-foreground-muted">
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                />
                <span>{task.title}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        size="sm"
        disabled={!startAt || !endAt || isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await createJobScheduleEventAction({
              jobId,
              kind,
              title: title || undefined,
              startAt: new Date(startAt),
              endAt: new Date(endAt),
              status: JobScheduleEventStatus.TENTATIVE,
              taskIds: selectedTaskIds,
              externalWindowStartAt: externalWindowStartAt
                ? new Date(externalWindowStartAt)
                : null,
              externalWindowEndAt: externalWindowEndAt
                ? new Date(externalWindowEndAt)
                : null,
              customerVisible,
            });
            if (result.error) {
              setMessage(getActionErrorMessage(result.error));
              return;
            }
            setMessage("Event created.");
            setTitle("");
            setStartAt("");
            setEndAt("");
            setExternalWindowStartAt("");
            setExternalWindowEndAt("");
            setCustomerVisible(false);
            setSelectedTaskIds([]);
          })
        }
      >
        {isPending ? "Saving..." : "Create tentative event"}
      </Button>

      {message ? <p className="mt-2 text-xs text-foreground-muted">{message}</p> : null}

      <div className="mt-6 space-y-3">
        {events.length === 0 ? (
          <p className="text-xs text-foreground-muted">No schedule events on this job.</p>
        ) : (
          events.map((event) => {
            const remainingTaskIds = event.taskLinks
              .filter((link) => link.jobTask.status === "TODO")
              .map((link) => link.jobTask.id);
            return (
              <div key={event.id} className="rounded border border-border bg-surface p-3">
                <p className="text-sm font-semibold text-foreground">
                  {event.title || event.kind.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-foreground-muted">
                  {event.status} · {event.startAt.toLocaleString()} -{" "}
                  {event.endAt.toLocaleString()}
                </p>
                {event.completionOutcome ? (
                  <p className="text-xs text-foreground-muted">
                    Outcome: {event.completionOutcome.replaceAll("_", " ")}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {event.status === JobScheduleEventStatus.TENTATIVE ? (
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await confirmJobScheduleEventAction(event.id);
                          if (result.error) {
                            setMessage(getActionErrorMessage(result.error));
                            return;
                          }
                          setMessage("Event confirmed.");
                        })
                      }
                    >
                      Confirm
                    </Button>
                  ) : null}
                  {(event.status === JobScheduleEventStatus.TENTATIVE ||
                    event.status === JobScheduleEventStatus.CONFIRMED) && (
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await cancelJobScheduleEventFromScheduleAction(
                            event.id,
                            "Canceled from job panel.",
                          );
                          if (result.error) {
                            setMessage(getActionErrorMessage(result.error));
                            return;
                          }
                          setMessage("Event canceled.");
                        })
                      }
                    >
                      Cancel
                    </Button>
                  )}
                  {event.status === JobScheduleEventStatus.CONFIRMED ? (
                    <>
                      <Button
                        size="sm"
                        variant="muted"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await completeJobScheduleEventFromScheduleAction(
                              event.id,
                              JobScheduleEventCompletionOutcome.PARTIAL_WORK,
                              "Partial work recorded from job panel.",
                            );
                            if (result.error) {
                              setMessage(getActionErrorMessage(result.error));
                              return;
                            }
                            setMessage("Event marked partial.");
                          })
                        }
                      >
                        Complete partial
                      </Button>
                      <Button
                        size="sm"
                        variant="muted"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await completeJobScheduleEventFromScheduleAction(
                              event.id,
                              JobScheduleEventCompletionOutcome.WORK_COMPLETED,
                              "Work completed.",
                            );
                            if (result.error) {
                              setMessage(getActionErrorMessage(result.error));
                              return;
                            }
                            setMessage("Event completed.");
                          })
                        }
                      >
                        Complete fully
                      </Button>
                    </>
                  ) : null}
                  {event.status === JobScheduleEventStatus.COMPLETED &&
                  event.completionOutcome ===
                    JobScheduleEventCompletionOutcome.PARTIAL_WORK &&
                  remainingTaskIds.length > 0 ? (
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const created = await createJobScheduleEventAction({
                            jobId,
                            kind: event.kind,
                            title: `${event.title || "Return work"} (return)`,
                            startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                            endAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
                            status: JobScheduleEventStatus.TENTATIVE,
                          });
                          if (created.error || !created.eventId) {
                            if (created.error) {
                              setMessage(getActionErrorMessage(created.error));
                            }
                            return;
                          }
                          const linkResult = await linkTasksToScheduleEventAction(
                            created.eventId,
                            remainingTaskIds,
                          );
                          if (linkResult.error) {
                            setMessage(getActionErrorMessage(linkResult.error));
                            return;
                          }
                          setMessage("Return work event created.");
                        })
                      }
                    >
                      Schedule return work ({remainingTaskIds.length})
                    </Button>
                  ) : null}
                  {(event.status === JobScheduleEventStatus.TENTATIVE ||
                    event.status === JobScheduleEventStatus.CONFIRMED) && (
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await rescheduleJobScheduleEventFromScheduleAction(event.id, {
                            startAt: new Date(event.startAt.getTime() + 24 * 60 * 60 * 1000),
                            endAt: new Date(event.endAt.getTime() + 24 * 60 * 60 * 1000),
                            reason: "Shifted by one day from job panel.",
                          });
                          if (result.error) {
                            setMessage(getActionErrorMessage(result.error));
                            return;
                          }
                          setMessage("Event rescheduled.");
                        })
                      }
                    >
                      Shift +1 day
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </WorkspacePanel>
  );
}

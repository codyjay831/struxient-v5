"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  taskStateLabel,
  taskStateTone,
  type TaskDerivedState,
} from "@/lib/task-readiness";
import type {
  JobExecutionTimelineRow,
  JobExecutionTimelineSegment,
  JobExecutionViewModel,
} from "@/lib/job-execution-view-model";
import {
  timelineBarLayout,
  timelinePositionPercent,
} from "@/lib/job-execution-view-model";

const LABEL_WIDTH_PX = 220;
const MIN_TRACK_WIDTH_PX = 640;
const ROW_HEIGHT_PX = 36;
const STAGE_ROW_HEIGHT_PX = 28;

function formatRangeLabel(rangeStart: string, rangeEnd: string): string {
  const start = new Date(rangeStart).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const end = new Date(rangeEnd).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

function segmentBarClass(segment: JobExecutionTimelineSegment): string {
  if (segment.kind === "work_package") {
    return "border border-foreground/15 bg-foreground/[0.06]";
  }
  if (segment.status === "CONFIRMED") {
    return "border border-accent/50 bg-accent/35";
  }
  if (segment.status === "TENTATIVE") {
    return "border border-dashed border-accent/40 bg-accent/15";
  }
  if (segment.status === "COMPLETED") {
    return "border border-foreground/20 bg-foreground/[0.12]";
  }
  return "border border-foreground/20 bg-foreground/[0.08]";
}

function TaskTrack({
  row,
  rangeStart,
  rangeEnd,
  onSelectTask,
}: {
  row: Extract<JobExecutionTimelineRow, { type: "task" }>;
  rangeStart: string;
  rangeEnd: string;
  onSelectTask: (taskId: string) => void;
}) {
  const hasSegments = row.segments.length > 0;
  const hasDue = row.dueAt != null;
  const isEmpty = !hasSegments && !hasDue;

  return (
    <button
      type="button"
      onClick={() => onSelectTask(row.taskId)}
      className="relative h-full w-full min-w-0 text-left"
      title={row.title}
    >
      <div className="absolute inset-0 rounded bg-foreground/[0.02]" />

      {row.segments.map((segment) => {
        const { left, width } = timelineBarLayout(
          segment.startAt,
          segment.endAt,
          rangeStart,
          rangeEnd,
        );
        return (
          <div
            key={segment.id}
            className={`absolute top-1.5 h-5 rounded-sm ${segmentBarClass(segment)}`}
            style={{ left: `${left}%`, width: `${width}%`, minWidth: "4px" }}
            title={`${segment.label}: ${new Date(segment.startAt).toLocaleString()} – ${new Date(segment.endAt).toLocaleString()}`}
          />
        );
      })}

      {row.dueAt ? (
        <span
          className="absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-warning bg-surface"
          style={{
            left: `${timelinePositionPercent(row.dueAt, rangeStart, rangeEnd)}%`,
          }}
          title={`Due ${new Date(row.dueAt).toLocaleDateString()}`}
        />
      ) : null}

      {isEmpty ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-foreground-subtle">
          {row.needsScheduling ? "Needs schedule" : "Unscheduled"}
        </span>
      ) : null}
    </button>
  );
}

function rowTrackBackground(derivedState: TaskDerivedState | undefined): string {
  if (derivedState === "BLOCKED_BY_ISSUE" || derivedState === "BLOCKED_BY_SIGNAL") {
    return "bg-warning/[0.04]";
  }
  if (derivedState === "COMPLETED") {
    return "bg-foreground/[0.03]";
  }
  return "";
}

export function JobExecutionTimelineView({
  viewModel,
  onSelectTask,
}: {
  viewModel: JobExecutionViewModel;
  onSelectTask: (taskId: string) => void;
}) {
  const { timeline, summary } = viewModel;
  const taskRows = timeline.rows.filter(
    (row): row is Extract<JobExecutionTimelineRow, { type: "task" }> =>
      row.type === "task",
  );

  if (taskRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/60 px-4 py-6 text-xs leading-relaxed text-foreground-muted">
        <p className="font-medium text-foreground">No tasks to place on the timeline</p>
        <p className="mt-1">
          Add execution tasks in Work plan, then set work group dates, schedule field events, or
          task deadlines to fill in the chart.
        </p>
      </div>
    );
  }

  const todayLeft = timelinePositionPercent(
    timeline.todayAt,
    timeline.rangeStart,
    timeline.rangeEnd,
  );
  const columnCount = Math.max(timeline.columns.length, 1);
  const trackWidth = Math.max(MIN_TRACK_WIDTH_PX, columnCount * 56);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-foreground-subtle">
          {formatRangeLabel(timeline.rangeStart, timeline.rangeEnd)}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-foreground-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm border border-accent/50 bg-accent/35" />
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm border border-foreground/15 bg-foreground/[0.06]" />
            Work group plan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rotate-45 border-2 border-warning bg-surface" />
            Due date
          </span>
          {summary.needsSchedulingCount > 0 ? (
            <span className="font-medium text-warning">
              {summary.needsSchedulingCount} need scheduling
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface/40">
        <div style={{ minWidth: LABEL_WIDTH_PX + trackWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 grid border-b border-border bg-surface"
            style={{
              gridTemplateColumns: `${LABEL_WIDTH_PX}px ${trackWidth}px`,
            }}
          >
            <div className="border-r border-border px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Task
            </div>
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
            >
              {timeline.columns.map((column) => (
                <div
                  key={column.key}
                  className="border-r border-border/60 px-1 py-2 text-center text-[10px] font-medium text-foreground-muted last:border-r-0"
                >
                  {column.label}
                </div>
              ))}
              {todayLeft >= 0 && todayLeft <= 100 ? (
                <div
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent"
                  style={{ left: `${todayLeft}%` }}
                  aria-hidden
                />
              ) : null}
            </div>
          </div>

          {/* Body rows */}
          {timeline.rows.map((row) => {
            if (row.type === "stage") {
              return (
                <div
                  key={`stage-${row.stageId}`}
                  className="grid border-b border-border bg-foreground/[0.03]"
                  style={{
                    gridTemplateColumns: `${LABEL_WIDTH_PX}px ${trackWidth}px`,
                    minHeight: STAGE_ROW_HEIGHT_PX,
                  }}
                >
                  <div
                    className="col-span-2 flex items-center px-3 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle"
                  >
                    {row.title}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={row.taskId}
                className={`grid border-b border-border/70 ${rowTrackBackground(row.derivedState)}`}
                style={{
                  gridTemplateColumns: `${LABEL_WIDTH_PX}px ${trackWidth}px`,
                  minHeight: ROW_HEIGHT_PX,
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelectTask(row.taskId)}
                  className="flex items-center gap-2 border-r border-border px-3 py-1.5 text-left hover:bg-foreground/[0.02]"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {row.title}
                  </span>
                  <StatusBadge
                    label={taskStateLabel(row.derivedState)}
                    tone={taskStateTone(row.derivedState)}
                  />
                </button>
                <div className="relative min-h-[36px] p-0.5">
                  <div
                    className="pointer-events-none absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {timeline.columns.map((column) => (
                      <div
                        key={`grid-${row.taskId}-${column.key}`}
                        className="border-r border-border/40 last:border-r-0"
                      />
                    ))}
                  </div>
                  {todayLeft >= 0 && todayLeft <= 100 ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent/60"
                      style={{ left: `${todayLeft}%` }}
                      aria-hidden
                    />
                  ) : null}
                  <TaskTrack
                    row={row}
                    rangeStart={timeline.rangeStart}
                    rangeEnd={timeline.rangeEnd}
                    onSelectTask={onSelectTask}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-foreground-subtle">
        {timeline.scheduledTaskCount} of {taskRows.length} tasks have schedule data. Work group
        bands are planning forecasts; solid bars are calendar commitments. Click a row to open the
        task in Work plan.
      </p>
    </div>
  );
}

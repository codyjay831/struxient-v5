"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JobStatus } from "@prisma/client";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { confirmJobScheduleCleanupAction } from "@/app/(workspace)/jobs/job-schedule-cleanup-actions";
import type { ScheduleCleanupReviewItem } from "@/lib/scheduling/job-cancel-cleanup";
import { AlertTriangle, Loader2 } from "lucide-react";

type Props = {
  jobId: string;
  jobStatus: JobStatus;
  reviewItems: ScheduleCleanupReviewItem[];
};

export function JobScheduleCleanupReview({ jobId, jobStatus, reviewItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reviewReason, setReviewReason] = useState("");
  const [spawnFollowUps, setSpawnFollowUps] = useState(true);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(
    null,
  );

  const initialChecked = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of reviewItems) {
      map.set(item.id, item.preselected);
    }
    return map;
  }, [reviewItems]);

  const [checked, setChecked] = useState<Map<string, boolean>>(initialChecked);
  const [reasons, setReasons] = useState<Map<string, string>>(new Map());

  if (jobStatus !== JobStatus.ARCHIVED || reviewItems.length === 0) {
    return null;
  }

  const toggleChecked = (eventId: string, value: boolean) => {
    setChecked((prev) => new Map(prev).set(eventId, value));
  };

  const handleSubmit = () => {
    setMessage(null);
    startTransition(async () => {
      const selections = reviewItems.map((item) => ({
        eventId: item.id,
        cancel: checked.get(item.id) ?? false,
        reason: reasons.get(item.id) || undefined,
        explicitlySelected: item.requiresExplicitReview ? checked.get(item.id) === true : true,
      }));

      const result = await confirmJobScheduleCleanupAction({
        jobId,
        reviewReason,
        selections,
        spawnExternalFollowUpTasks: spawnFollowUps,
      });

      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }

      setMessage({ tone: "success", text: "Schedule cleanup review completed." });
      router.refresh();
    });
  };

  return (
    <section className="mb-8">
      <SectionHeading
        title="Schedule cleanup review"
        description="This job is archived. Future calendar events were not canceled automatically. Review each commitment and confirm cancellations explicitly."
      />
      <WorkspacePanel className="space-y-4 border-warning/30 bg-warning/5">
        <div className="flex items-start gap-2 text-sm text-foreground-muted">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" />
          <p>
            Internal crew/office blocks are preselected for cancellation. Customer, inspection, utility,
            and other external appointments require an explicit checkbox and reason before canceling.
          </p>
        </div>

        <ul className="space-y-3">
          {reviewItems.map((item) => {
            const isChecked = checked.get(item.id) ?? false;
            return (
              <li
                key={item.id}
                className="rounded-lg border border-border bg-background/80 p-3"
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={isChecked}
                    onChange={(e) => toggleChecked(item.id, e.target.checked)}
                    disabled={isPending}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {item.title ?? item.kindLabel}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {item.kindLabel} · {item.status.toLowerCase()} ·{" "}
                      {item.startAt.toLocaleString()} – {item.endAt.toLocaleString()}
                    </p>
                    {item.requiresExplicitReview ? (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-warning-strong">
                        External — explicit review required
                      </p>
                    ) : (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                        Internal — preselected
                      </p>
                    )}
                    {isChecked && item.status === "CONFIRMED" ? (
                      <input
                        type="text"
                        className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                        placeholder="Reason for canceling this confirmed event"
                        value={reasons.get(item.id) ?? ""}
                        onChange={(e) =>
                          setReasons((prev) => new Map(prev).set(item.id, e.target.value))
                        }
                        disabled={isPending}
                      />
                    ) : null}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
            Cleanup review reason
          </span>
          <input
            type="text"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Why is this schedule being cleaned up?"
            value={reviewReason}
            onChange={(e) => setReviewReason(e.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-foreground-muted">
          <input
            type="checkbox"
            checked={spawnFollowUps}
            onChange={(e) => setSpawnFollowUps(e.target.checked)}
            disabled={isPending}
          />
          Create follow-up tasks for canceled external appointments
        </label>

        {message ? (
          <p
            className={
              message.tone === "error" ? "text-sm text-danger-strong" : "text-sm text-approved-strong"
            }
          >
            {message.text}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !reviewReason.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Confirm schedule cleanup
        </button>
      </WorkspacePanel>
    </section>
  );
}

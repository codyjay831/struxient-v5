"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { JobIssueSeverity, JobIssueType, JobTaskStatus } from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  deriveTaskState,
  taskStateLabel,
  taskStateTone,
  type TaskCompletionRequirements,
} from "@/lib/task-readiness";
import { completeJobTaskAction, updateJobTaskStatusAction } from "@/app/(workspace)/jobs/job-task-actions";
import {
  uploadTaskAttachmentAction,
  getTaskAttachmentUploadUrlAction,
  completeTaskAttachmentUploadAction,
} from "@/app/(workspace)/jobs/attachment-actions";
import { createJobIssueAction } from "@/app/(workspace)/jobs/job-issue-actions";
import { formatJobIssueSeverity, formatJobIssueType } from "@/lib/job-issue-display";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";
import {
  AlertCircle,
  Camera,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Play,
  X,
} from "lucide-react";

export type TaskWorkSurfaceProps = JobTaskExecutionPayload & {
  /** When true, completing the task clears Workstation `selectedId` / `selectedKind` and refreshes. */
  clearWorkstationSelectionOnComplete?: boolean;
  showCloseControl?: boolean;
  onClose?: () => void;
};

export function TaskWorkSurface({
  jobId,
  jobStageId,
  stageTitle,
  jobContextLabel,
  jobHref,
  task: initialTask,
  clearWorkstationSelectionOnComplete,
  showCloseControl,
  onClose,
}: TaskWorkSurfaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [task, setTask] = useState(initialTask);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setTask(initialTask);
    setNote(initialTask.completionNote || "");
  }, [
    initialTask.id,
    initialTask.status,
    initialTask.completedAt,
    initialTask.completionNote,
    initialTask.attachments.map((a) => a.id).join(","),
    initialTask.issues.map((i) => `${i.status}:${i.severity}`).join("|"),
    initialTask.paymentBlockers.map((p) => `${p.status}:${p.title}`).join("|"),
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [showNoteForm, setShowForm] = useState(false);
  const [note, setNote] = useState(task.completionNote || "");
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportType, setReportType] = useState<JobIssueType>(JobIssueType.OTHER);
  const [reportSeverity, setReportSeverity] = useState<JobIssueSeverity>(JobIssueSeverity.BLOCKS_WORK);
  const [isReporting, setIsReporting] = useState(false);

  const refreshAfterMutation = useCallback(() => {
    router.refresh();
  }, [router]);

  const clearWorkstationSelection = useCallback(() => {
    if (!clearWorkstationSelectionOnComplete) return;
    const p = new URLSearchParams(searchParams.toString());
    p.delete("selectedId");
    p.delete("selectedKind");
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [clearWorkstationSelectionOnComplete, pathname, router, searchParams]);

  const derivedState = deriveTaskState(task);
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};

  const isCompleted = derivedState === "COMPLETED";
  const isBlocked = derivedState === "BLOCKED";
  const needsProof = derivedState === "NEEDS_PROOF";

  const paymentBlocker = task.paymentBlockers.find((p) => p.status === "DUE");

  const handleComplete = () => {
    setActionMessage(null);
    if (needsProof && !showNoteForm) {
      setShowForm(true);
      return;
    }

    startTransition(async () => {
      const result = await completeJobTaskAction(task.id, note);
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
      } else {
        setShowForm(false);
        setActionMessage({ tone: "success", text: "Task completed." });
        setTask((t) => ({
          ...t,
          status: JobTaskStatus.DONE,
          completedAt: new Date(),
          completionNote: note.trim() || t.completionNote,
        }));
        refreshAfterMutation();
        if (clearWorkstationSelectionOnComplete) {
          clearWorkstationSelection();
        }
      }
    });
  };

  const handleStartTask = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await updateJobTaskStatusAction(task.id, JobTaskStatus.IN_PROGRESS);
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
      } else {
        setTask((t) => ({ ...t, status: JobTaskStatus.IN_PROGRESS }));
        refreshAfterMutation();
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setActionMessage(null);

    try {
      const prep = await getTaskAttachmentUploadUrlAction(task.id, file.name, file.type, file.size);

      if (prep.error) {
        setActionMessage({ tone: "error", text: prep.error });
        setIsUploading(false);
        return;
      }

      if (prep.storageProvider === "local") {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadTaskAttachmentAction(task.id, formData);
        if (result.error) {
          setActionMessage({ tone: "error", text: result.error });
        } else {
          setActionMessage({ tone: "success", text: "Attachment added." });
          refreshAfterMutation();
        }
      } else if (prep.uploadUrl) {
        const response = await fetch(prep.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        const result = await completeTaskAttachmentUploadAction(prep.attachmentId!);
        if (result.error) {
          setActionMessage({ tone: "error", text: result.error });
        } else {
          setActionMessage({ tone: "success", text: "Attachment added." });
          refreshAfterMutation();
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
      setActionMessage({ tone: "error", text: "Failed to upload file. Please try again." });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim()) return;

    setIsReporting(true);
    setActionMessage(null);

    try {
      await createJobIssueAction({
        jobId,
        jobStageId,
        jobTaskId: task.id,
        title: reportTitle.trim(),
        type: reportType,
        severity: reportSeverity,
        description: reportDescription.trim() || undefined,
      });
      setReportTitle("");
      setReportDescription("");
      setShowReportForm(false);
      setActionMessage({ tone: "success", text: "Issue recorded for this task." });
      refreshAfterMutation();
    } catch (err) {
      setActionMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to record issue.",
      });
    } finally {
      setIsReporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {showCloseControl && onClose && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-foreground/[0.01] p-5">
        <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">Job</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{jobContextLabel}</p>
        <p className="mt-2 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">Stage</p>
        <p className="mt-0.5 text-xs text-foreground-muted">{stageTitle}</p>
        <Link
          href={jobHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground"
        >
          Open full job record
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold tracking-tight text-foreground">{task.title}</h3>
        <StatusBadge label={taskStateLabel(derivedState, task)} tone={taskStateTone(derivedState)} />
      </div>

      {task.instructions && (
        <div>
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Instructions
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{task.instructions}</p>
        </div>
      )}

      {requirements.noteRequired && !isCompleted && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-warning-strong">
          <MessageSquare className="size-3" />
          <span>Completion note required</span>
        </div>
      )}

      {(requirements.photoRequired || requirements.attachmentRequired) && !isCompleted && (
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-warning-strong">
          {requirements.photoRequired ? <Camera className="size-3" /> : <Paperclip className="size-3" />}
          <span>{requirements.photoRequired ? "Photo proof required" : "Attachment required"}</span>
        </div>
      )}

      {isBlocked && (
        <div className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-danger-strong">
          <Lock className="size-3 shrink-0" />
          <span>
            {paymentBlocker ? `Blocked by unpaid payment: ${paymentBlocker.title}` : "Blocked by open issue"}
          </span>
        </div>
      )}

      {task.attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Attachments</p>
          <div className="flex flex-wrap gap-2">
            {task.attachments.map((att) => (
              <a
                key={att.id}
                href={`/api/media/attachments/${att.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-surface-strong px-2 py-1.5 text-xs transition-colors hover:border-border-strong"
              >
                {att.contentType.startsWith("image/") ? (
                  <Camera className="size-3 text-foreground-muted" />
                ) : (
                  <FileText className="size-3 text-foreground-muted" />
                )}
                <span className="max-w-[160px] truncate text-foreground-muted">{att.fileName}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {!isCompleted && !isBlocked && (
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-all hover:border-border-strong hover:text-foreground">
            {isUploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            <span>{isUploading ? "Uploading..." : "Add proof / attachment"}</span>
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading || isPending}
              accept="image/*,application/pdf"
            />
          </label>
        </div>
      )}

      {showNoteForm && !isCompleted && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Completion note {requirements.noteRequired ? "*" : "(optional)"}
            </span>
            <textarea
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
              rows={3}
              placeholder="What was the outcome?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
      )}

      {isCompleted && task.completionNote && (
        <div className="rounded-md bg-foreground/[0.03] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Outcome</p>
          <p className="mt-0.5 text-xs italic text-foreground-muted">{task.completionNote}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {task.status === JobTaskStatus.TODO && !isCompleted && !isBlocked && (
          <button
            type="button"
            onClick={handleStartTask}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-border-strong disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            Start task
          </button>
        )}

        {!isCompleted && !isBlocked && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 ${
              needsProof && !showNoteForm
                ? "border border-border bg-surface text-foreground hover:border-border-strong"
                : "bg-accent text-accent-contrast hover:opacity-90"
            }`}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isPending ? "Working…" : needsProof && !showNoteForm ? "Add proof / note" : "Complete task"}
          </button>
        )}

        {!isCompleted && (
          <button
            type="button"
            onClick={() => {
              setShowReportForm((v) => !v);
              setActionMessage(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            <AlertCircle className="size-3.5" />
            {showReportForm ? "Cancel report" : "Report problem"}
          </button>
        )}
      </div>

      {showReportForm && !isCompleted && (
        <form onSubmit={handleReportSubmit} className="space-y-3 rounded-lg border border-border bg-surface/80 p-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
            Record an issue on this task
          </p>
          <input
            required
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder="Short title"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none"
          />
          <textarea
            value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)}
            placeholder="Details (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Type
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as JobIssueType)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
              >
                {Object.values(JobIssueType).map((t) => (
                  <option key={t} value={t}>
                    {formatJobIssueType(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Severity
              <select
                value={reportSeverity}
                onChange={(e) => setReportSeverity(e.target.value as JobIssueSeverity)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
              >
                {Object.values(JobIssueSeverity).map((s) => (
                  <option key={s} value={s}>
                    {formatJobIssueSeverity(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReportForm(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isReporting || isPending || !reportTitle.trim()}
              className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider text-background disabled:opacity-50"
            >
              {isReporting ? "Recording…" : "Record issue"}
            </button>
          </div>
        </form>
      )}

      {actionMessage && (
        <p
          className={
            actionMessage.tone === "success"
              ? "rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success"
              : "rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
          }
        >
          {actionMessage.text}
        </p>
      )}
    </div>
  );
}

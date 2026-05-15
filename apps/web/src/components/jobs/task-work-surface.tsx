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
import {
  completeJobTaskAction,
  overrideJobTaskReadinessAction,
  toggleJobTaskChecklistItemAction,
} from "@/app/(workspace)/jobs/job-task-actions";
import {
  uploadTaskAttachmentAction,
  getTaskAttachmentUploadUrlAction,
  completeTaskAttachmentUploadAction,
} from "@/app/(workspace)/jobs/attachment-actions";
import { createJobIssueAction } from "@/app/(workspace)/jobs/job-issue-actions";
import { formatJobIssueSeverity, formatJobIssueType } from "@/lib/job-issue-display";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { RecoveryFlowBuilder } from "./recovery-flow-builder";
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
  ShieldAlert,
  X,
} from "lucide-react";

export type TaskWorkSurfaceProps = JobTaskExecutionPayload & {
  /** When true, completing the task clears Workstation `selectedId` / `selectedKind` and refreshes. */
  clearWorkstationSelectionOnComplete?: boolean;
  showCloseControl?: boolean;
  onClose?: () => void;
  liveSignals: string[];
};

const addressPrimaryBtnClass =
  "inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:py-2 sm:text-xs sm:font-medium";

const actionBtnBaseClass =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-bold transition-all disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs sm:font-semibold";

export function TaskWorkSurface({
  jobId,
  jobStageId,
  stageTitle,
  jobContextLabel,
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  jobHref,
  task: initialTask,
  clearWorkstationSelectionOnComplete,
  showCloseControl,
  onClose,
  liveSignals,
}: TaskWorkSurfaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [task, setTask] = useState(initialTask);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [showNoteForm, setShowForm] = useState(false);
  const [note, setNote] = useState(initialTask.completionNote || "");

  const attachmentSyncKey = initialTask.attachments.map((a) => a.id).join(",");
  const issuesSyncKey = initialTask.issues.map((i) => `${i.status}:${i.severity}`).join("|");
  const paymentSyncKey = initialTask.paymentBlockers.map((p) => `${p.status}:${p.title}`).join("|");

  /* Sync local editor state when the server task snapshot changes (e.g. after router.refresh()). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop→state sync; avoids stale edits after refresh
    setTask(initialTask);
    setNote(initialTask.completionNote || "");
  }, [
    initialTask,
    initialTask.id,
    initialTask.status,
    initialTask.completedAt,
    initialTask.completionNote,
    attachmentSyncKey,
    issuesSyncKey,
    paymentSyncKey,
  ]);
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string; issueId?: string } | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const hasJobsite = Boolean(jobsiteAddressLine?.trim());
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [showReportForm, setShowReportForm] = useState(false);
  const [showRecoveryBuilder, setShowRecoveryBuilder] = useState(false);
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

  const derivedState = deriveTaskState(task as any, liveSignals, {
    recoveryFlowIssueId: task.recoveryFlow?.jobIssueId
  });
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};

  const isCompleted = derivedState === "COMPLETED";
  const isBlockedByIssue = derivedState === "BLOCKED_BY_ISSUE";
  const isBlockedBySignal = derivedState === "BLOCKED_BY_SIGNAL";
  const isBlocked = isBlockedByIssue || isBlockedBySignal;
  const needsProof = derivedState === "NEEDS_PROOF";

  const paymentBlocker = task.paymentBlockers.find((p) => p.status === "DUE");
  const missingSignals = task.requiresSignals.filter(s => !liveSignals.includes(s));

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

  const handleOverride = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await overrideJobTaskReadinessAction(task.id, note);
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
      } else {
        setShowForm(false);
        setActionMessage({ tone: "success", text: "Task completed via manager override." });
        setTask((t) => ({
          ...t,
          status: JobTaskStatus.DONE,
          completedAt: new Date(),
          completionNote: note.trim() || "MANAGER OVERRIDE",
        }));
        refreshAfterMutation();
        if (clearWorkstationSelectionOnComplete) {
          clearWorkstationSelection();
        }
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
      const result = await createJobIssueAction({
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
      setActionMessage({ 
        tone: "success", 
        text: "Issue recorded for this task.",
        issueId: result.issueId 
      });
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

  const handleToggleChecklist = (itemId: string, completed: boolean) => {
    startTransition(async () => {
      const result = await toggleJobTaskChecklistItemAction(task.id, itemId, completed);
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
      } else {
        refreshAfterMutation();
      }
    });
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-foreground">{task.title}</h3>
          <StatusBadge label={taskStateLabel(derivedState)} tone={taskStateTone(derivedState)} />
        </div>
        {showCloseControl && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-foreground-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <details className="group rounded-xl border border-border bg-foreground/[0.01]">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-3.5 shrink-0 text-foreground-subtle transition-transform group-open:rotate-90"
            aria-hidden
          />
          <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Job Context
          </span>
          <span className="ml-auto truncate text-[0.65rem] text-foreground-subtle group-open:hidden">
            {jobContextLabel} · {stageTitle}
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4 pt-3">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">Job</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{jobContextLabel}</p>
          </div>
          {hasJobsite ? (
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                Jobsite address
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground-muted">{jobsiteAddressLine}</p>
            </div>
          ) : (
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                Jobsite address needed
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
                Add the project address before scheduling or field visits.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {customerId ? (
                  <button
                    type="button"
                    onClick={() => setAddressDialogOpen(true)}
                    className={addressPrimaryBtnClass}
                  >
                    Add jobsite address
                  </button>
                ) : null}
                {!customerId && leadEditHref ? (
                  <Link href={leadEditHref} className={addressPrimaryBtnClass}>
                    Add on request
                  </Link>
                ) : null}
              </div>
            </div>
          )}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">Stage</p>
            <p className="mt-0.5 text-xs text-foreground-muted">{stageTitle}</p>
          </div>
          <Link
            href={jobHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground"
          >
            Open full job record
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </details>

      {task.instructions && (
        <div className="rounded-xl border border-border bg-surface/30 p-4 sm:border-none sm:bg-transparent sm:p-0">
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Instructions
          </h4>
          <p className="mt-2 text-base leading-relaxed text-foreground-muted sm:text-sm">{task.instructions}</p>
        </div>
      )}

      {requirements.checklist && requirements.checklist.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Checklist
          </h4>
          <div className="space-y-2">
            {requirements.checklist.map((item) => (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors sm:rounded-lg sm:p-3 ${
                  item.completedAt
                    ? "border-approved/20 bg-approved/5 text-approved-strong"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-border text-approved focus:ring-approved sm:h-4 sm:w-4"
                  checked={!!item.completedAt}
                  disabled={isPending || isCompleted}
                  onChange={(e) => handleToggleChecklist(item.id, e.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-base font-medium sm:text-sm ${item.completedAt ? "line-through opacity-60" : ""}`}>
                    {item.label}
                  </p>
                  {item.completedAt && (
                    <p className="mt-0.5 text-[10px] opacity-60">
                      Done {new Date(item.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>
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
        <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-foreground">Task is blocked</h4>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                {paymentBlocker ? `Requires payment: ${paymentBlocker.title}` : isBlockedByIssue ? "Blocked by an open issue." : `Waiting on signals: ${missingSignals.join(", ")}`}
              </p>
            </div>
          </div>
          
          <div className="border-t border-danger/10 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-danger-subtle mb-2">Manager Override</p>
            <p className="mb-3 text-[10px] leading-relaxed text-foreground-muted">
              If this work is actually ready despite the blockers above, a manager can override the engine. 
              This action is audited.
            </p>
            <button
              type="button"
              onClick={handleOverride}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-danger hover:bg-danger/5 disabled:opacity-50"
            >
              <ShieldAlert className="size-3" />
              Audit-Override & Complete
            </button>
          </div>
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
        <div className="pt-2">
          <label className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 px-5 py-6 text-sm font-bold text-foreground-muted transition-all hover:border-border-strong hover:text-foreground sm:inline-flex sm:w-auto sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs sm:font-medium">
            {isUploading ? (
              <Loader2 className="size-5 animate-spin sm:size-3.5" />
            ) : (
              <Paperclip className="size-5 sm:size-3.5" />
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

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-2 sm:pt-4">
        {!isCompleted && !isBlocked && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={isPending}
            className={`${actionBtnBaseClass} ${
              needsProof && !showNoteForm
                ? "border border-border bg-surface text-foreground hover:border-border-strong"
                : "bg-accent text-accent-contrast hover:opacity-90"
            }`}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" strokeWidth={3} />
            )}
            {isPending ? "Working…" : needsProof && !showNoteForm ? "Add proof / note" : "Complete task"}
          </button>
        )}

        {!isCompleted && (
          <button
            type="button"
            onClick={() => {
              setShowReportForm((v) => !v);
              setShowRecoveryBuilder(false);
              setActionMessage(null);
            }}
            className={`${actionBtnBaseClass} border border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground`}
          >
            <AlertCircle className="size-4" />
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
        <div className="space-y-3">
          <p
            className={
              actionMessage.tone === "success"
                ? "rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success"
                : "rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
            }
          >
            {actionMessage.text}
          </p>
          {actionMessage.tone === "success" && actionMessage.issueId && !showRecoveryBuilder && (
            <WorkspacePanel className="border-accent/30 bg-accent/[0.02]">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">Issue Recorded</p>
                  <p className="text-[10px] text-foreground-muted">Would you like to build a recovery path now?</p>
                </div>
                <button
                  onClick={() => setShowRecoveryBuilder(true)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-contrast hover:opacity-90"
                >
                  Start Recovery Flow
                </button>
              </div>
            </WorkspacePanel>
          )}
        </div>
      )}

      {showRecoveryBuilder && actionMessage?.issueId && (
        <WorkspacePanel className="border-dashed border-border-strong bg-foreground/[0.01]">
          <RecoveryFlowBuilder
            issueId={actionMessage.issueId}
            jobId={jobId}
            onSuccess={() => {
              setShowRecoveryBuilder(false);
              setActionMessage({ tone: "success", text: "Recovery flow activated." });
              refreshAfterMutation();
            }}
            onCancel={() => setShowRecoveryBuilder(false)}
          />
        </WorkspacePanel>
      )}
    </div>
    {customerId ? (
      <AddOrEditServiceLocationDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
        googleMapsApiKey={mapsApiKey}
        customerId={customerId}
        mode="create"
        onSaved={() => {
          router.refresh();
        }}
      />
    ) : null}
    </>
  );
}

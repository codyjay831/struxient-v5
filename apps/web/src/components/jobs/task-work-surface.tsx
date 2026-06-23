"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  deriveTaskState,
  taskStateLabel,
  taskStateTone,
  toTaskReadinessInput,
  type TaskCompletionRequirements,
  type TaskIssueRef,
} from "@/lib/task-readiness";
import { getOverrideBlockedByIssueError } from "@/lib/job-task-override-guard";
import {
  completeJobTaskAction,
  overrideJobTaskReadinessAction,
  saveJobTaskCompletionNoteAction,
  toggleJobTaskChecklistItemAction,
  updateJobTaskScheduleAction,
} from "@/app/(workspace)/jobs/job-task-actions";
import {
  uploadTaskAttachmentAction,
  getTaskAttachmentUploadUrlAction,
  completeTaskAttachmentUploadAction,
} from "@/app/(workspace)/jobs/attachment-actions";
import { createJobIssueAction } from "@/app/(workspace)/jobs/job-issue-actions";
import { resolveIssueAndResumeAction } from "@/app/(workspace)/jobs/recovery-actions";
import { removeJobEventAction } from "@/app/(workspace)/jobs/job-event-actions";
import { formatJobIssueSeverity, formatJobIssueType } from "@/lib/job-issue-display";
import { formatDeadlineProvenance } from "@/lib/scheduling/scheduling-derivation";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";
import { AddOrEditServiceLocationDialog } from "@/components/customers/add-or-edit-service-location-dialog";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import {
  getRecoveryProgressMessage,
  shouldAutoOpenRecoveryPlanAfterIssueCreate,
  shouldShowResumeOriginalPathAction,
  shouldShowReviewRecoveryPlanAffordance,
} from "@/lib/recovery-issue-ui-flow";
import { RecoveryFlowBuilder, type RecoveryBuilderContext } from "./recovery-flow-builder";
import { formatPaymentHoldMessage } from "@/lib/authz/payment-visibility";
import { getActionErrorMessage } from "./action-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Zap,
} from "lucide-react";
import {
  CANCEL_FIELD_HOLD_CONFIRM_BODY,
  CANCEL_FIELD_HOLD_CONFIRM_TITLE,
  FIELD_HOLD_BLOCKED_BY_ISSUE_COPY,
  FIELD_HOLD_LIFECYCLE_COPY,
  isFieldEventTaskTitle,
  shouldShowCancelFieldHold,
} from "@/lib/field-event-ui";
import { includesEquivalentSignal } from "@/lib/signal-key";

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

function toDateTimeLocalValue(value: Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatDependencyLabel(raw: string): string {
  if (/^[A-Z0-9]{12,}$/.test(raw)) {
    return "Required Prior Step";
  }
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

export function TaskWorkSurface({
  jobId,
  jobStageId,
  stageTitle,
  stageIssues,
  paymentHold,
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

  const initialRequirements =
    (initialTask.completionRequirementsJson as TaskCompletionRequirements) || {};

  const [task, setTask] = useState(initialTask);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [showNoteForm, setShowForm] = useState(
    () => Boolean(initialTask.completionNote) || Boolean(initialRequirements.noteRequired),
  );
  const [note, setNote] = useState(initialTask.completionNote || "");
  const noteRef = useRef(note);
  const noteDirtyRef = useRef(false);
  const lastSavedNoteRef = useRef(initialTask.completionNote || "");
  const saveNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    tone: "success" | "error";
    text: string;
    issueId?: string;
    issueSeverity?: JobIssueSeverity;
  } | null>(null);

  const [dueAtInput, setDueAtInput] = useState(toDateTimeLocalValue(initialTask.dueAt));
  const [scheduledStartInput, setScheduledStartInput] = useState(
    toDateTimeLocalValue(initialTask.scheduledStartAt),
  );
  const [scheduledEndInput, setScheduledEndInput] = useState(
    toDateTimeLocalValue(initialTask.scheduledEndAt),
  );
  const [showTimingEditor, setShowTimingEditor] = useState(
    Boolean(initialTask.dueAt || initialTask.scheduledStartAt),
  );

  const deadlineProvenance = formatDeadlineProvenance({
    dueMode: task.dueMode ?? "NONE",
    dueAnchor: task.dueAnchor ?? null,
    dueOffsetDays: task.dueOffsetDays ?? null,
    dueGranularity: task.dueGranularity ?? null,
  });

  const attachmentSyncKey = initialTask.attachments.map((a) => a.id).join(",");
  const issuesSyncKey = initialTask.issues.map((i) => `${i.status}:${i.severity}`).join("|");

  /* Sync local editor state when the server task snapshot changes (e.g. after router.refresh()). */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional prop→state sync; avoids stale edits after refresh
    setTask(initialTask);
    if (!noteDirtyRef.current) {
      const serverNote = initialTask.completionNote || "";
      setNote(serverNote);
      noteRef.current = serverNote;
      lastSavedNoteRef.current = serverNote;
    }
    setDueAtInput(toDateTimeLocalValue(initialTask.dueAt));
    setScheduledStartInput(toDateTimeLocalValue(initialTask.scheduledStartAt));
    setScheduledEndInput(toDateTimeLocalValue(initialTask.scheduledEndAt));
  }, [
    initialTask,
    initialTask.id,
    initialTask.status,
    initialTask.completedAt,
    initialTask.completionNote,
    initialTask.dueAt,
    initialTask.scheduledStartAt,
    initialTask.scheduledEndAt,
    attachmentSyncKey,
    issuesSyncKey,
  ]);

  /* Autosave completion note draft while the task is still open. */
  useEffect(() => {
    if (task.status === JobTaskStatus.DONE) return;

    const normalized = note.trim();
    const lastSaved = lastSavedNoteRef.current.trim();
    if (normalized === lastSaved) {
      noteDirtyRef.current = false;
      return;
    }

    noteDirtyRef.current = true;
    if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);

    saveNoteTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await saveJobTaskCompletionNoteAction(task.id, noteRef.current);
          if (result.error) {
            setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
            return;
          }
          const saved = noteRef.current.trim() || "";
          lastSavedNoteRef.current = saved;
          noteDirtyRef.current = false;
          setTask((t) => ({
            ...t,
            completionNote: saved || null,
          }));
        } catch (error) {
          setActionMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "Failed to save completion note.",
          });
        }
      })();
    }, 700);

    return () => {
      if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);
    };
  }, [note, task.id, task.status]);

  /* Flush unsaved note on unmount (e.g. closing the workstation panel). */
  useEffect(() => {
    const taskId = task.id;
    const taskStatus = task.status;
    return () => {
      if (saveNoteTimerRef.current) clearTimeout(saveNoteTimerRef.current);
      if (noteDirtyRef.current && taskStatus !== JobTaskStatus.DONE) {
        void saveJobTaskCompletionNoteAction(taskId, noteRef.current)
          .then((result) => {
            if (result.error) {
              console.error("Failed to flush completion note draft", result.error);
            }
          })
          .catch((error) => {
            console.error("Failed to flush completion note draft", error);
          });
      }
    };
  }, [task.id, task.status]);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const hasJobsite = Boolean(jobsiteAddressLine?.trim());
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [showReportForm, setShowReportForm] = useState(false);
  const [showRecoveryBuilder, setShowRecoveryBuilder] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssueContext, setSelectedIssueContext] = useState<RecoveryBuilderContext | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportType, setReportType] = useState<JobIssueType>(JobIssueType.OTHER);
  const [reportSeverity, setReportSeverity] = useState<JobIssueSeverity>(JobIssueSeverity.BLOCKS_WORK);
  const [isReporting, setIsReporting] = useState(false);
  const [showCancelHoldConfirm, setShowCancelHoldConfirm] = useState(false);
  const isFieldHoldTask = isFieldEventTaskTitle(task.title);

  const refreshAfterMutation = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleResumeAfterRecovery = useCallback(
    (issueId: string, resolutionNote?: string) => {
      setActionMessage(null);
      startTransition(async () => {
        try {
          await resolveIssueAndResumeAction(issueId, resolutionNote);
          setActionMessage({ tone: "success", text: "Original path resumed. Issue resolved." });
          refreshAfterMutation();
        } catch (e) {
          setActionMessage({
            tone: "error",
            text: e instanceof Error ? e.message : "Failed to resume the original path.",
          });
        }
      });
    },
    [refreshAfterMutation, startTransition],
  );

  const clearWorkstationSelection = useCallback(() => {
    if (!clearWorkstationSelectionOnComplete) return;
    const p = new URLSearchParams(searchParams.toString());
    p.delete("selectedId");
    p.delete("selectedKind");
    const q = p.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [clearWorkstationSelectionOnComplete, pathname, router, searchParams]);

  const readinessInput = toTaskReadinessInput(task, {
    requiresSignals: [],
    issues: stageIssues,
  });
  const derivedState = deriveTaskState(readinessInput, liveSignals, {
    recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
  });
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};

  const isCompleted = derivedState === "COMPLETED";
  const isBlockedByIssue = derivedState === "BLOCKED_BY_ISSUE";
  const isBlockedBySignal = derivedState === "BLOCKED_BY_SIGNAL";
  const isBlocked = isBlockedByIssue || isBlockedBySignal;
  const needsProof = derivedState === "NEEDS_PROOF";
  const showCancelFieldHold = shouldShowCancelFieldHold({ isFieldHoldTask, isCompleted });

  const taskIssueRefs: TaskIssueRef[] = task.issues.map((issue) => ({
    id: issue.id,
    status: issue.status,
    severity: issue.severity,
  }));
  const overrideBlockedByIssueError = getOverrideBlockedByIssueError({
    taskIssues: taskIssueRefs,
    stageIssues,
  });

  const missingSignals = [
    ...task.requiresSignals.filter((s) => !includesEquivalentSignal(liveSignals, s)),
  ];

  const handleComplete = () => {
    setActionMessage(null);
    if (needsProof && !showNoteForm) {
      setShowForm(true);
      return;
    }

    startTransition(async () => {
      const result = await completeJobTaskAction(task.id, note);
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
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
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
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
        setActionMessage({ tone: "error", text: getActionErrorMessage(prep.error) });
        setIsUploading(false);
        return;
      }

      if (prep.storageProvider === "local") {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadTaskAttachmentAction(task.id, formData);
        if (result.error) {
          setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
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
          setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
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
    if (!reportTitle.trim() || isReporting) return;

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
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        return;
      }
      setReportTitle("");
      setReportDescription("");
      setShowReportForm(false);
      setSelectedIssueId(result.issueId || null);
      const shouldOpenRecoveryPlan = shouldAutoOpenRecoveryPlanAfterIssueCreate(
        reportSeverity,
        result.issueId,
      );
      if (shouldOpenRecoveryPlan) {
        setSelectedIssueContext({
          sourceTaskTitle: task.title,
          issueTitle: reportTitle.trim(),
          issueSeverityLabel: formatJobIssueSeverity(reportSeverity),
          issueTypeLabel: formatJobIssueType(reportType),
          recoveryGoal: `Resolve "${reportTitle.trim()}" and resume the blocked task path.`,
          jobContextLabel,
          stageTitle,
        });
        setShowRecoveryBuilder(true);
      }
      setActionMessage({
        tone: "success",
        text: shouldOpenRecoveryPlan
          ? "Blocking issue recorded. Review your recovery plan to resume work."
          : "Issue recorded for this task.",
        issueId: result.issueId,
        issueSeverity: reportSeverity,
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

  const handleCancelFieldHold = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await removeJobEventAction(jobId, task.id);
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        setShowCancelHoldConfirm(false);
        return;
      }

      setShowCancelHoldConfirm(false);
      refreshAfterMutation();
      if (clearWorkstationSelectionOnComplete) {
        clearWorkstationSelection();
      }
      onClose?.();
    });
  };

  const handleToggleChecklist = (itemId: string, completed: boolean) => {
    startTransition(async () => {
      const result = await toggleJobTaskChecklistItemAction(task.id, itemId, completed);
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
      } else {
        refreshAfterMutation();
      }
    });
  };

  const handleSaveDueDate = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await updateJobTaskScheduleAction({
        taskId: task.id,
        dueAt: dueAtInput ? new Date(dueAtInput) : null,
        assignedUserId: task.assignedUserId ?? null,
      });
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
        return;
      }
      setActionMessage({ tone: "success", text: "Task due date updated." });
      refreshAfterMutation();
    });
  };

  const handleSaveScheduledBlock = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await updateJobTaskScheduleAction({
        taskId: task.id,
        scheduledStartAt: scheduledStartInput ? new Date(scheduledStartInput) : null,
        scheduledEndAt: scheduledEndInput ? new Date(scheduledEndInput) : null,
        assignedUserId: task.assignedUserId ?? null,
      });
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
        return;
      }
      setActionMessage({ tone: "success", text: "Task schedule block updated." });
      refreshAfterMutation();
    });
  };

  const handleClearScheduledBlock = () => {
    setActionMessage(null);
    startTransition(async () => {
      const result = await updateJobTaskScheduleAction({
        taskId: task.id,
        scheduledStartAt: null,
        scheduledEndAt: null,
        assignedUserId: task.assignedUserId ?? null,
      });
      if (result.error) {
        setActionMessage({ tone: "error", text: result.error });
        return;
      }
      setScheduledStartInput("");
      setScheduledEndInput("");
      setActionMessage({ tone: "success", text: "Scheduled block cleared." });
      refreshAfterMutation();
    });
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-foreground">{task.title}</h3>
          {isFieldHoldTask ? <StatusBadge label="Field hold" tone="warning" /> : null}
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

      <div className="space-y-3 rounded-xl border border-border bg-surface/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Task timing
          </p>
          {!showTimingEditor ? (
            <button
              type="button"
              onClick={() => setShowTimingEditor(true)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground-muted hover:border-border-strong hover:text-foreground"
            >
              {task.dueAt || task.scheduledStartAt ? "Edit timing" : "Set deadline or crew block"}
            </button>
          ) : null}
        </div>
        {task.dueAt ? (
          <p className="text-sm text-foreground">
            Deadline: {new Date(task.dueAt).toLocaleString()}
            {deadlineProvenance ? (
              <span className="mt-1 block text-xs text-foreground-muted">{deadlineProvenance}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-foreground-muted">No deadline set.</p>
        )}
        {task.scheduledStartAt ? (
          <p className="text-xs text-foreground-muted">
            Crew block: {new Date(task.scheduledStartAt).toLocaleString()}
            {task.scheduledEndAt
              ? ` – ${new Date(task.scheduledEndAt).toLocaleString()}`
              : null}
          </p>
        ) : null}
        {showTimingEditor ? (
          <>
            <p className="text-xs text-foreground-muted">
              Deadlines are attention triggers. Crew blocks create confirmed schedule events.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Deadline
                <input
                  type="datetime-local"
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                  value={dueAtInput}
                  onChange={(e) => setDueAtInput(e.target.value)}
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDueDate}
                  disabled={isPending}
                  className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
                >
                  Save deadline
                </button>
                {task.dueAt ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDueAtInput("");
                      startTransition(async () => {
                        const result = await updateJobTaskScheduleAction({
                          taskId: task.id,
                          dueAt: null,
                        });
                        if (result.error) {
                          setActionMessage({ tone: "error", text: result.error });
                          return;
                        }
                        setActionMessage({ tone: "success", text: "Deadline cleared." });
                        refreshAfterMutation();
                      });
                    }}
                    disabled={isPending}
                    className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Crew block start
                <input
                  type="datetime-local"
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                  value={scheduledStartInput}
                  onChange={(e) => setScheduledStartInput(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Crew block end
                <input
                  type="datetime-local"
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                  value={scheduledEndInput}
                  onChange={(e) => setScheduledEndInput(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveScheduledBlock}
                disabled={isPending}
                className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
              >
                Save crew block
              </button>
              <button
                type="button"
                onClick={handleClearScheduledBlock}
                disabled={isPending}
                className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
              >
                Clear crew block
              </button>
              <button
                type="button"
                onClick={() => setShowTimingEditor(false)}
                className="rounded-md px-3 py-2 text-xs font-semibold text-foreground-muted hover:text-foreground"
              >
                Done
              </button>
            </div>
          </>
        ) : null}
      </div>

      {showCancelFieldHold && (
        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-xs leading-relaxed text-foreground-muted">{FIELD_HOLD_LIFECYCLE_COPY}</p>
          {isFieldHoldTask && isBlockedByIssue ? (
            <p className="text-xs font-semibold text-danger-strong">{FIELD_HOLD_BLOCKED_BY_ISSUE_COPY}</p>
          ) : null}
          {!showCancelHoldConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelHoldConfirm(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-danger hover:bg-danger/5 disabled:opacity-50"
            >
              Cancel field hold
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-danger/20 bg-background/80 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{CANCEL_FIELD_HOLD_CONFIRM_TITLE}</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  {CANCEL_FIELD_HOLD_CONFIRM_BODY}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelHoldConfirm(false)}
                  disabled={isPending}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCancelFieldHold}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-background hover:bg-danger/90 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {isPending ? "Cancelling…" : "Cancel field hold"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {requirements.checklist && requirements.checklist.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Checklist
          </h4>
          {isBlockedByIssue && (
            <p className="text-xs leading-relaxed text-foreground-muted">
              Checklist progress is paused while this work is blocked by an issue. You can still
              uncheck items if needed.
            </p>
          )}
          <div className="space-y-2">
            {requirements.checklist.map((item, index) => (
              <label
                key={item.id?.trim() ? item.id : `checklist-${index}`}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors sm:rounded-lg sm:p-3 ${
                  item.completedAt
                    ? "border-approved/20 bg-approved/5 text-approved-strong"
                    : "border-border bg-surface hover:border-border-strong"
                } ${
                  isPending || isCompleted || (isBlockedByIssue && !item.completedAt)
                    ? "cursor-not-allowed opacity-80"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-border text-approved focus:ring-approved sm:h-4 sm:w-4"
                  checked={!!item.completedAt}
                  disabled={isPending || isCompleted || (isBlockedByIssue && !item.completedAt)}
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
        <div className="space-y-4">
          {isFieldHoldTask && isBlockedByIssue ? (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-3">
              <p className="text-xs font-semibold text-danger-strong">
                {FIELD_HOLD_BLOCKED_BY_ISSUE_COPY}
              </p>
            </div>
          ) : null}
          {task.issues.filter((i) => i.status === JobIssueStatus.OPEN).map((issue) => {
            const recoveryTasks = issue.recoveryFlow?.tasks || [];
            const totalRecoveryTasks = recoveryTasks.length;
            const completedRecoveryTasks = recoveryTasks.filter((t) => t.status === JobTaskStatus.DONE).length;
            const recoveryFlowInProgress =
              issue.recoveryFlow &&
              (issue.recoveryFlow.status === JobRecoveryFlowStatus.ACTIVE ||
                issue.recoveryFlow.status === JobRecoveryFlowStatus.DRAFT);
            const recoveryFlowCompleted =
              issue.recoveryFlow?.status === JobRecoveryFlowStatus.COMPLETED;
            const showRecoveryProgress =
              (!!recoveryFlowInProgress || recoveryFlowCompleted) &&
              totalRecoveryTasks > 0;
            const canResumeAfterRecovery = shouldShowResumeOriginalPathAction(issue);
            const recoveryProgressMessage = getRecoveryProgressMessage(issue);

            return (
              <div key={issue.id} className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
                <div className="flex gap-3">
                  <Lock className="mt-0.5 size-5 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-foreground">{issue.title}</h4>
                      <StatusBadge 
                        label={formatJobIssueSeverity(issue.severity)} 
                        tone={issue.severity === "BLOCKS_WORK" ? "danger" : "warning"}
                        className="text-[10px]"
                      />
                    </div>
                    {issue.description && (
                      <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                        {issue.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground-subtle">
                      <span>{formatJobIssueType(issue.type)}</span>
                      <span>•</span>
                      <span>Reported {new Date(issue.createdAt).toLocaleDateString()}</span>
                      {issue.createdByUser?.name && (
                        <>
                          <span>•</span>
                          <span>By {issue.createdByUser.name}</span>
                        </>
                      )}
                    </div>

                    {issue.recoveryFlow?.status === JobRecoveryFlowStatus.CANCELLED &&
                      issue.status === JobIssueStatus.OPEN && (
                        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-warning-strong">
                            Recovery plan cancelled
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-foreground-muted">
                            This issue is still open and blocking work. Resolve or force-resolve this
                            issue before creating another recovery plan.
                          </p>
                        </div>
                      )}

                    {showRecoveryProgress && (
                      <div className="mt-3 space-y-2 rounded-lg bg-success/10 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-success">
                          <Zap className="size-3" />
                          {recoveryProgressMessage}
                        </p>
                        <div className="space-y-1.5 rounded-md border border-success/20 bg-background/70 p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-success">
                            Recovery path ({completedRecoveryTasks}/{totalRecoveryTasks})
                          </p>
                          {recoveryTasks.map((recoveryTask, taskIndex) => (
                            <Link
                              key={recoveryTask.id}
                              href={`${jobHref}#task-${recoveryTask.id}`}
                              className="flex items-center justify-between gap-2 rounded px-1 py-1 text-[11px] text-foreground-muted hover:bg-success/10 hover:text-foreground"
                            >
                              <span className="truncate">
                                {taskIndex + 1}.{" "}
                                {"title" in recoveryTask && typeof recoveryTask.title === "string"
                                  ? recoveryTask.title
                                  : `Recovery step ${taskIndex + 1}`}
                              </span>
                              <StatusBadge
                                label={recoveryTask.status === JobTaskStatus.DONE ? "Done" : "Open"}
                                tone={recoveryTask.status === JobTaskStatus.DONE ? "approved" : "warning"}
                                className="text-[9px]"
                              />
                            </Link>
                          ))}
                        </div>
                        {(canResumeAfterRecovery ||
                          (issue.recoveryFlow?.status === JobRecoveryFlowStatus.COMPLETED &&
                            issue.status === JobIssueStatus.OPEN)) && (
                          <button
                            type="button"
                            onClick={() => handleResumeAfterRecovery(issue.id)}
                            disabled={isPending}
                            className="w-full rounded-md bg-success/20 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-success hover:bg-success/30 disabled:opacity-50 sm:w-auto"
                          >
                            {isPending ? "Resuming…" : "Resume original path"}
                          </button>
                        )}
                      </div>
                    )}

                    {shouldShowReviewRecoveryPlanAffordance({
                      issue,
                      showRecoveryBuilder,
                    }) && (
                      <div className="mt-3 space-y-2">
                        <p className="text-[10px] leading-relaxed text-foreground-muted">
                          Work is blocked until a recovery plan is activated, or this issue is
                          resolved/force-resolved.
                        </p>
                        <button
                          onClick={() => {
                            setSelectedIssueId(issue.id);
                            setSelectedIssueContext({
                              sourceTaskTitle: task.title,
                              issueTitle: issue.title,
                              issueSeverityLabel: formatJobIssueSeverity(issue.severity),
                              issueTypeLabel: formatJobIssueType(issue.type),
                              recoveryGoal: `Resolve "${issue.title}" and resume "${task.title}".`,
                              jobContextLabel,
                              stageTitle,
                            });
                            setShowRecoveryBuilder(true);
                          }}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-contrast hover:opacity-90"
                        >
                          Review Recovery Plan
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {paymentHold && (
            <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
              <Lock className="mt-0.5 size-5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-foreground">Payment Required</h4>
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  {formatPaymentHoldMessage(paymentHold)}
                </p>
              </div>
            </div>
          )}
          
          {missingSignals.length > 0 && !isBlockedByIssue && !paymentHold && (
             <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <Zap className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                  Waiting for: {missingSignals.map(formatDependencyLabel).join(", ")}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-danger/10 bg-danger/[0.02] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-danger-subtle mb-2">Manager Override</p>
            {overrideBlockedByIssueError ? (
              <p className="text-[10px] leading-relaxed text-foreground-muted">
                {overrideBlockedByIssueError}
              </p>
            ) : (
              <>
                <p className="mb-3 text-[10px] leading-relaxed text-foreground-muted">
                  If this work is ready despite the blockers above, a manager can override readiness checks.
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
              </>
            )}
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

      {(showNoteForm || requirements.noteRequired || task.completionNote) && !isCompleted && (
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
              onChange={(e) => {
                const value = e.target.value;
                noteRef.current = value;
                noteDirtyRef.current = true;
                setNote(value);
              }}
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
            disabled={isReporting}
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
          {task.recoveryFlow?.jobIssueId && (
            <p className="text-[10px] leading-relaxed text-foreground-muted">
              This issue is being reported from a recovery task.
            </p>
          )}
          <input
            required
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            disabled={isReporting}
            placeholder="Short title"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none"
          />
          <textarea
            value={reportDescription}
            onChange={(e) => setReportDescription(e.target.value)}
            disabled={isReporting}
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
                disabled={isReporting}
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
                disabled={isReporting}
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
              disabled={isReporting}
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
          {actionMessage.tone === "success" &&
            actionMessage.issueId &&
            actionMessage.issueSeverity === JobIssueSeverity.DOES_NOT_BLOCK &&
            !showRecoveryBuilder && (
            <WorkspacePanel className="border-accent/30 bg-accent/[0.02]">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">Issue Recorded</p>
                  <p className="text-[10px] text-foreground-muted">
                    Would you like to review a recovery plan now?
                  </p>
                </div>
                <button
                  onClick={() => setShowRecoveryBuilder(true)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-contrast hover:opacity-90"
                >
                  Open Recovery Plan
                </button>
              </div>
            </WorkspacePanel>
          )}
        </div>
      )}

      <Dialog 
        open={showRecoveryBuilder && !!selectedIssueId} 
        onOpenChange={(open) => {
          if (!open) {
            setShowRecoveryBuilder(false);
            setSelectedIssueId(null);
            setSelectedIssueContext(null);
          }
        }}
        className="max-w-4xl"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Recovery Plan</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto pr-2">
            {selectedIssueId && (
              <RecoveryFlowBuilder
                issueId={selectedIssueId}
                jobId={jobId}
                context={selectedIssueContext ?? undefined}
                onSuccess={() => {
                  setShowRecoveryBuilder(false);
                  setSelectedIssueId(null);
                  setSelectedIssueContext(null);
                  setActionMessage({ tone: "success", text: "Recovery plan activated." });
                  refreshAfterMutation();
                }}
                onCancel={() => {
                  setShowRecoveryBuilder(false);
                  setSelectedIssueId(null);
                  setSelectedIssueContext(null);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
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

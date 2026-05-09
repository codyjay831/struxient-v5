"use client";

import { useActionState, useState, useTransition } from "react";
import { JobTaskStatus, JobIssueStatus, JobIssueSeverity, JobPaymentRequirementStatus } from "@prisma/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveTaskState, taskStateLabel, taskStateTone, type TaskCompletionRequirements } from "@/lib/task-readiness";
import { completeJobTaskAction } from "@/app/(workspace)/jobs/job-task-actions";
import { uploadTaskAttachmentAction } from "@/app/(workspace)/jobs/attachment-actions";
import { Check, AlertCircle, MessageSquare, Lock, Camera, Paperclip, FileText, Loader2, X } from "lucide-react";

type Task = {
  id: string;
  title: string;
  status: JobTaskStatus;
  instructions: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: any;
  attachments: {
    id: string;
    fileName: string;
    fileKey: string;
    contentType: string;
  }[];
  issues: {
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
  paymentBlockers: {
    status: JobPaymentRequirementStatus;
    title: string;
  }[];
};

export function JobTaskCard({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [showNoteForm, setShowForm] = useState(false);
  const [note, setNote] = useState(task.completionNote || "");

  const derivedState = deriveTaskState(task);
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
  
  const isCompleted = derivedState === "COMPLETED";
  const isBlocked = derivedState === "BLOCKED";
  const needsProof = derivedState === "NEEDS_PROOF";

  const paymentBlocker = task.paymentBlockers.find(p => p.status === "DUE");

  const handleComplete = () => {
    if (needsProof && !showNoteForm) {
      setShowForm(true);
      return;
    }

    startTransition(async () => {
      const result = await completeJobTaskAction(task.id, note);
      if (result.error) {
        alert(result.error);
      } else {
        setShowForm(false);
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadTaskAttachmentAction(task.id, formData);
    setIsUploading(false);

    if (result.error) {
      alert(result.error);
    }
  };

  return (
    <div className={`rounded-lg border p-4 transition-all ${
      isCompleted ? "border-border bg-surface/40 opacity-80" : 
      isBlocked ? "border-danger/30 bg-danger/5" :
      "border-border bg-surface hover:border-border-strong"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className={`text-sm font-semibold ${isCompleted ? "text-foreground-subtle line-through" : "text-foreground"}`}>
              {task.title}
            </h4>
            <StatusBadge
              label={taskStateLabel(derivedState, task)}
              tone={taskStateTone(derivedState)}
            />
          </div>
          
          {task.instructions && (
            <p className="mt-1 text-xs text-foreground-muted leading-relaxed">
              {task.instructions}
            </p>
          )}

          {requirements.noteRequired && !isCompleted && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-warning-strong">
              <MessageSquare className="size-3" />
              <span>Completion note required</span>
            </div>
          )}

          {(requirements.photoRequired || requirements.attachmentRequired) && !isCompleted && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-warning-strong">
              {requirements.photoRequired ? <Camera className="size-3" /> : <Paperclip className="size-3" />}
              <span>{requirements.photoRequired ? "Photo proof required" : "Attachment required"}</span>
            </div>
          )}

          {isBlocked && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-danger-strong">
              <Lock className="size-3" />
              <span>{paymentBlocker ? `Blocked by unpaid payment: ${paymentBlocker.title}` : "Blocked by open issue"}</span>
            </div>
          )}

          {/* Attachment List */}
          {task.attachments.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {task.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.fileKey}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-surface-strong px-2 py-1.5 text-xs hover:border-border-strong transition-colors"
                  >
                    {att.contentType.startsWith("image/") ? (
                      <Camera className="size-3 text-foreground-muted" />
                    ) : (
                      <FileText className="size-3 text-foreground-muted" />
                    )}
                    <span className="max-w-[120px] truncate text-foreground-muted">{att.fileName}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Upload UI */}
          {!isCompleted && !isBlocked && (
            <div className="mt-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground-muted hover:border-border-strong hover:text-foreground transition-all">
                {isUploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Paperclip className="size-3.5" />
                )}
                <span>{isUploading ? "Uploading..." : "Add Proof / Attachment"}</span>
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
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                  Completion Note {requirements.noteRequired ? "*" : "(Optional)"}
                </span>
                <textarea
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
                  rows={2}
                  placeholder="What was the outcome?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
          )}

          {isCompleted && task.completionNote && (
            <div className="mt-3 rounded-md bg-foreground/[0.03] px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Outcome</p>
              <p className="mt-0.5 text-xs italic text-foreground-muted">{task.completionNote}</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isCompleted && !isBlocked && (
            <button
              onClick={handleComplete}
              disabled={isPending}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                needsProof && !showNoteForm 
                ? "bg-surface border border-border text-foreground hover:border-border-strong" 
                : "bg-accent text-accent-contrast hover:opacity-90"
              }`}
            >
              {isPending ? "Completing..." : (
                <>
                  <Check className="size-3.5" />
                  {needsProof && !showNoteForm ? "Add Proof" : "Complete Task"}
                </>
              )}
            </button>
          )}
          
          {!isCompleted && (
            <button
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors"
              title="Report Problem"
            >
              <AlertCircle className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

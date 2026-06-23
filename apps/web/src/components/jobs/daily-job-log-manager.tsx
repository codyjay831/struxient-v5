"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DailyJobLogStatus } from "@prisma/client";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ChevronDown, 
  ChevronUp,
  Save,
  Trash2,
  Clock
} from "lucide-react";
import { 
  createOrUpdateDailyJobLogDraftAction, 
  markDailyJobLogReviewedAction, 
  voidDailyJobLogAction 
} from "@/app/(workspace)/jobs/daily-log-actions";
import { getActionErrorMessage } from "./action-error-message";

type DailyJobLog = {
  id: string;
  logDate: Date;
  summary: string;
  internalNotes: string | null;
  status: DailyJobLogStatus;
  reviewedAt: Date | null;
  reviewedByUser: {
    name: string | null;
    email: string | null;
  } | null;
};

export function DailyJobLogManager({
  jobId,
  initialLogs,
  variant = "page",
  focusId,
  canAccessInternalNotes = false,
  canWriteInternalNotes = false,
  canManageDailyLogCoordination = false,
}: {
  jobId: string;
  initialLogs: DailyJobLog[];
  variant?: "page" | "embedded";
  focusId?: string;
  /** Office/commercial read roles may see internal notes. */
  canAccessInternalNotes?: boolean;
  /** OWNER/ADMIN/OFFICE may edit internal notes. */
  canWriteInternalNotes?: boolean;
  canManageDailyLogCoordination?: boolean;
}) {
  const isEmbedded = variant === "embedded";
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const displayedLogs = isEmbedded && focusId
    ? initialLogs.filter((log) => log.id === focusId)
    : initialLogs;

  const [lastSyncedFocusId, setLastSyncedFocusId] = useState<string | null>(null);
  if (isEmbedded && focusId && focusId !== lastSyncedFocusId) {
    const focusedLog = initialLogs.find((log) => log.id === focusId);
    if (focusedLog) {
      setLastSyncedFocusId(focusId);
      setEditSummary(focusedLog.summary);
      if (canWriteInternalNotes) {
        setEditNotes(focusedLog.internalNotes || "");
      }
      setExpandedLogId(focusId);
    }
  }

  const refreshAfterAction = () => {
    if (isEmbedded) router.refresh();
  };

  const handleCreateDraft = async () => {
    setIsSaving(true);
    setActionMessage(null);
    try {
      const result = await createOrUpdateDailyJobLogDraftAction({
        jobId,
        logDate: new Date(),
      });
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        return;
      }
      setIsCreating(false);
      setActionMessage({ tone: "success", text: "Daily log draft created." });
      refreshAfterAction();
    } catch (error) {
      console.error("Failed to create draft:", error);
      setActionMessage({ tone: "error", text: "Failed to create draft. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (log: DailyJobLog) => {
    setIsSaving(true);
    setActionMessage(null);
    try {
      const result = await createOrUpdateDailyJobLogDraftAction({
        jobId,
        logDate: log.logDate,
        summary: editSummary,
        ...(canWriteInternalNotes ? { internalNotes: editNotes } : {}),
      });
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        return;
      }
      setExpandedLogId(isEmbedded ? focusId ?? null : null);
      setActionMessage({ tone: "success", text: "Daily log saved." });
      refreshAfterAction();
    } catch (error) {
      console.error("Failed to save edit:", error);
      setActionMessage({ tone: "error", text: "Failed to save daily log. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkReviewed = async (logId: string) => {
    if (!confirm("Mark this daily log as reviewed and official?")) return;
    setIsSaving(true);
    setActionMessage(null);
    try {
      const result = await markDailyJobLogReviewedAction(logId);
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        return;
      }
      setActionMessage({ tone: "success", text: "Daily log marked reviewed." });
      refreshAfterAction();
    } catch (error) {
      console.error("Failed to mark reviewed:", error);
      setActionMessage({ tone: "error", text: "Failed to mark reviewed. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async (logId: string) => {
    if (!confirm("Are you sure you want to void this log? It will remain in history but marked as invalid.")) return;
    setIsSaving(true);
    setActionMessage(null);
    try {
      const result = await voidDailyJobLogAction(logId);
      if (result.error) {
        setActionMessage({ tone: "error", text: getActionErrorMessage(result.error) });
        return;
      }
      setActionMessage({ tone: "success", text: "Daily log voided." });
      refreshAfterAction();
    } catch (error) {
      console.error("Failed to void log:", error);
      setActionMessage({ tone: "error", text: "Failed to void log. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (log: DailyJobLog) => {
    setEditSummary(log.summary);
    if (canWriteInternalNotes) {
      setEditNotes(log.internalNotes || "");
    }
    setExpandedLogId(log.id);
  };

  const logList = displayedLogs.length === 0 ? (
    isEmbedded ? (
      <p className="text-sm text-foreground-muted">This daily log is no longer available for review.</p>
    ) : (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <FileText className="mx-auto size-8 text-foreground-subtle/50" />
        <p className="mt-2 text-sm font-medium text-foreground-subtle">No daily logs created yet</p>
      </div>
    )
  ) : (
    <div className="space-y-3">
      {displayedLogs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg border transition-colors ${
                expandedLogId === log.id
                  ? "border-border-strong bg-surface"
                  : "border-border bg-surface/50 hover:border-border-strong"
              }`}
            >
              <div
                className={`flex items-center justify-between p-3 ${isEmbedded ? "" : "cursor-pointer"}`}
                onClick={
                  isEmbedded
                    ? undefined
                    : () => expandedLogId === log.id ? setExpandedLogId(null) : startEditing(log)
                }
              >
                <div className="flex items-center gap-3">
                  <div className={`flex size-8 items-center justify-center rounded-full border ${getStatusStyles(log.status).iconBg}`}>
                    {getStatusIcon(log.status)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(log.logDate).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-muted">
                      <StatusBadge 
                        label={log.status} 
                        tone={log.status === "REVIEWED" ? "approved" : log.status === "VOID" ? "neutral" : "draft"} 
                      />
                      {log.status === "REVIEWED" && log.reviewedByUser && (
                        <span>· Reviewed by {log.reviewedByUser.name || log.reviewedByUser.email}</span>
                      )}
                    </div>
                  </div>
                </div>
                {expandedLogId === log.id && !isEmbedded ? <ChevronUp className="size-4 text-foreground-muted" /> : !isEmbedded ? <ChevronDown className="size-4 text-foreground-muted" /> : null}
              </div>

              {expandedLogId === log.id && (
                <div className="border-t border-border p-4">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                        Summary (Draft from recorded activity)
                      </label>
                      <textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        disabled={log.status === "VOID"}
                        rows={6}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none disabled:opacity-60"
                        placeholder="What happened today?"
                      />
                    </div>

                    {canAccessInternalNotes ? (
                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                          Internal Notes
                        </label>
                        {canWriteInternalNotes ? (
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            disabled={log.status === "VOID"}
                            rows={2}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none disabled:opacity-60"
                            placeholder="Staff-only notes..."
                          />
                        ) : (
                          <p className="rounded-md border border-border bg-surface/50 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                            {log.internalNotes?.trim() || "None"}
                          </p>
                        )}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                      <div className="flex gap-2">
                        {log.status !== "VOID" && (
                          <>
                            <button
                              onClick={() => handleSaveEdit(log)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                            >
                              <Save className="size-3.5" />
                              Save changes
                            </button>
                            {canManageDailyLogCoordination && log.status === "DRAFT" && (
                              <button
                                onClick={() => handleMarkReviewed(log.id)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/[0.02] disabled:opacity-50"
                              >
                                <CheckCircle2 className="size-3.5 text-success-strong" />
                                Mark reviewed
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      
                      {canManageDailyLogCoordination && log.status !== "VOID" && (
                        <button
                          onClick={() => handleVoid(log.id)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-strong hover:underline disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          Void log
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
    </div>
  );

  const actionMessageBanner = actionMessage ? (
    <div
      className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
        actionMessage.tone === "success"
          ? "border-success/20 bg-success/[0.04] text-success"
          : "border-danger/20 bg-danger/[0.04] text-danger"
      }`}
    >
      {actionMessage.text}
    </div>
  ) : null;

  if (isEmbedded) {
    return (
      <>
        {actionMessageBanner}
        {logList}
      </>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between">
        <SectionHeading
          title="Daily Logs"
          description="Official records of what happened on the job site each day."
        />
        <button
          onClick={() => setIsCreating(true)}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Create today&apos;s log
        </button>
      </div>

      {isCreating && (
        <WorkspacePanel className="mb-4 border-primary/20 bg-primary/[0.02]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Create draft for today</p>
              <p className="text-xs text-foreground-subtle">This will generate a summary from today&apos;s recorded activity.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsCreating(false)}
                className="text-xs font-medium text-foreground-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDraft}
                disabled={isSaving}
                className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
              >
                {isSaving ? "Generating..." : "Generate draft"}
              </button>
            </div>
          </div>
        </WorkspacePanel>
      )}

      {actionMessageBanner}

      {logList}
    </section>
  );
}

function getStatusIcon(status: DailyJobLogStatus) {
  switch (status) {
    case "REVIEWED":
      return <CheckCircle2 className="size-4 text-success-strong" />;
    case "VOID":
      return <AlertCircle className="size-4 text-foreground-muted" />;
    default:
      return <Clock className="size-4 text-warning-strong" />;
  }
}

function getStatusStyles(status: DailyJobLogStatus) {
  switch (status) {
    case "REVIEWED":
      return { iconBg: "bg-success/10 border-success/20" };
    case "VOID":
      return { iconBg: "bg-foreground/5 border-border" };
    default:
      return { iconBg: "bg-warning/10 border-warning/20" };
  }
}

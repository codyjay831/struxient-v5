"use client";

import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { type WorkstationWorkItem } from "@/lib/workstation-query";
import { ReactNode } from "react";

function isBlockedMainPathRecoveryRedirect(item: WorkstationWorkItem): boolean {
  return (
    item.kind === "task" &&
    item.isBlocked === true &&
    (item.actionKind === "do-recovery-task" || item.actionKind === "plan-recovery") &&
    (item.actionKind === "plan-recovery" || item.actionTaskId !== item.recordId)
  );
}

function blockedTaskRecoveryNotice(item: WorkstationWorkItem): string {
  if (item.actionKind === "plan-recovery") {
    return "This task is blocked. Plan recovery below to clear the blocker.";
  }
  return "This task is blocked. Complete the recovery step below to clear the blocker.";
}

function fullRecordLinkLabel(item: WorkstationWorkItem): string {
  if (item.filterCategory === "issues") return "Open issue on job";
  if (item.filterCategory === "payments") return "Open job payments";
  if (item.kind === "schedule") return "Open job schedule";
  if (item.kind === "daily-log") return "Open job logs";
  if (item.kind === "quote") return "Open quote record";
  if (item.kind === "lead") return "Open lead workspace";
  return "Open full record";
}

export type WorkstationWorkPanelProps = {
  item: WorkstationWorkItem;
  children?: ReactNode;
  onClose: () => void;
  /** When embedded, header/footer chrome is provided by WorkstationModalShell. */
  chrome?: "full" | "embedded";
};

function WorkstationWorkPanelBody({
  item,
  children,
}: {
  item: WorkstationWorkItem;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {!children ? (
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Reason for review
            </h4>
            <p className="text-base italic leading-relaxed text-foreground-muted">
              {item.reason}
            </p>
            {item.workflow ? (
              <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                Current Status: {item.workflow.statusLabel}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <h4 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Recommended action
            </h4>
            <p className="text-lg font-bold leading-snug text-foreground">
              {item.actionLabel ?? item.nextStep}
            </p>
          </div>
        </div>
      ) : null}

      {children ? (
        <div className="space-y-6">
          {isBlockedMainPathRecoveryRedirect(item) ? (
            <p className="rounded-lg border border-danger/20 bg-danger/[0.03] px-4 py-3 text-sm leading-relaxed text-foreground-muted">
              {blockedTaskRecoveryNotice(item)}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function WorkstationWorkPanelFooter({
  item,
  onClose,
  showClose = true,
}: {
  item: WorkstationWorkItem;
  onClose: () => void;
  showClose?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-6">
      {item.href ? (
        <Link
          href={item.href}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {fullRecordLinkLabel(item)}
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
      {showClose ? (
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-bold text-foreground-subtle transition-colors hover:text-foreground"
        >
          Close panel
        </button>
      ) : null}
    </div>
  );
}

export function WorkstationWorkPanel({
  item,
  children,
  onClose,
  chrome = "full",
}: WorkstationWorkPanelProps) {
  if (chrome === "embedded") {
    return <WorkstationWorkPanelBody item={item}>{children}</WorkstationWorkPanelBody>;
  }

  return (
    <div className="flex max-h-[88vh] flex-col">
      <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground-subtle">
              {item.kind.replace("-", " ")}
            </span>
            {item.status ? (
              <StatusBadge label={item.status} tone="neutral" />
            ) : null}
          </div>
          <h2
            id="panel-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            {item.title}
          </h2>
          {(item.contextLine ?? item.subtitle) ? (
            <p className="mt-1 text-sm font-medium text-foreground-muted">
              {item.contextLine ?? item.subtitle}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="ml-4 shrink-0 rounded-lg border border-border bg-surface p-1.5 text-foreground-subtle transition-colors hover:bg-background hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <WorkstationWorkPanelBody item={item}>{children}</WorkstationWorkPanelBody>
      </div>

      <div className="shrink-0 border-t border-border bg-foreground/[0.01] px-5 py-4">
        <WorkstationWorkPanelFooter item={item} onClose={onClose} />
      </div>
    </div>
  );
}

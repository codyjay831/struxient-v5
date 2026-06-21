"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/status-badge";

export type WorkstationModalShellProps = {
  kindLabel: string;
  title: string;
  subtitle?: string;
  statusLabel?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function WorkstationModalShell({
  kindLabel,
  title,
  subtitle,
  statusLabel,
  onClose,
  children,
  footer,
}: WorkstationModalShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-foreground-subtle">
              {kindLabel}
            </span>
            {statusLabel ? <StatusBadge label={statusLabel} tone="neutral" /> : null}
          </div>
          <h2
            id="panel-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-foreground-muted">{subtitle}</p>
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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-subtle px-5 py-4">
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-border bg-foreground/[0.01] px-5 py-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

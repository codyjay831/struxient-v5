"use client";

import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeTone } from "./status-badge";
import { WorkspacePanel } from "./workspace-panel";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

export type RecordActionPanelProps = {
  /**
   * "compact" = Workstation / list detail
   * "standard" = Default
   * "full" = Full page (can be same as standard but maybe more padding)
   */
  density?: "compact" | "standard" | "full";
  kind: "lead" | "quote";
  status: {
    label: string;
    tone: StatusBadgeTone;
  };
  title?: string;
  subtitle?: string;
  reason?: string; // Why this matters
  description?: string; // General description
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    loading?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    loading?: boolean;
  };
  requiredItems?: { label: string; satisfied: boolean }[];
  optionalItems?: { label: string; satisfied: boolean }[];
  satisfiedItems?: { label: string }[];
  progress?: {
    stepIndex: number;
    totalSteps: number;
    steps: readonly { key: string; label: string }[];
    isTerminal: boolean;
  };
  children?: ReactNode; // For inline forms or extra content
  className?: string;
};

/**
 * Shared presentational pattern for record actions and readiness.
 * Used across Workstation, popup/drawers, and full pages.
 */
export function RecordActionPanel({
  density = "standard",
  kind,
  status,
  title,
  subtitle,
  reason,
  description,
  primaryAction,
  secondaryAction,
  requiredItems = [],
  optionalItems = [],
  satisfiedItems = [],
  progress,
  children,
  className = "",
}: RecordActionPanelProps) {
  const isCompact = density === "compact";

  const sectionLabelClass = "text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle";

  const renderAction = (action: NonNullable<RecordActionPanelProps["primaryAction"]>, isPrimary: boolean) => {
    const Icon = action.icon;
    const content = (
      <>
        {action.loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : Icon ? (
          <Icon className="size-3.5" />
        ) : null}
        {action.label}
      </>
    );

    const baseClass = isPrimary
      ? "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
      : "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:opacity-50";

    if (action.href) {
      return (
        <Link href={action.href} className={baseClass}>
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled || action.loading}
        className={baseClass}
      >
        {content}
      </button>
    );
  };

  return (
    <WorkspacePanel
      padding={isCompact ? "compact" : "comfortable"}
      className={[
        "border-border-strong shadow-sm ring-1 ring-ring/5",
        className
      ].join(" ")}
    >
      <div className="space-y-4">
        {/* Header: Status + Title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={sectionLabelClass}>Status</span>
              <StatusBadge label={status.label} tone={status.tone} />
            </div>
            {(title || subtitle) && (
              <div>
                {title && (
                  <h3 className={isCompact ? "text-sm font-bold" : "text-base font-bold"}>
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-foreground-muted">{subtitle}</p>
                )}
              </div>
            )}
          </div>

          {/* Actions (Desktop) */}
          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            {secondaryAction && renderAction(secondaryAction, false)}
            {primaryAction && renderAction(primaryAction, true)}
          </div>
        </div>

        {/* Reason / Description */}
        {(reason || description) && (
          <div className="space-y-2">
            {reason && (
              <div>
                <p className={sectionLabelClass}>Why it matters</p>
                <p className="mt-0.5 text-sm italic text-foreground-muted leading-relaxed">{reason}</p>
              </div>
            )}
            {description && !reason && (
              <p className="text-sm text-foreground-muted leading-relaxed">{description}</p>
            )}
            {description && reason && (
              <p className="text-xs text-foreground-subtle leading-relaxed">{description}</p>
            )}
          </div>
        )}

        {/* Hierarchy Items */}
        {(requiredItems.length > 0 || optionalItems.length > 0 || satisfiedItems.length > 0) && (
          <div className="space-y-3">
            {requiredItems.length > 0 && (
              <div>
                <p className={sectionLabelClass}>Required</p>
                <ul className="mt-1 space-y-1">
                  {requiredItems.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-foreground">
                      <div className={`size-1.5 rounded-full ${item.satisfied ? 'bg-success' : 'bg-danger'}`} />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {optionalItems.length > 0 && (
              <div>
                <p className={sectionLabelClass}>Optional</p>
                <ul className="mt-1 space-y-1">
                  {optionalItems.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-foreground-muted">
                      <div className={`size-1.5 rounded-full ${item.satisfied ? 'bg-success' : 'bg-border-strong'}`} />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {satisfiedItems.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                  Satisfied items ({satisfiedItems.length})
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {satisfiedItems.map((item, idx) => (
                    <li key={idx} className="text-xs text-foreground-subtle">
                      ✓ {item.label}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Children (e.g. inline forms) */}
        {children && <div className="pt-2">{children}</div>}

        {/* Actions (Mobile) */}
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          {secondaryAction && renderAction(secondaryAction, false)}
          {primaryAction && renderAction(primaryAction, true)}
        </div>
        
        {/* Progress Indicator */}
        {progress && (
          <div className="mt-4 pt-4 border-t border-border">
            {progress.isTerminal ? (
              <p className="text-xs text-foreground-subtle">
                This {kind} is {status.label.toLowerCase()} — no further commercial steps expected.
              </p>
            ) : (
              <ol className="flex items-stretch gap-2" aria-label={`${kind} progress`}>
                {progress.steps.map((step, index) => {
                  const isCompleted = index < progress.stepIndex;
                  const isCurrent = index === progress.stepIndex;
                  return (
                    <li
                      key={step.key}
                      className="flex min-w-0 flex-1 flex-col gap-1.5"
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      <span
                        className={[
                          "h-1.5 rounded-full transition-colors",
                          isCompleted
                            ? "bg-foreground"
                            : isCurrent
                              ? "bg-foreground/70"
                              : "bg-foreground/15",
                        ].join(" ")}
                        aria-hidden
                      />
                      <span
                        className={[
                          "truncate text-[0.65rem] font-medium uppercase tracking-wide",
                          isCurrent
                            ? "text-foreground"
                            : isCompleted
                              ? "text-foreground-muted"
                              : "text-foreground-subtle",
                        ].join(" ")}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}

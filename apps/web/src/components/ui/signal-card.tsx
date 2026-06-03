import type { LucideIcon } from "lucide-react";

/** Compact metric / signal tile (dashboards, previews). */
export function SignalCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    neutral: "border-border",
    success: "border-success/30 bg-success/[0.02]",
    warning: "border-warning/30 bg-warning/[0.02]",
    danger: "border-danger/30 bg-danger/[0.02]",
  };

  return (
    <div className={["rounded-[var(--radius-md)] border bg-surface-elevated px-4 py-3 shadow-[var(--shadow-soft)] transition-colors", toneClasses[tone]].join(" ")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground-subtle">
          {label}
        </p>
        {Icon && <Icon className="size-3.5 text-foreground-subtle opacity-60" />}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[10px] leading-tight text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Alias — same layout as `SignalCard` for numeric summaries. */
export const MetricCard = SignalCard;

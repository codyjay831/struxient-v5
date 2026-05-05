/** Compact metric / signal tile (dashboards, previews). */
export function SignalCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Alias — same layout as `SignalCard` for numeric summaries. */
export const MetricCard = SignalCard;

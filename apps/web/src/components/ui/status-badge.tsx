export type StatusBadgeTone = "draft" | "sent" | "approved" | "neutral";

const toneClass: Record<StatusBadgeTone, string> = {
  draft: "border-border bg-foreground/[0.02] text-foreground-muted",
  sent: "border-border-strong bg-foreground/[0.03] text-foreground",
  approved: "border-success/40 bg-success/10 text-success",
  neutral: "border-border bg-surface text-foreground-subtle",
};

/** Visual label only — wire to persisted state when the data layer exists. */
export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: StatusBadgeTone;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}

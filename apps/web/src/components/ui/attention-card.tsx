import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";

export type AttentionCardSeverity = "low" | "medium" | "high";
export type AttentionCardOrigin = "derived" | "preview";

const SEVERITY_PILL_CLASS: Record<AttentionCardSeverity, string> = {
  high: "border-danger/30 bg-danger/10 text-danger",
  medium: "border-border-strong bg-foreground/[0.04] text-foreground",
  low: "border-border bg-foreground/[0.02] text-foreground-muted",
};

const SEVERITY_LABEL: Record<AttentionCardSeverity, string> = {
  high: WORKSTATION_COPY.severity.high,
  medium: WORKSTATION_COPY.severity.medium,
  low: WORKSTATION_COPY.severity.low,
};

/**
 * Card surface: derived cards have a solid 2px left accent border that visually
 * separates them from preview cards. High severity gets a danger tint; others
 * get the standard surface with a border-strong left accent.
 */
const DERIVED_CARD_CLASS: Record<AttentionCardSeverity, string> = {
  high: "border border-danger/40 border-l-2 bg-danger/[0.015] shadow-sm hover:border-danger/60",
  medium:
    "border border-border-strong border-l-2 bg-surface shadow-sm hover:bg-foreground/[0.02]",
  low: "border border-border border-l-2 border-l-border-strong bg-surface hover:border-border-strong",
};

const cardPreviewClass =
  "border-dashed border-border bg-foreground/[0.005] hover:border-border-strong";

const secondaryActionClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type AttentionCardExpandable = {
  /** Richer "why this matters" paragraph (rendered in expandable section). */
  whyThisMatters?: ReactNode;
  /** Concrete next step copy beyond the headline `suggestedAction`. */
  suggestedNextStep?: ReactNode;
};

export type AttentionCardProps = {
  /** The issue headline — the thing that needs attention. */
  title: string;
  /** Short uppercase eyebrow label (e.g. "Lead", "Quote", "Future signal"). */
  eyebrow: string;
  /** Optional Lucide icon shown alongside the eyebrow. */
  icon?: LucideIcon;
  /** One-line context under the title (record name / status / count). */
  recordLabel: string;
  /** Severity tier — drives the card surface and pill colour. */
  severity: AttentionCardSeverity;
  /** Evidence sentence: why this is flagged (shown under "Why it matters"). */
  reason: string;
  /** Single-line "do this next" suggestion (shown under "Next"). */
  suggestedAction: string;
  /** Primary action target — internal app route. */
  href: string;
  /** Optional secondary action — typically a record-navigation link. */
  secondaryHref?: string;
  secondaryActionLabel?: string;
  /** "derived" = computed from real org data; "preview" = illustrative only. */
  origin?: AttentionCardOrigin;
  /** Optional expandable disclosure with deeper context. */
  expandable?: AttentionCardExpandable;
  /** Whether the card is currently selected. */
  isSelected?: boolean;
  className?: string;
};

/**
 * Compact attention card for Workstation lenses (Investigate, future
 * Tasks/Jobs/Schedule signals).
 *
 * Visual hierarchy goals:
 * - The issue (title) is the loudest element.
 * - "Why it matters" and "Next" labels make reason + next step instantly
 *   scannable without reading dense prose.
 * - Derived cards have a left accent rail and a stronger surface than preview
 *   cards, so live signals immediately feel more urgent.
 * - The whole card is clickable to select the item in Workstation.
 */
export function AttentionCard({
  title,
  eyebrow,
  icon: Icon,
  recordLabel,
  severity,
  reason,
  suggestedAction,
  href,
  secondaryHref,
  secondaryActionLabel,
  origin = "derived",
  expandable,
  isSelected,
  className,
}: AttentionCardProps) {
  const isPreview = origin === "preview";
  const hasExpandable = Boolean(
    expandable && (expandable.whyThisMatters || expandable.suggestedNextStep),
  );

  const cardClass = [
    "group relative rounded-lg px-4 py-3 transition-all",
    isPreview ? cardPreviewClass : DERIVED_CARD_CLASS[severity],
    isSelected ? "ring-2 ring-accent ring-offset-2" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClass}>
      {/* Stretched link for the whole card */}
      <Link href={href} className="absolute inset-0 z-0 rounded-lg" aria-label={`Review ${title}`}>
        <span className="sr-only">Review {title}</span>
      </Link>

      <div className="relative z-10 pointer-events-none">
        {/* Header row: eyebrow + pills */}
        <div className="flex flex-wrap items-center gap-2">
          {Icon ? (
            <Icon
              className="size-3.5 shrink-0 text-foreground-subtle"
              strokeWidth={1.5}
              aria-hidden
            />
          ) : null}
          <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
            {eyebrow}
          </span>
          <span
            className={[
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide",
              SEVERITY_PILL_CLASS[severity],
            ].join(" ")}
            title={WORKSTATION_COPY.investigate.severityTitle}
          >
            {SEVERITY_LABEL[severity]}
          </span>
          {isPreview ? (
            <span
              className="inline-flex items-center rounded-md border border-dashed border-border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle"
              title={WORKSTATION_COPY.investigate.previewTooltip}
            >
              {WORKSTATION_COPY.investigate.previewLabel}
            </span>
          ) : null}
        </div>

        {/* Issue title — the loudest element on the card */}
        <h3 className="mt-2 text-sm font-bold leading-snug text-foreground">{title}</h3>
        <p className="mt-0.5 truncate text-xs text-foreground-muted">{recordLabel}</p>

        {/* Labeled content: why + next */}
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-[0.6rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Why it matters
            </dt>
            <dd className="mt-0.5 text-sm italic leading-relaxed text-foreground-muted">
              {reason}
            </dd>
          </div>
          <div>
            <dt className="text-[0.6rem] font-semibold uppercase tracking-wide text-foreground-subtle">
              Next
            </dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-foreground-muted">
              {suggestedAction}
            </dd>
          </div>
        </dl>

        {/* Optional expandable disclosure */}
        {hasExpandable ? (
          <details className="group/details mt-3 pointer-events-auto">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-3.5 shrink-0 transition-transform group-open/details:rotate-90"
                aria-hidden
              />
              <span>More context</span>
            </summary>
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {expandable?.whyThisMatters ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Why this matters
                  </p>
                  <div className="mt-1 text-sm leading-relaxed text-foreground-muted">
                    {expandable.whyThisMatters}
                  </div>
                </div>
              ) : null}
              {expandable?.suggestedNextStep ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Suggested next step
                  </p>
                  <div className="mt-1 text-sm leading-relaxed text-foreground-muted">
                    {expandable.suggestedNextStep}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      {/* Actions */}
      <div className="relative z-20 mt-3 flex flex-wrap gap-2">
        {secondaryHref && secondaryActionLabel ? (
          <Link href={secondaryHref} className={secondaryActionClass}>
            {secondaryActionLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

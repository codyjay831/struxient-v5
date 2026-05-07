"use client";

import type { MouseEvent } from "react";

export type SummaryStripTone = "neutral" | "danger" | "success";

export type SummaryStripItem = {
  /** Stable item key. */
  id: string;
  /** Short label rendered next to the value. */
  label: string;
  /** Numeric or short string value (rendered with `tabular-nums`). */
  value: number | string;
  /** Optional one-line explanation; shown as a small helper under the label. */
  hint?: string;
  /** Visual tone — only neutral/danger/success have v5 tokens. */
  tone?: SummaryStripTone;
  /** When set, clicking the counter smooth-scrolls to `#anchorId`. */
  anchorId?: string;
};

const TONE_VALUE_CLASS: Record<SummaryStripTone, string> = {
  neutral: "text-foreground",
  danger: "text-danger",
  success: "text-success",
};

const TONE_DOT_CLASS: Record<SummaryStripTone, string> = {
  neutral: "bg-foreground-subtle/60",
  danger: "bg-danger",
  success: "bg-success",
};

function scrollToAnchor(anchorId: string) {
  if (typeof window === "undefined") return;
  const target = document.getElementById(anchorId);
  if (!target) return;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

function SummaryStripCounter({ item }: { item: SummaryStripItem }) {
  const tone = item.tone ?? "neutral";
  const isInteractive = Boolean(item.anchorId);

  const inner = (
    <>
      <span
        className={[
          "inline-block size-1.5 shrink-0 rounded-full",
          TONE_DOT_CLASS[tone],
        ].join(" ")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline gap-1.5">
          <span
            className={[
              "text-lg font-semibold tabular-nums leading-none tracking-tight",
              TONE_VALUE_CLASS[tone],
            ].join(" ")}
          >
            {item.value}
          </span>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-foreground-subtle">
            {item.label}
          </span>
        </div>
        {item.hint ? (
          <span className="mt-0.5 text-[0.7rem] leading-snug text-foreground-subtle">
            {item.hint}
          </span>
        ) : null}
      </div>
    </>
  );

  const baseClass =
    "flex min-w-0 items-start gap-2 rounded-md px-2 py-1 text-left";

  if (!isInteractive) {
    return <div className={baseClass}>{inner}</div>;
  }

  const anchorId = item.anchorId as string;

  return (
    <a
      href={`#${anchorId}`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        scrollToAnchor(anchorId);
      }}
      className={[
        baseClass,
        "transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      ].join(" ")}
      aria-label={`${item.value} ${item.label} — jump to section`}
    >
      {inner}
    </a>
  );
}

/**
 * Compact, mobile-friendly counter strip used at the top of a decision page.
 * Each counter is optionally a smooth-scroll anchor target.
 */
export function SummaryStrip({
  items,
  className,
}: {
  items: SummaryStripItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Workstation summary"
      className={[
        "flex flex-wrap items-stretch gap-x-6 gap-y-2 rounded-lg border border-border bg-foreground/[0.015] px-3 py-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {items.map((item) => (
        <div role="listitem" key={item.id} className="min-w-0">
          <SummaryStripCounter item={item} />
        </div>
      ))}
    </div>
  );
}

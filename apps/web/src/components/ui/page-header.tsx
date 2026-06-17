import type { ReactNode } from "react";
import { MetaLabel } from "@/components/ui/meta-label";

/**
 * compact   – top-level operational surfaces (Schedule, Jobs, Customers…).
 *             One concise h1, actions on the same row, no border, tight spacing.
 * instructional – settings, onboarding, and configuration pages that need
 *             a brief explanation or decision context.
 */
export type PageHeaderVariant = "compact" | "instructional";

export type PageHeaderProps = {
  variant?: PageHeaderVariant;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Optional right-aligned actions (toolbar buttons, etc.). */
  actions?: ReactNode;
};

export function PageHeader({
  variant = "instructional",
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  if (variant === "compact") {
    return (
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
    );
  }

  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-2">
            <MetaLabel>{eyebrow}</MetaLabel>
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

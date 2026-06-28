import type { ReactNode } from "react";
import { MetaLabel } from "@/components/ui/meta-label";

/**
 * compact   – top-level operational surfaces (Schedule, Jobs, Customers…).
 *             One concise h1, actions on the same row, no border, tight spacing.
 * settingsCompact – nested settings tabs (e.g. Customer intake subnav).
 *             text-lg title, optional one-line description, mb-4, no border.
 * instructional – settings, onboarding, and configuration pages that need
 *             a brief explanation or decision context.
 */
export type PageHeaderVariant = "compact" | "settingsCompact" | "instructional";

export type PageHeaderProps = {
  variant?: PageHeaderVariant;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Optional right-aligned actions (toolbar buttons, etc.). */
  actions?: ReactNode;
};

const actionContainerClass =
  "flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center";

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
        {actions ? <div className={actionContainerClass}>{actions}</div> : null}
      </header>
    );
  }

  if (variant === "settingsCompact") {
    return (
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className={actionContainerClass}>{actions}</div> : null}
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
      {actions ? <div className={actionContainerClass}>{actions}</div> : null}
    </header>
  );
}

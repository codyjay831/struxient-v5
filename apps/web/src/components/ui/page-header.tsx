import type { ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Optional right-aligned actions (toolbar buttons, etc.). */
  actions?: ReactNode;
};

/**
 * Record-surface page title with optional actions and a clear bottom edge.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <div className="mt-3 max-w-2xl text-base leading-relaxed text-foreground-muted">
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

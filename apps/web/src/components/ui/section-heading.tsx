import type { ReactNode } from "react";

/** In-page section title (h2) below the main `SectionHeader` / `PageHeader`. */
export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 @xl:flex-row @xl:items-end @xl:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-2 @xl:shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

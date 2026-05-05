import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      {Icon ? (
        <Icon
          className="mb-4 size-10 text-foreground-subtle opacity-70"
          strokeWidth={1.25}
          aria-hidden
        />
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground-muted">
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

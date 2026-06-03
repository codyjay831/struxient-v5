import type { ReactNode } from "react";

export function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] bg-foreground/[0.04] px-2 py-0.5 text-xs font-medium text-foreground-subtle">
      {children}
    </span>
  );
}

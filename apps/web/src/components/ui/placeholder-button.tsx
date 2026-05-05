import type { ReactNode } from "react";

/** Disabled control — signals a future action without implying persistence. */
export function PlaceholderButton({
  children,
  title = "Available once org data and persistence exist",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={title}
      className="cursor-not-allowed rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs font-medium text-foreground-subtle opacity-60"
    >
      {children}
    </button>
  );
}

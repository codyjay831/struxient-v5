import type { ReactNode } from "react";

export function WorkspacePanel({
  children,
  className = "",
  padding = "comfortable",
  id,
}: {
  children: ReactNode;
  className?: string;
  padding?: "comfortable" | "compact" | "none";
  id?: string;
}) {
  const pad =
    padding === "none"
      ? ""
      : padding === "compact"
        ? "p-4 sm:p-5"
        : "p-6 sm:p-8";

  return (
    <div
      id={id}
      className={[
        "rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-soft)]",
        pad,
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

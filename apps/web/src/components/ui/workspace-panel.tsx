import type { ReactNode } from "react";

export function WorkspacePanel({
  children,
  className = "",
  padding = "comfortable",
}: {
  children: ReactNode;
  className?: string;
  padding?: "comfortable" | "compact" | "none";
}) {
  const pad =
    padding === "none"
      ? ""
      : padding === "compact"
        ? "p-4 sm:p-5"
        : "p-6 sm:p-8";

  return (
    <div
      className={[
        "rounded-xl border border-border bg-surface shadow-sm",
        pad,
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

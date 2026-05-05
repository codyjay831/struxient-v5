import type { ReactNode } from "react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

/**
 * Short product-path explanation with optional links—copy/wayfinding only, no data.
 */
export function HandoffPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <WorkspacePanel padding="compact" className="mb-8 bg-foreground/[0.015]">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{description}</p>
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </WorkspacePanel>
  );
}

export const handoffPrimaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export const handoffMutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

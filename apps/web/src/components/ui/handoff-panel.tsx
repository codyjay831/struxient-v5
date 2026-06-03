import type { ReactNode } from "react";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

/**
 * Short wayfinding panel with optional links — product context, not architecture docs.
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
    <WorkspacePanel padding="compact" className="mb-8 border-brand/20 bg-brand-muted">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{description}</p>
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </WorkspacePanel>
  );
}

export { primaryLinkClass as handoffPrimaryLinkClass, mutedLinkClass as handoffMutedLinkClass } from "@/components/ui/button";

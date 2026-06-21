import { ButtonLink } from "@/components/ui/button";
import { workspaceContentWidth } from "@/components/shell/shell-layout-classes";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import type { QuoteWorkflowPresentation } from "@/lib/quote-workflow-presenter";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteWorkspaceTabData } from "@/lib/quote-workspace-payload";

export type QuoteWorkspaceShellProps = {
  quote: QuoteWorkSurfaceData;
  workflow: QuoteWorkflowPresentation;
  workspaceTabs: QuoteWorkspaceTabData;
  /** Optional return-context link shown when arrived from Workstation. */
  returnHref?: string;
};

/**
 * Full Quote page shell. Nav-only chrome — identity and workflow live in
 * QuoteWorkSurface (persistent hero above tabs + Overview command center).
 */
export function QuoteWorkspaceShell({
  quote,
  workflow,
  workspaceTabs,
  returnHref,
}: QuoteWorkspaceShellProps) {
  return (
    <div className={workspaceContentWidth.wide}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {returnHref ? (
          <ButtonLink href={returnHref} variant="ghost" size="sm">
            ← Workstation
          </ButtonLink>
        ) : null}
        {quote.leadHref ? (
          <ButtonLink href={quote.leadHref} variant="ghost" size="sm">
            ← Opportunity
          </ButtonLink>
        ) : null}
        <ButtonLink href="/leads" variant="ghost" size="sm">
          ← Sales pipeline
        </ButtonLink>
      </div>

      <QuoteWorkSurface
        quote={quote}
        workflow={workflow}
        workspaceTabs={workspaceTabs}
      />
    </div>
  );
}

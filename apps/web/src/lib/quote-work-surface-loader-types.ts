import type { QuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteWorkspaceTabData } from "@/lib/quote-workspace-payload";
import type { QuoteWorkflowPresentation } from "@/lib/quote-workflow-presenter";

/** Client-safe mirror of {@link loadQuoteWorkSurface} return shape. */
export type QuoteWorkSurfaceLoaderResult = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workflow: QuoteWorkflowPresentation;
  workspaceTabs: QuoteWorkspaceTabData;
};

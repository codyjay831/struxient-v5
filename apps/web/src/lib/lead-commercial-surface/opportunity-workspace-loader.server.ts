import "server-only";

import type { RequestContext } from "@/lib/auth-context";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import type { QuoteWorkSurfaceLoaderResult } from "@/lib/quote-work-surface-loader-types";
import { resolveWorkspaceQuoteId } from "@/lib/opportunity-workspace-quote-id";
import {
  loadLeadCommercialSurface,
  type LeadCommercialSurfacePayload,
} from "@/lib/lead-commercial-surface/loader";

export type OpportunityWorkspacePayload = {
  lead: LeadCommercialSurfacePayload;
  activeQuoteSurface: QuoteWorkSurfaceLoaderResult | null;
  activeQuoteId: string | null;
};

export async function loadOpportunityWorkspace(
  leadId: string,
  ctx: RequestContext,
): Promise<OpportunityWorkspacePayload | null> {
  const lead = await loadLeadCommercialSurface(leadId, ctx);
  if (!lead || lead.surfaceMode !== "commercial") return null;

  const activeQuoteId = resolveWorkspaceQuoteId(lead.opportunityFlow, lead.linkedQuotes);
  const activeQuoteSurface = activeQuoteId
    ? await loadQuoteWorkSurface(activeQuoteId, ctx.organizationId)
    : null;

  return {
    lead,
    activeQuoteSurface,
    activeQuoteId,
  };
}

import type { OpportunityActionKind } from "@/lib/opportunity-flow";

export type OpportunityWorkspaceTab = "review" | "quote";

export function opportunityWorkspaceHref(
  leadId: string,
  tab: OpportunityWorkspaceTab = "review",
  hash?: string,
): string {
  const params = new URLSearchParams({ tab });
  const url = `/leads/${leadId}?${params.toString()}`;
  if (!hash) return url;
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  return `${url}${normalized}`;
}

export function parseOpportunityWorkspaceTab(
  value: string | string[] | undefined | null,
): OpportunityWorkspaceTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "quote" ? "quote" : "review";
}

export function opportunityActionOpensQuoteTab(kind: OpportunityActionKind): boolean {
  return (
    kind === "START_QUOTE" ||
    kind === "OPEN_DRAFT_QUOTE" ||
    kind === "OPEN_QUOTE" ||
    kind === "SEND_QUOTE" ||
    kind === "FOLLOW_UP_CUSTOMER" ||
    kind === "CREATE_REVISION_DRAFT"
  );
}

export type SiteDetailsElectricUtilityCandidate = {
  name: string;
  officialWebsite: string | null;
  serviceUpgradeUrl: string | null;
  coverageSourceTitle: string;
  coverageSourceUrl: string;
  coverageBasis: "ZIP" | "CITY" | "COUNTY" | "ADDRESS";
  addressMatched: boolean;
  isElectric: boolean;
  explanation: string;
};

export type SiteDetailsSourceLink = {
  title: string;
  url: string;
};

export type UtilityCandidateDecisionReason =
  | "NO_CANDIDATE"
  | "NON_ELECTRIC_CANDIDATE"
  | "ADDRESS_NOT_MATCHED"
  | "SOURCE_NOT_GROUNDED"
  | "SOURCE_TITLE_MISSING"
  | "NOT_DISTRIBUTION_UTILITY"
  | "ACCEPTED";

export type UtilityCandidateDecision = {
  candidate: SiteDetailsElectricUtilityCandidate | null;
  reason: UtilityCandidateDecisionReason;
};

export function normalizeGroundedElectricUtilityCandidate(params: {
  candidate: SiteDetailsElectricUtilityCandidate | null;
  sourceLinks: SiteDetailsSourceLink[];
}): SiteDetailsElectricUtilityCandidate | null {
  return decideGroundedElectricUtilityCandidate(params).candidate;
}

export function decideGroundedElectricUtilityCandidate(params: {
  candidate: SiteDetailsElectricUtilityCandidate | null;
  sourceLinks: SiteDetailsSourceLink[];
}): UtilityCandidateDecision {
  const candidate = params.candidate;
  if (!candidate) return { candidate: null, reason: "NO_CANDIDATE" };
  if (!candidate.isElectric) return { candidate: null, reason: "NON_ELECTRIC_CANDIDATE" };
  if (!candidate.addressMatched) return { candidate: null, reason: "ADDRESS_NOT_MATCHED" };

  const sourceByUrl = new Map(
    params.sourceLinks.map((link) => [link.url.trim().toLowerCase(), link]),
  );
  const coverageSource = sourceByUrl.get(candidate.coverageSourceUrl.trim().toLowerCase());
  if (!coverageSource) return { candidate: null, reason: "SOURCE_NOT_GROUNDED" };
  if (!coverageSource.title.trim()) return { candidate: null, reason: "SOURCE_TITLE_MISSING" };
  if (looksLikeWaterOrSewerUtility(candidate.name, candidate.officialWebsite)) {
    return { candidate: null, reason: "NOT_DISTRIBUTION_UTILITY" };
  }
  if (looksLikeCommunityChoiceProvider(candidate.name, candidate.officialWebsite)) {
    return { candidate: null, reason: "NOT_DISTRIBUTION_UTILITY" };
  }

  return {
    candidate: {
      ...candidate,
      coverageSourceTitle: coverageSource.title.trim(),
      coverageSourceUrl: coverageSource.url.trim(),
    },
    reason: "ACCEPTED",
  };
}

function looksLikeWaterOrSewerUtility(name: string, officialWebsite: string | null): boolean {
  const n = name.trim().toLowerCase();
  const w = officialWebsite?.trim().toLowerCase() ?? "";
  const utilityText = `${n} ${w}`;
  const hasWaterIndicators =
    utilityText.includes("water") ||
    utilityText.includes("wastewater") ||
    utilityText.includes("sewer") ||
    utilityText.includes("sanitation");
  if (!hasWaterIndicators) return false;
  return !(
    utilityText.includes("electric") ||
    utilityText.includes("energy") ||
    utilityText.includes("power") ||
    utilityText.includes("pge")
  );
}

function looksLikeCommunityChoiceProvider(name: string, officialWebsite: string | null): boolean {
  const utilityText = `${name.trim().toLowerCase()} ${(officialWebsite ?? "").trim().toLowerCase()}`;
  return (
    utilityText.includes("community choice") ||
    utilityText.includes("clean power alliance") ||
    utilityText.includes("choice energy") ||
    utilityText.includes("cca")
  );
}

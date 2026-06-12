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

export function normalizeGroundedElectricUtilityCandidate(params: {
  candidate: SiteDetailsElectricUtilityCandidate | null;
  sourceLinks: SiteDetailsSourceLink[];
}): SiteDetailsElectricUtilityCandidate | null {
  const candidate = params.candidate;
  if (!candidate) return null;
  if (!candidate.isElectric) return null;
  if (!candidate.addressMatched) return null;

  const sourceByUrl = new Map(
    params.sourceLinks.map((link) => [link.url.trim().toLowerCase(), link]),
  );
  const coverageSource = sourceByUrl.get(candidate.coverageSourceUrl.trim().toLowerCase());
  if (!coverageSource) return null;
  if (!coverageSource.title.trim()) return null;
  if (looksLikeWaterOrSewerUtility(candidate.name, candidate.officialWebsite)) return null;

  return {
    ...candidate,
    coverageSourceTitle: coverageSource.title.trim(),
    coverageSourceUrl: coverageSource.url.trim(),
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

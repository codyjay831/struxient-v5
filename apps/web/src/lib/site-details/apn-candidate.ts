export type SiteDetailsApnCandidate = {
  value: string;
  sourceTitle: string;
  sourceUrl: string;
  addressMatched: boolean;
  apnShownOnSource: boolean;
  explanation: string;
};

export type SiteDetailsSourceLink = {
  title: string;
  url: string;
};

export function normalizeGroundedApnCandidate(params: {
  apnCandidate: SiteDetailsApnCandidate | null;
  sourceLinks: SiteDetailsSourceLink[];
  countyAssessorSearchUrl: string | null;
  existingOfficialVerificationUrl?: string | null;
}): SiteDetailsApnCandidate | null {
  const candidate = params.apnCandidate;
  if (!candidate) return null;
  if (!candidate.addressMatched) return null;
  if (!candidate.apnShownOnSource) return null;
  const officialVerificationUrl = (
    params.countyAssessorSearchUrl ??
    params.existingOfficialVerificationUrl ??
    ""
  ).trim();
  if (!officialVerificationUrl) return null;
  if (!isLikelyOfficialVerificationUrl(officialVerificationUrl)) return null;

  const sourceByUrl = new Map(
    params.sourceLinks.map((link) => [link.url.trim().toLowerCase(), link]),
  );
  if (sourceByUrl.size < 2) return null;
  const candidateUrlKey = candidate.sourceUrl.trim().toLowerCase();
  const groundedSource = sourceByUrl.get(candidateUrlKey);
  if (!groundedSource) return null;
  const groundedTitle = groundedSource.title.trim();
  if (!groundedTitle) return null;
  const groundedSources = [...sourceByUrl.values()];
  const hasSecondaryDiscoverySource = groundedSources.some((link) =>
    isSecondaryDiscoveryUrl(link.url),
  );
  if (!hasSecondaryDiscoverySource) return null;

  return {
    ...candidate,
    sourceTitle: groundedTitle,
    sourceUrl: groundedSource.url.trim(),
  };
}

function isSecondaryDiscoveryUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.includes("zillow.com") ||
    normalized.includes("redfin.com") ||
    normalized.includes("realtor.com") ||
    normalized.includes("compass.com")
  );
}

function isLikelyOfficialVerificationUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.includes(".gov") ||
    normalized.includes("assessor") ||
    normalized.includes("parcel") ||
    normalized.includes("gis") ||
    normalized.includes("tax")
  );
}

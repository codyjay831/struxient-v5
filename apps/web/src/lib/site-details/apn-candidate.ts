export type SiteDetailsApnCandidate = {
  value: string;
  sourceTitle: string;
  sourceUrl: string;
  addressMatched: boolean;
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
  const officialVerificationUrl = (
    params.countyAssessorSearchUrl ??
    params.existingOfficialVerificationUrl ??
    ""
  ).trim();
  if (!officialVerificationUrl) return null;

  const sourceByUrl = new Map(
    params.sourceLinks.map((link) => [link.url.trim().toLowerCase(), link]),
  );
  const candidateUrlKey = candidate.sourceUrl.trim().toLowerCase();
  const groundedSource = sourceByUrl.get(candidateUrlKey);
  if (!groundedSource) return null;
  const groundedTitle = groundedSource.title.trim();
  if (!groundedTitle) return null;

  return {
    ...candidate,
    sourceTitle: groundedTitle,
    sourceUrl: groundedSource.url.trim(),
  };
}

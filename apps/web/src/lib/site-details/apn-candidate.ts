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

export type SiteDetailsApnEvidence = {
  value: string;
  sourceTitle: string;
  sourceUrl: string;
  addressMatched: boolean;
  apnShownOnSource: boolean;
  explanation: string;
};

export type ApnCandidateDecisionReason =
  | "NO_EVIDENCE"
  | "NO_OFFICIAL_VERIFICATION_URL"
  | "INVALID_OFFICIAL_VERIFICATION_URL"
  | "INSUFFICIENT_GROUNDED_SOURCES"
  | "NO_GROUNDED_EVIDENCE"
  | "CONFLICTING_APN_VALUES"
  | "NO_ACCEPTED_GROUP"
  | "ACCEPTED";

export type ApnCandidateDecision = {
  candidate: SiteDetailsApnCandidate | null;
  reason: ApnCandidateDecisionReason;
  exactAddressEvidenceMatch: boolean;
  neighborEvidenceDetected: boolean;
  normalizedCandidate: string | null;
  evidenceSourceUrls: string[];
};

export function normalizeGroundedApnCandidate(params: {
  apnEvidence: SiteDetailsApnEvidence[];
  sourceLinks: SiteDetailsSourceLink[];
  countyAssessorSearchUrl: string | null;
  existingOfficialVerificationUrl?: string | null;
  addressLine?: string | null;
}): SiteDetailsApnCandidate | null {
  return decideGroundedApnCandidate(params).candidate;
}

export function decideGroundedApnCandidate(params: {
  apnEvidence: SiteDetailsApnEvidence[];
  sourceLinks: SiteDetailsSourceLink[];
  countyAssessorSearchUrl: string | null;
  existingOfficialVerificationUrl?: string | null;
  addressLine?: string | null;
}): ApnCandidateDecision {
  if (!params.apnEvidence.length) {
    return emptyDecision("NO_EVIDENCE");
  }

  const officialVerificationUrl = (
    params.countyAssessorSearchUrl ??
    params.existingOfficialVerificationUrl ??
    ""
  ).trim();
  if (!officialVerificationUrl) {
    return emptyDecision("NO_OFFICIAL_VERIFICATION_URL");
  }
  if (!isLikelyOfficialVerificationUrl(officialVerificationUrl)) {
    return emptyDecision("INVALID_OFFICIAL_VERIFICATION_URL");
  }

  const sourceByUrl = new Map(
    params.sourceLinks.map((link) => [link.url.trim().toLowerCase(), link]),
  );
  if (sourceByUrl.size < 2) {
    return emptyDecision("INSUFFICIENT_GROUNDED_SOURCES");
  }

  let exactAddressEvidenceMatch = false;
  let neighborEvidenceDetected = false;

  const groundedEvidence = params.apnEvidence
    .map((candidate) => {
      if (!candidate.addressMatched || !candidate.apnShownOnSource) return null;
      if (looksLikeGenericSearchResult(candidate.sourceTitle, candidate.sourceUrl)) return null;
      const matchesAddress = looksLikeEvidenceForAddress(
        `${candidate.sourceTitle} ${candidate.explanation}`,
        candidate.sourceUrl,
        params.addressLine,
      );
      if (!matchesAddress && !isLikelyPropertyDetailUrl(candidate.sourceUrl)) {
        if (
          looksLikeNeighborAddressEvidence(
            `${candidate.sourceTitle} ${candidate.explanation}`,
            candidate.sourceUrl,
            params.addressLine,
          )
        ) {
          neighborEvidenceDetected = true;
        }
        return null;
      }
      if (matchesAddress) exactAddressEvidenceMatch = true;
      const groundedSource = sourceByUrl.get(candidate.sourceUrl.trim().toLowerCase());
      if (!groundedSource) return null;
      const groundedTitle = groundedSource.title.trim();
      if (!groundedTitle) return null;
      const normalizedValue = normalizeApnValue(candidate.value);
      if (!normalizedValue) return null;
      return {
        ...candidate,
        sourceTitle: groundedTitle,
        sourceUrl: groundedSource.url.trim(),
        normalizedValue,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  if (groundedEvidence.length === 0) {
    return {
      ...emptyDecision("NO_GROUNDED_EVIDENCE"),
      exactAddressEvidenceMatch,
      neighborEvidenceDetected,
    };
  }

  const byNormalizedValue = new Map<
    string,
    Array<
      SiteDetailsApnCandidate & {
        normalizedValue: string;
      }
    >
  >();
  for (const evidence of groundedEvidence) {
    const existing = byNormalizedValue.get(evidence.normalizedValue) ?? [];
    existing.push(evidence);
    byNormalizedValue.set(evidence.normalizedValue, existing);
  }

  if (byNormalizedValue.size > 1) {
    return {
      ...emptyDecision("CONFLICTING_APN_VALUES"),
      exactAddressEvidenceMatch,
      neighborEvidenceDetected,
      evidenceSourceUrls: groundedEvidence.map((item) => item.sourceUrl),
    };
  }

  const acceptedGroups = [...byNormalizedValue.values()].filter((group) => {
    const uniqueDomains = new Set(group.map((item) => toDomain(item.sourceUrl)));
    const hasOfficialSource = group.some((item) => isLikelyOfficialEvidenceUrl(item.sourceUrl));
    const hasSecondaryDiscoverySource = group.some((item) =>
      isSecondaryDiscoveryEvidence(item.sourceTitle, item.sourceUrl),
    );
    const hasTrustedListingSource = group.some((item) =>
      isTrustedListingEvidence(item.sourceTitle, item.sourceUrl),
    );
    return (
      hasOfficialSource ||
      (uniqueDomains.size >= 2 && hasSecondaryDiscoverySource) ||
      hasTrustedListingSource
    );
  });

  if (acceptedGroups.length === 0) {
    return {
      ...emptyDecision("NO_ACCEPTED_GROUP"),
      exactAddressEvidenceMatch,
      neighborEvidenceDetected,
      evidenceSourceUrls: groundedEvidence.map((item) => item.sourceUrl),
    };
  }

  const selectedGroup = acceptedGroups.sort((left, right) => {
    const leftOfficial = left.some((item) => isLikelyOfficialEvidenceUrl(item.sourceUrl));
    const rightOfficial = right.some((item) => isLikelyOfficialEvidenceUrl(item.sourceUrl));
    if (leftOfficial !== rightOfficial) return leftOfficial ? -1 : 1;
    return right.length - left.length;
  })[0];
  if (!selectedGroup || selectedGroup.length === 0) {
    return {
      ...emptyDecision("NO_ACCEPTED_GROUP"),
      exactAddressEvidenceMatch,
      neighborEvidenceDetected,
      evidenceSourceUrls: groundedEvidence.map((item) => item.sourceUrl),
    };
  }

  const preferredSource =
    selectedGroup.find((item) => isLikelyOfficialEvidenceUrl(item.sourceUrl)) ??
    selectedGroup.find((item) => isSecondaryDiscoveryEvidence(item.sourceTitle, item.sourceUrl)) ??
    selectedGroup[0];
  if (!preferredSource) {
    return {
      ...emptyDecision("NO_ACCEPTED_GROUP"),
      exactAddressEvidenceMatch,
      neighborEvidenceDetected,
      evidenceSourceUrls: groundedEvidence.map((item) => item.sourceUrl),
    };
  }

  return {
    candidate: {
      value: selectedGroup[0].value,
      sourceTitle: preferredSource.sourceTitle,
      sourceUrl: preferredSource.sourceUrl,
      addressMatched: true,
      apnShownOnSource: true,
      explanation: selectedGroup[0].explanation,
    },
    reason: "ACCEPTED",
    exactAddressEvidenceMatch,
    neighborEvidenceDetected,
    normalizedCandidate: selectedGroup[0].normalizedValue,
    evidenceSourceUrls: selectedGroup.map((item) => item.sourceUrl),
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

function isSecondaryDiscoveryEvidence(title: string, url: string): boolean {
  const combined = `${title} ${url}`.toLowerCase();
  return (
    combined.includes("zillow.com") ||
    combined.includes("redfin.com") ||
    combined.includes("realtor.com") ||
    combined.includes("compass.com")
  );
}

function isTrustedListingSourceUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.includes("zillow.com") ||
    normalized.includes("redfin.com") ||
    normalized.includes("realtor.com") ||
    normalized.includes("compass.com")
  );
}

function isTrustedListingEvidence(title: string, url: string): boolean {
  return isSecondaryDiscoveryEvidence(title, url);
}

function isLikelyOfficialVerificationUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return (
    normalized.includes("vertexaisearch.cloud.google.com/grounding-api-redirect/") ||
    normalized.includes(".gov") ||
    normalized.includes("assessor") ||
    normalized.includes("parcel") ||
    normalized.includes("gis") ||
    normalized.includes("tax") ||
    normalized.includes("publicaccessnow.com") ||
    normalized.includes("countygateway.com") ||
    normalized.includes("parcelquest.com")
  );
}

function isLikelyOfficialEvidenceUrl(url: string): boolean {
  const normalized = url.trim().toLowerCase();
  return normalized.includes(".gov") || normalized.includes("assessor") || normalized.includes("county");
}

function looksLikeGenericSearchResult(title: string, sourceUrl: string): boolean {
  const t = title.trim().toLowerCase();
  const u = sourceUrl.trim().toLowerCase();
  const genericSearchTitle =
    t.includes("web query") ||
    t.includes("map search") ||
    t.includes("search result") ||
    t.includes("property search") ||
    t.includes("parcel search");
  const genericSearchUrl =
    u.includes("/search") || u.includes("search=") || u.includes("query");
  return genericSearchTitle && genericSearchUrl && !isLikelyPropertyDetailUrl(sourceUrl);
}

function looksLikeEvidenceForAddress(
  title: string,
  sourceUrl: string,
  addressLine: string | null | undefined,
): boolean {
  const normalizedAddress = (addressLine ?? "").trim().toLowerCase();
  if (!normalizedAddress) return true;
  const houseNumberMatch = normalizedAddress.match(/\b\d+\b/);
  const houseNumber = houseNumberMatch?.[0] ?? null;
  if (!houseNumber) return true;
  const streetToken = normalizedAddress
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .find((token) => token.length >= 4 && !/^\d+$/.test(token));
  if (!streetToken) return true;
  const evidenceText = `${title} ${decodeURIComponent(sourceUrl)}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  if (!evidenceText.includes(houseNumber) || !evidenceText.includes(streetToken)) {
    return false;
  }

  const expectedZip = normalizedAddress.match(/\b\d{5}\b/)?.[0] ?? null;
  if (expectedZip) {
    const evidenceZips: string[] = evidenceText.match(/\b\d{5}\b/g) ?? [];
    if (evidenceZips.length > 0 && !evidenceZips.includes(expectedZip)) {
      return false;
    }
  }

  return true;
}

function looksLikeNeighborAddressEvidence(
  title: string,
  sourceUrl: string,
  addressLine: string | null | undefined,
): boolean {
  const normalizedAddress = (addressLine ?? "").trim().toLowerCase();
  const houseNumberMatch = normalizedAddress.match(/\b\d+\b/);
  const expectedHouseNumber = houseNumberMatch?.[0] ?? null;
  if (!expectedHouseNumber) return false;
  const evidenceText = `${title} ${decodeURIComponent(sourceUrl)}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const evidenceNumbers = evidenceText.match(/\b\d+\b/g) ?? [];
  return evidenceNumbers.some((num) => num !== expectedHouseNumber);
}

function isLikelyPropertyDetailUrl(sourceUrl: string): boolean {
  const u = sourceUrl.trim().toLowerCase();
  return (
    u.includes("propertydetail") ||
    u.includes("propertyid=") ||
    u.includes("parcelid=") ||
    u.includes("apn=")
  );
}

function normalizeApnValue(value: string): string {
  return value.replace(/\D/g, "");
}

function toDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function emptyDecision(reason: ApnCandidateDecisionReason): ApnCandidateDecision {
  return {
    candidate: null,
    reason,
    exactAddressEvidenceMatch: false,
    neighborEvidenceDetected: false,
    normalizedCandidate: null,
    evidenceSourceUrls: [],
  };
}

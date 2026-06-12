export type ApprovedGroundedSource = {
  id: string;
  title: string;
  url: string;
  normalizedUrl: string;
  domain: string | null;
  supportText: string[];
};

export type GroundedSourceInput = {
  title: string | null | undefined;
  url: string | null | undefined;
  supportText?: Array<string | null | undefined>;
};

const TRACKING_QUERY_KEYS = new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "igshid",
  "mc_cid",
  "mc_eid",
]);

export function buildApprovedGroundedSources(inputs: GroundedSourceInput[]): ApprovedGroundedSource[] {
  const byIdentity = new Map<string, ApprovedGroundedSource>();

  for (const input of inputs) {
    const rawUrl = (input.url ?? "").trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) continue;

    const normalizedUrl = normalizeGroundedSourceUrl(rawUrl);
    if (!normalizedUrl) continue;
    const domain = getDomain(normalizedUrl);
    const title = normalizeTitle(input.title, domain);
    const supportText = normalizeSupportText(input.supportText ?? []);
    const id = toSourceId(normalizedUrl);

    const existing = byIdentity.get(normalizedUrl);
    if (!existing) {
      byIdentity.set(normalizedUrl, {
        id,
        title,
        url: rawUrl,
        normalizedUrl,
        domain,
        supportText,
      });
      continue;
    }

    if (existing.title === "Grounded source" && title !== "Grounded source") {
      existing.title = title;
    }
    if (existing.url.length > rawUrl.length) {
      existing.url = rawUrl;
    }
    if (supportText.length > 0) {
      existing.supportText = dedupeStrings([...existing.supportText, ...supportText]);
    }
  }

  return [...byIdentity.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getApprovedGroundedSourceById(
  approved: ApprovedGroundedSource[],
  sourceId: string | null | undefined,
): ApprovedGroundedSource | null {
  const id = (sourceId ?? "").trim();
  if (!id) return null;
  return approved.find((item) => item.id === id) ?? null;
}

export function serializeApprovedGroundedSourcesForPrompt(approved: ApprovedGroundedSource[]): string {
  return JSON.stringify(
    approved.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      domain: source.domain,
      supportText: source.supportText,
    })),
    null,
    2,
  );
}

export function normalizeGroundedSourceUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!/^https?:$/i.test(parsed.protocol)) return null;

    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    parsed.hash = "";

    const nextParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith("utm_") || TRACKING_QUERY_KEYS.has(lowerKey)) continue;
      nextParams.append(key, value);
    }
    parsed.search = nextParams.toString() ? `?${nextParams.toString()}` : "";

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(value: string | null | undefined, domain: string | null): string {
  const title = (value ?? "").trim();
  if (title) return title;
  if (domain) return domain;
  return "Grounded source";
}

function normalizeSupportText(values: Array<string | null | undefined>): string[] {
  return dedupeStrings(
    values
      .map((value) => (value ?? "").trim())
      .filter((value) => value.length > 0),
  );
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function toSourceId(value: string): string {
  const hash = fnv1a32(value);
  return `src_${hash.toString(16).padStart(8, "0")}`;
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

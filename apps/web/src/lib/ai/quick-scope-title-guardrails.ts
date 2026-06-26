const BRACKETED_LABEL_PATTERN = /\[[^\]]+\]/g;

const MARKETING_SUFFIX_PATTERN =
  /\((?:\s*(?:hero|primary|recommended|best value|smart(?:\s+system)?|premium|elite|advanced(?:\s+package)?|complete(?:\s+system)?)[^)]*)\)/gi;

const MARKETING_PHRASES = [
  "hero",
  "primary",
  "recommended",
  "best value",
  "smart system",
  "premium",
  "elite",
  "advanced package",
  "advanced",
  "complete system",
] as const;

const GROUNDED_FEATURE_TERMS = [
  "smart",
  "premium",
  "advanced",
  "elite",
  "monitoring",
] as const;

function collapseSpacing(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,/()-])/g, "$1")
    .replace(/([(/-])\s+/g, "$1")
    .trim();
}

function removeUngroundedFeatureTerms(title: string, groundingText: string): string {
  let next = title;
  const lowerGrounding = groundingText.toLowerCase();

  for (const term of GROUNDED_FEATURE_TERMS) {
    if (!lowerGrounding.includes(term)) {
      const pattern = new RegExp(`\\b${term}\\b`, "gi");
      next = next.replace(pattern, " ");
    }
  }

  if (!lowerGrounding.includes("smart")) {
    next = next.replace(/\bsmart\s+system\b/gi, " ");
  }

  return collapseSpacing(next);
}

function removeMarketingPhrases(title: string): string {
  let next = title;
  for (const phrase of MARKETING_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "gi");
    next = next.replace(pattern, " ");
  }
  return collapseSpacing(next);
}

function fallbackTitle(originalTitle: string): string {
  const lowered = originalTitle.toLowerCase();
  if (/\b(200a|200 amp|200-amp)\b/.test(lowered)) {
    return "200A Service Upgrade";
  }
  if (/\b(service|panel|electrical)\b/.test(lowered) && /\bupgrade|replacement\b/.test(lowered)) {
    return "Main Electrical Service Upgrade";
  }
  if (/\broof|reroof|re-roof|shingle\b/.test(lowered)) {
    return "New Roof Installation";
  }
  if (/\bbath|bathroom|shower|vanity\b/.test(lowered)) {
    return "Bathroom Remodel";
  }
  if (/\bev|charger\b/.test(lowered)) {
    return "EV Charger Installation";
  }
  return "Scope Item";
}

export function sanitizeQuickScopeLineTitle(
  rawTitle: string,
  options?: { groundingText?: string | null },
): string {
  const original = collapseSpacing(rawTitle);
  if (!original) {
    return "Scope Item";
  }

  let title = original;
  title = title.replace(BRACKETED_LABEL_PATTERN, " ");
  title = title.replace(MARKETING_SUFFIX_PATTERN, " ");
  title = collapseSpacing(title);
  title = removeMarketingPhrases(title);

  const groundingText = options?.groundingText?.trim() ?? "";
  if (groundingText) {
    title = removeUngroundedFeatureTerms(title, groundingText);
  } else {
    title = removeUngroundedFeatureTerms(title, "");
    title = removeMarketingPhrases(title);
  }

  title = title
    .replace(/\(\s*\)/g, " ")
    .replace(/^\W+|\W+$/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return title.length > 0 ? title : fallbackTitle(original);
}

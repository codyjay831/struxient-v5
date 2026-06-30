import type {
  QuoteScopeContextSection,
  QuoteScopeContextSourceType,
  QuoteScopeContextVisibility,
} from "@/lib/ai/quote-scope-capture-context";
import type {
  ClarificationAnswerValue,
  ClarificationQuestion,
  ClarificationQuestionSet,
} from "./clarification-types";

export const CLARIFY_SCOPE_ROUTES = [
  "ASK_CUSTOMER",
  "ASK_STAFF",
  "VERIFY_ONSITE",
  "QUOTE_OPTION",
  "ANSWERED",
  "REMOVE",
] as const;

export type ClarifyScopeRoute = (typeof CLARIFY_SCOPE_ROUTES)[number];

export type ClarifyScopeKnownFact = {
  key: string;
  label: string;
  value: string;
  sourceLabel: string;
  sourceType: QuoteScopeContextSourceType;
  visibility: QuoteScopeContextVisibility;
};

export type ClarifyScopeQuestionReview = {
  questionKey: string;
  route: ClarifyScopeRoute;
  reason: string;
  sourceLabel?: string;
  sourceType?: QuoteScopeContextSourceType;
  prefill?: ClarificationAnswerValue;
  prefillLabel?: string;
};

export type ClarifyScopeContextReview = {
  knownFacts: ClarifyScopeKnownFact[];
  questionReviews: ClarifyScopeQuestionReview[];
};

export function isClarifyScopeCustomerProposalRoute(route: ClarifyScopeRoute | undefined): boolean {
  return route === "ASK_CUSTOMER" || route === "QUOTE_OPTION" || route == null;
}

type FactKey =
  | "permit_required"
  | "panel_amperage"
  | "breaker_spaces"
  | "load_calculation"
  | "charger_location"
  | "run_length"
  | "finished_drywall"
  | "clean_install"
  | "outlet_troubleshooting"
  | "charger_model"
  | "charger_supplied_by"
  | "smart_charger_setup";

type Fact = ClarifyScopeKnownFact & {
  key: FactKey;
  yesNo?: boolean;
  numberValue?: number;
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function firstMatch(value: string, patterns: readonly RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match;
  }
  return null;
}

function addFact(facts: Fact[], fact: Fact) {
  const dedupeKey = `${fact.key}:${fact.value.toLowerCase()}`;
  if (facts.some((existing) => `${existing.key}:${existing.value.toLowerCase()}` === dedupeKey)) {
    return;
  }
  facts.push(fact);
}

function extractFactsFromSection(section: QuoteScopeContextSection): Fact[] {
  if (section.isEmpty || !section.body.trim()) return [];
  const text = section.body.trim();
  const normalized = normalizeText(text);
  const facts: Fact[] = [];
  const base = {
    sourceLabel: section.label,
    sourceType: section.sourceType,
    visibility: section.visibility,
  };

  if (
    includesAny(normalized, ["permit", "permitted", "permitting"]) &&
    includesAny(normalized, ["wants", "want", "requires", "required", "needed", "needs", "pull"])
  ) {
    addFact(facts, {
      key: "permit_required",
      label: "Permitted installation",
      value: "Yes, permit requested/required",
      yesNo: true,
      ...base,
    });
  }

  const panelMatch = firstMatch(text, [
    /\b(?:appears?|looks|seems|existing|main|service|panel|msp)[^.\n]{0,80}?\b(100|125|150|200|320|400)\s*(?:a|amp|amps)\b/i,
    /\b(100|125|150|200|320|400)\s*(?:a|amp|amps)\b[^.\n]{0,80}?\b(?:panel|service|msp)\b/i,
  ]);
  if (panelMatch) {
    const amps = `${panelMatch[1]}A`;
    addFact(facts, {
      key: "panel_amperage",
      label: "Main panel amperage",
      value: /appears?|looks|seems/i.test(panelMatch[0]) ? `Appears to be ${amps}` : amps,
      ...base,
    });
  }

  if (includesAny(normalized, ["available breaker", "breaker space", "breaker spaces", "open spaces"])) {
    addFact(facts, {
      key: "breaker_spaces",
      label: "Breaker space availability",
      value: includesAny(normalized, ["unknown", "verify", "confirm", "needed"])
        ? "Needs verification"
        : "Mentioned in saved context",
      ...base,
    });
  }

  if (
    includesAny(normalized, ["load calculation", "load calc"]) &&
    includesAny(normalized, ["needed", "needs", "required", "require", "must", "do load"])
  ) {
    addFact(facts, {
      key: "load_calculation",
      label: "Load calculation",
      value: "Needed/required",
      yesNo: true,
      ...base,
    });
  }

  const locationMatch = firstMatch(text, [
    /\b(?:charger|evse|wall connector)?[^.\n]{0,50}?\b(?:inside|in|mounted in|located in)\s+(?:the\s+)?((?:attached\s+)?garage)\b/i,
    /\b((?:attached\s+)?garage)\b/i,
  ]);
  if (locationMatch) {
    addFact(facts, {
      key: "charger_location",
      label: "Charger location",
      value: locationMatch[1].replace(/\s+/g, " ").trim(),
      ...base,
    });
  }

  const runMatch = firstMatch(text, [
    /\b(?:run|wire run|circuit run|approx(?:imate)? run)[^.\n]{0,40}?(\d{1,3})\s*(?:-|to|–)\s*(\d{1,3})\s*(?:ft|feet|')\b/i,
    /\b(?:run|wire run|circuit run|approx(?:imate)? run)[^.\n]{0,40}?(\d{1,3})\s*(?:ft|feet|')\b/i,
  ]);
  if (runMatch) {
    const value = runMatch[2] ? `${runMatch[1]}-${runMatch[2]} ft` : `${runMatch[1]} ft`;
    const numberValue = runMatch[2]
      ? Math.round((Number(runMatch[1]) + Number(runMatch[2])) / 2)
      : Number(runMatch[1]);
    addFact(facts, {
      key: "run_length",
      label: "Approximate run",
      value,
      numberValue,
      ...base,
    });
  }

  if (includesAny(normalized, ["finished drywall", "drywalled garage", "finished garage"])) {
    addFact(facts, {
      key: "finished_drywall",
      label: "Finished drywall",
      value: "Finished drywall present",
      yesNo: true,
      ...base,
    });
  }

  if (includesAny(normalized, ["clean looking", "clean-looking", "clean install", "concealed", "hide conduit"])) {
    addFact(facts, {
      key: "clean_install",
      label: "Clean-looking install preference",
      value: "Customer wants clean-looking install",
      ...base,
    });
  }

  if (includesAny(normalized, ["outlet troubleshooting", "troubleshoot outlet", "outlet repair"])) {
    addFact(facts, {
      key: "outlet_troubleshooting",
      label: "Outlet troubleshooting",
      value: includesAny(normalized, ["optional", "add on", "add-on"])
        ? "Optional add-on mentioned"
        : "Mentioned in saved context",
      ...base,
    });
  }

  const chargerModelMatch = firstMatch(text, [
    /\b(tesla\s+wall\s+connector|wallbox|chargepoint|emporia|juicebox|grizzl-e)\b/i,
  ]);
  if (chargerModelMatch) {
    addFact(facts, {
      key: "charger_model",
      label: "Charger model",
      value: chargerModelMatch[1].replace(/\s+/g, " ").trim(),
      ...base,
    });
  }

  if (includesAny(normalized, ["customer supplied", "owner supplied", "homeowner supplied", "contractor supplied"])) {
    addFact(facts, {
      key: "charger_supplied_by",
      label: "Charger supplied by",
      value: includesAny(normalized, ["contractor supplied"]) ? "Contractor supplied" : "Customer supplied",
      ...base,
    });
  }

  if (includesAny(normalized, ["smart charger", "wifi setup", "wi fi setup", "wi-fi setup", "app setup"])) {
    addFact(facts, {
      key: "smart_charger_setup",
      label: "Smart charger setup",
      value: "Smart charger setup mentioned",
      ...base,
    });
  }

  return facts;
}

export function extractClarifyScopeKnownFacts(
  sections: readonly QuoteScopeContextSection[],
): ClarifyScopeKnownFact[] {
  return sections.flatMap(extractFactsFromSection);
}

function findFact(facts: readonly Fact[], keys: readonly FactKey[]): Fact | null {
  return facts.find((fact) => keys.includes(fact.key)) ?? null;
}

function answerFromFact(
  question: ClarificationQuestion,
  fact: Fact,
): ClarificationAnswerValue | undefined {
  if (question.inputType === "yes_no_unknown" && fact.yesNo) {
    return { kind: "choice", optionKeys: ["yes"] };
  }
  if (
    (question.inputType === "single_choice" || question.inputType === "multi_choice") &&
    question.options?.length
  ) {
    const normalizedFact = normalizeText(fact.value);
    const option = question.options.find((candidate) => {
      const candidates = [candidate.key, candidate.label, ...(candidate.aliases ?? [])].map(normalizeText);
      return candidates.some(
        (candidateText) =>
          candidateText.length > 0 &&
          (normalizedFact.includes(candidateText) || candidateText.includes(normalizedFact)),
      );
    });
    if (option) {
      return { kind: "choice", optionKeys: [option.key] };
    }
    if (question.allowOther) {
      return { kind: "choice", optionKeys: ["__other__"], otherText: fact.value };
    }
  }
  if (question.inputType === "number" && typeof fact.numberValue === "number") {
    return { kind: "number", value: fact.numberValue, unit: question.unit };
  }
  if (question.inputType === "short_text" || question.inputType === "notes") {
    return { kind: "text", text: fact.value };
  }
  return undefined;
}

function questionText(question: ClarificationQuestion): string {
  return normalizeText(
    [
      question.key,
      question.label,
      question.helpText,
      ...(question.aliases ?? []),
      ...(question.options ?? []).flatMap((option) => [option.key, option.label, ...(option.aliases ?? [])]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function makeReview(
  question: ClarificationQuestion,
  route: ClarifyScopeRoute,
  reason: string,
  fact?: Fact | null,
): ClarifyScopeQuestionReview {
  const prefill = fact ? answerFromFact(question, fact) : undefined;
  return {
    questionKey: question.key,
    route,
    reason,
    sourceLabel: fact?.sourceLabel,
    sourceType: fact?.sourceType,
    prefill,
    prefillLabel: fact?.value,
  };
}

export function reviewClarifyScopeQuestionSet(
  set: Pick<ClarificationQuestionSet, "questions">,
  sections: readonly QuoteScopeContextSection[],
): ClarifyScopeContextReview {
  const facts = sections.flatMap(extractFactsFromSection);
  const hasSmartSetup = Boolean(findFact(facts, ["smart_charger_setup"]));
  const questionReviews = set.questions.map((question) => {
    const text = questionText(question);

    if (includesAny(text, ["wifi", "wi fi", "wi-fi"])) {
      return hasSmartSetup
        ? makeReview(question, "ASK_CUSTOMER", "Wi-Fi is only relevant because smart charger setup is in scope.")
        : makeReview(question, "REMOVE", "Wi-Fi is not needed unless smart charger setup is included or recommended.");
    }

    if (includesAny(text, ["permit", "permitted", "permitting", "ahj"])) {
      const fact = findFact(facts, ["permit_required"]);
      return fact
        ? makeReview(question, "ANSWERED", "Saved context already says a permitted installation is wanted/required.", fact)
        : makeReview(question, "ASK_STAFF", "Permitting is a code/compliance requirement, not a customer preference.");
    }

    if (includesAny(text, ["breaker space", "breaker spaces", "space available", "available spaces"])) {
      const fact = findFact(facts, ["breaker_spaces"]);
      return makeReview(
        question,
        "VERIFY_ONSITE",
        fact
          ? "Breaker-space status is mentioned but should be verified by staff/site visit."
          : "Breaker-space availability should be confirmed by staff/site visit.",
        fact,
      );
    }

    if (includesAny(text, ["load calculation", "load calc", "load calculation required"])) {
      const fact = findFact(facts, ["load_calculation"]);
      return makeReview(
        question,
        "VERIFY_ONSITE",
        fact
          ? "Saved context says load calculation is required; staff should verify/code-check it."
          : "Load calculation is a staff/code verification item, not a customer preference.",
        fact,
      );
    }

    if (
      includesAny(text, ["panel amperage", "panel amp", "main panel", "existing service size", "service size"]) &&
      !includesAny(text, ["new service", "upgrade size"])
    ) {
      const fact = findFact(facts, ["panel_amperage"]);
      return makeReview(
        question,
        "VERIFY_ONSITE",
        fact
          ? "Panel amperage is prefilled from saved context and should be verified."
          : "Panel amperage should be confirmed by staff/site visit.",
        fact,
      );
    }

    if (includesAny(text, ["charger location", "evse location", "install location", "location"])) {
      const fact = findFact(facts, ["charger_location"]);
      if (fact) {
        return makeReview(question, "ANSWERED", "Saved context already gives the charger location.", fact);
      }
    }

    if (includesAny(text, ["run length", "wire run", "circuit run", "distance", "footage"])) {
      const fact = findFact(facts, ["run_length"]);
      if (fact) {
        return makeReview(question, "ANSWERED", "Saved context already gives the approximate run.", fact);
      }
    }

    if (includesAny(text, ["drywall", "conduit", "concealed", "surface mount", "clean install", "clean looking"])) {
      const fact = findFact(facts, ["finished_drywall", "clean_install"]);
      return makeReview(
        question,
        "QUOTE_OPTION",
        fact
          ? "Saved context points to an install-finish choice; price it as a quote option or customer decision."
          : "Install-finish approach affects quote scope/options.",
        fact,
      );
    }

    if (includesAny(text, ["outlet troubleshooting", "outlet troubleshoot", "troubleshooting"])) {
      const fact = findFact(facts, ["outlet_troubleshooting"]);
      return makeReview(
        question,
        "QUOTE_OPTION",
        fact
          ? "Outlet troubleshooting was mentioned as an optional add-on."
          : "Outlet troubleshooting belongs as an optional add-on/customer decision.",
        fact,
      );
    }

    if (includesAny(text, ["charger model", "charger supplied", "supplied by", "customer supplied", "evse model"])) {
      const fact = findFact(facts, ["charger_model", "charger_supplied_by"]);
      return fact
        ? makeReview(question, "ANSWERED", "Saved context already gives charger model/supplied-by detail.", fact)
        : makeReview(question, "ASK_CUSTOMER", "Charger model/supplied-by is a real customer or staff clarification.");
    }

    if (question.customerFacing) {
      return makeReview(question, "ASK_CUSTOMER", "No saved context answer found; customer can reasonably answer this.");
    }
    return makeReview(question, "ASK_STAFF", "No saved context answer found; keep this internal/staff-owned.");
  });

  return { knownFacts: facts, questionReviews };
}

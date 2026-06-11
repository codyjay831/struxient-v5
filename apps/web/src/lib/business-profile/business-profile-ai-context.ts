import {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";
import { type BusinessProfileSnapshot } from "./business-profile-service";

export type BusinessProfileAiOperation =
  | "QUOTE_SCOPE_SUGGESTIONS"
  | "QUOTE_LINE_EXECUTION_PLANNING"
  | "SCOPE_LIBRARY_EXECUTION_PLANNING"
  | "CLARIFICATION_QUESTION_GENERATION";

type BusinessProfileFieldKey =
  | "trades"
  | "workTypes"
  | "customerMarkets"
  | "operatingModel"
  | "teamSize";

const ALLOWLIST_BY_OPERATION: Record<BusinessProfileAiOperation, readonly BusinessProfileFieldKey[]> = {
  QUOTE_SCOPE_SUGGESTIONS: ["trades", "workTypes", "customerMarkets"],
  QUOTE_LINE_EXECUTION_PLANNING: ["trades", "workTypes", "operatingModel"],
  SCOPE_LIBRARY_EXECUTION_PLANNING: ["trades", "workTypes", "operatingModel"],
  CLARIFICATION_QUESTION_GENERATION: ["trades", "workTypes", "customerMarkets", "operatingModel"],
};

export type SelectedBusinessProfileAiContext = {
  provenance: "ORGANIZATION_DEFAULT";
  operation: BusinessProfileAiOperation;
  fields: {
    trades?: BusinessProfileTrade[];
    workTypes?: BusinessProfileWorkType[];
    customerMarkets?: BusinessProfileCustomerMarket[];
    operatingModel?: BusinessProfileOperatingModel;
  };
};

function stripOtherFromEnums<T extends string>(values: readonly T[]): T[] {
  return values.filter((value) => value !== ("OTHER" as T));
}

export function selectBusinessProfileAiContext(
  operation: BusinessProfileAiOperation,
  profile: BusinessProfileSnapshot | null,
): SelectedBusinessProfileAiContext | null {
  if (!profile) return null;

  const allowlist = ALLOWLIST_BY_OPERATION[operation];
  const fields: SelectedBusinessProfileAiContext["fields"] = {};

  if (allowlist.includes("trades")) {
    const trades = stripOtherFromEnums(profile.trades);
    if (trades.length > 0) fields.trades = trades;
  }
  if (allowlist.includes("workTypes")) {
    const workTypes = stripOtherFromEnums(profile.workTypes);
    if (workTypes.length > 0) fields.workTypes = workTypes;
  }
  if (allowlist.includes("customerMarkets")) {
    const customerMarkets = stripOtherFromEnums(profile.customerMarkets);
    if (customerMarkets.length > 0) fields.customerMarkets = customerMarkets;
  }
  if (allowlist.includes("operatingModel") && profile.operatingModel) {
    fields.operatingModel = profile.operatingModel;
  }

  if (Object.keys(fields).length === 0) {
    return null;
  }

  return {
    provenance: "ORGANIZATION_DEFAULT",
    operation,
    fields,
  };
}

function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderBusinessProfileAiContextSection(
  selected: SelectedBusinessProfileAiContext | null,
): string | null {
  if (!selected) return null;

  const lines: string[] = [];
  if (selected.fields.trades?.length) {
    lines.push(`- Trades: ${selected.fields.trades.map(formatEnumLabel).join(", ")}`);
  }
  if (selected.fields.workTypes?.length) {
    lines.push(`- Work types: ${selected.fields.workTypes.map(formatEnumLabel).join(", ")}`);
  }
  if (selected.fields.customerMarkets?.length) {
    lines.push(
      `- Customer markets: ${selected.fields.customerMarkets.map(formatEnumLabel).join(", ")}`,
    );
  }
  if (selected.fields.operatingModel) {
    lines.push(`- Operating model: ${formatEnumLabel(selected.fields.operatingModel)}`);
  }

  if (lines.length === 0) return null;

  return [
    "ORGANIZATION PROFILE CONTEXT (organization defaults, lower priority than quote/job facts):",
    `[provenance: ${selected.provenance}]`,
    ...lines,
    "Use this context only for terminology and relevance. It does not prove that any task, dependency, worker type, permit, inspection, payment, or scope item applies to the current job.",
  ].join("\n");
}

export function appendBusinessProfileContext(
  baseContext: string | undefined,
  selected: SelectedBusinessProfileAiContext | null,
): string | undefined {
  const section = renderBusinessProfileAiContextSection(selected);
  if (!section) {
    return baseContext;
  }
  const base = baseContext?.trim();
  if (!base) {
    return section;
  }
  return `${base}\n\n---\n\n${section}`;
}


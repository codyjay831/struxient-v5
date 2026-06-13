import { createHash } from "node:crypto";
import type { QuotePlanCriticalContext } from "@/lib/quote-plan/quote-plan-context";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function computeQuotePlanningInputHash(
  planningInput: QuotePlanCriticalContext,
  schemaVersion: number,
): string {
  const canonical = stableStringify({
    schemaVersion,
    planningInput,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function quotePlanIsStale(params: {
  acceptedPlanningInputHash: string | null;
  currentPlanningInputHash: string;
}): boolean {
  if (!params.acceptedPlanningInputHash) return true;
  return params.acceptedPlanningInputHash !== params.currentPlanningInputHash;
}


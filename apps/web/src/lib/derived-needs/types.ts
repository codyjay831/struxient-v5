import type { ScopeFactConfidence } from "@/lib/scope-facts/scope-facts";

export type DerivedNeedCategory =
  | "material"
  | "equipment"
  | "tool"
  | "labor_note"
  | "review_warning";

export type DerivedNeed = {
  sourceQuoteLineItemId: string;
  sourceQuestionSetKey: string;
  category: DerivedNeedCategory;
  name: string;
  unit: string;
  quantity: number;
  confidence: ScopeFactConfidence;
  costCents?: number;
  orderNote?: string;
};

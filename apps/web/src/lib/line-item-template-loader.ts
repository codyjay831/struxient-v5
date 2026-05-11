import "server-only";
import { db } from "@/lib/db";
import { computeLineTotalCents } from "@/lib/quote-money";
export type { LineItemTemplatePickerRow } from "./line-item-template-display";
import type { LineItemTemplatePickerRow } from "./line-item-template-display";

export async function loadAvailableLineItemTemplates(
  orgId: string,
): Promise<LineItemTemplatePickerRow[]> {
  const rows = await db.lineItemTemplate.findMany({
    where: { organizationId: orgId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      description: true,
      defaultQuantity: true,
      defaultUnitAmountCents: true,
      defaultCustomerScopeTitle: true,
      defaultCustomerScopeDescription: true,
      defaultCustomerIncludedNotes: true,
      defaultCustomerExcludedNotes: true,
      defaultCustomerPresentationGroup: true,
      priceBufferPercentage: true,
      tags: true,
    },
  });

  return rows.map((t) => {
    const lineTotal = computeLineTotalCents(t.defaultQuantity, t.defaultUnitAmountCents);
    return {
    id: t.id,
    description: t.description,
    defaultQuantityDisplay: t.defaultQuantity.toString(),
    defaultUnitAmountCents: t.defaultUnitAmountCents,
    defaultLineTotalCents: lineTotal.ok ? lineTotal.lineTotalCents : 0,
    hasCustomerProposalDefaults: Boolean(
      t.defaultCustomerScopeTitle ||
        t.defaultCustomerScopeDescription ||
        t.defaultCustomerIncludedNotes ||
        t.defaultCustomerExcludedNotes ||
        t.defaultCustomerPresentationGroup,
    ),
    priceBufferPercentage: t.priceBufferPercentage,
    tags: t.tags,
  };
  });
}

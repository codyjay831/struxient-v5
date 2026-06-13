import type { Prisma } from "@prisma/client";
import { ChangeOrderLineOperation } from "@prisma/client";
import {
  buildCustomerChangeOrderDocument,
  type ChangeOrderCustomerPreviewDocument,
} from "@/lib/change-order-customer-projection";

export const CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION = 1;

export type ChangeOrderCheckpointSnapshotWire = {
  document: ChangeOrderCustomerPreviewDocument;
};

export type ChangeOrderCheckpointStaffOnlyWire = {
  acceptedByName?: string;
  recipients?: { email: string; name?: string }[];
  customMessage?: string;
};

export const changeOrderSelectForCustomerCheckpoint = {
  id: true,
  organizationId: true,
  quoteId: true,
  status: true,
  priceDeltaCents: true,
  number: true,
  title: true,
  customerDocumentTitle: true,
  reasoning: true,
  updatedAt: true,
  quote: {
    select: {
      id: true,
      title: true,
      totalCents: true,
      paymentSchedule: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          id: true,
          title: true,
          amountCents: true,
          anchorType: true,
          anchorStage: { select: { name: true } },
        },
      },
    },
  },
  lines: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      operation: true,
      description: true,
      quantity: true,
      unitPriceCents: true,
      priceDeltaCents: true,
      sourceJobScopeItem: {
        select: {
          description: true,
          quantity: true,
          unitPriceCents: true,
        },
      },
    },
  },
} satisfies Prisma.ChangeOrderSelect;

type ChangeOrderCheckpointSelectRow = Prisma.ChangeOrderGetPayload<{
  select: typeof changeOrderSelectForCustomerCheckpoint;
}>;

export function changeOrderRowToCustomerPreviewDocument(
  row: ChangeOrderCheckpointSelectRow,
  organizationDisplayName: string,
): ChangeOrderCustomerPreviewDocument {
  const { document } = buildCustomerChangeOrderDocument(
    {
      quoteTitle: row.quote.title,
      quoteTotalCents: row.quote.totalCents,
      updatedAt: row.updatedAt,
      changeOrderNumber: row.number,
      changeOrderTitle: row.title,
      customerDocumentTitle: row.customerDocumentTitle,
      reasoning: row.reasoning,
      lines: row.lines.map((line) => ({
        id: line.id,
        operation: line.operation as ChangeOrderLineOperation,
        description: line.description,
        quantity: line.quantity.toString(),
        unitPriceCents: line.unitPriceCents,
        priceDeltaCents: line.priceDeltaCents,
        sourceJobScopeItem: line.sourceJobScopeItem
          ? {
              description: line.sourceJobScopeItem.description,
              quantity: line.sourceJobScopeItem.quantity.toString(),
              unitPriceCents: line.sourceJobScopeItem.unitPriceCents,
            }
          : null,
      })),
      paymentSchedule: row.quote.paymentSchedule.map((item) => ({
        id: item.id,
        title: item.title,
        amountCents: item.amountCents,
        anchorType: item.anchorType,
        anchorStageName: item.anchorStage?.name ?? null,
      })),
    },
    { organizationDisplayName },
  );
  return document;
}

export function serializeChangeOrderPreviewDocumentForCheckpoint(
  document: ChangeOrderCustomerPreviewDocument,
): ChangeOrderCheckpointSnapshotWire {
  return { document };
}

export function parseChangeOrderCheckpointSnapshot(snapshotJson: unknown): ChangeOrderCheckpointSnapshotWire | null {
  if (!snapshotJson || typeof snapshotJson !== "object") return null;
  const wire = snapshotJson as ChangeOrderCheckpointSnapshotWire;
  if (!wire.document || typeof wire.document !== "object") return null;
  return wire;
}

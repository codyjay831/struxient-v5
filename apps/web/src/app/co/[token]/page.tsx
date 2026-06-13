import { notFound } from "next/navigation";
import { ChangeOrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ChangeOrderPublicPreview } from "@/components/jobs/change-order-public-preview";
import { changeOrderRowToCustomerPreviewDocument } from "@/lib/change-order-checkpoint-snapshot";
import { recordChangeOrderViewAction } from "./change-order-share-actions";

export const dynamic = "force-dynamic";

export default async function PublicChangeOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const shareToken = await db.changeOrderShareToken.findUnique({
    where: { token },
    include: {
      changeOrder: {
        select: {
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
                orderBy: { sortOrder: "asc" },
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
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
          organization: { select: { name: true } },
        },
      },
    },
  });

  if (!shareToken || shareToken.revokedAt || (shareToken.expiresAt && shareToken.expiresAt < new Date())) {
    notFound();
  }

  void recordChangeOrderViewAction(token);

  const document = changeOrderRowToCustomerPreviewDocument(
    shareToken.changeOrder,
    shareToken.changeOrder.organization.name,
  );

  return (
    <main className="min-h-screen bg-background">
      <ChangeOrderPublicPreview
        token={token}
        document={document}
        isAccepted={shareToken.changeOrder.status === ChangeOrderStatus.ACCEPTED}
      />
    </main>
  );
}

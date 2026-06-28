import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChangeOrderPublicPreview } from "@/components/jobs/change-order-public-preview";
import { changeOrderRowToCustomerPreviewDocument } from "@/lib/change-order-checkpoint-snapshot";
import {
  deriveChangeOrderCustomerAcceptReadiness,
  deriveChangeOrderCustomerPortalActions,
} from "@/lib/change-order/change-order-customer-accept-readiness";
import { recordChangeOrderViewAction } from "./change-order-share-actions";
import { resolveChangeOrderShareToken } from "@/lib/public-access/public-token-service";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicChangeOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const { token } = await params;

  const resolved = await resolveChangeOrderShareToken(token);
  const shareToken = await db.changeOrderShareToken.findFirst({
    where: { id: resolved?.id ?? "" },
    include: {
      changeOrder: {
        select: {
          id: true,
          organizationId: true,
          quoteId: true,
          status: true,
          priceDeltaCents: true,
          zeroDollarPolicyClass: true,
          number: true,
          title: true,
          customerDocumentTitle: true,
          reasoning: true,
          updatedAt: true,
          paymentImpactJson: true,
          executionDeltaJson: true,
          baseJobPlanVersion: true,
          job: {
            select: {
              jobPlanVersion: true,
              scopeItems: {
                select: { id: true, executionRelevant: true, status: true },
              },
              tasks: {
                select: {
                  id: true,
                  status: true,
                  hardSignal: true,
                  requiresSignals: true,
                  providesSignals: true,
                  scopes: { select: { jobScopeItemId: true } },
                },
              },
            },
          },
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

  const acceptReadiness = deriveChangeOrderCustomerAcceptReadiness({
    status: shareToken.changeOrder.status,
    priceDeltaCents: shareToken.changeOrder.priceDeltaCents,
    zeroDollarPolicyClass: shareToken.changeOrder.zeroDollarPolicyClass,
    paymentImpactJson: shareToken.changeOrder.paymentImpactJson,
    executionDeltaJson: shareToken.changeOrder.executionDeltaJson,
    baseJobPlanVersion: shareToken.changeOrder.baseJobPlanVersion,
    currentJobPlanVersion: shareToken.changeOrder.job.jobPlanVersion,
    scopeItems: shareToken.changeOrder.job.scopeItems,
    tasks: shareToken.changeOrder.job.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
  });
  const portalActions = deriveChangeOrderCustomerPortalActions({
    status: shareToken.changeOrder.status,
    acceptReadiness,
  });

  return (
    <main className="min-h-screen bg-background">
      <ChangeOrderPublicPreview
        token={token}
        document={document}
        status={shareToken.changeOrder.status}
        portalActions={portalActions}
      />
    </main>
  );
}

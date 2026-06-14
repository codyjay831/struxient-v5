import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { QuotePublicPreview } from "@/components/quotes/quote-public-preview";
import {
  quoteRowToCustomerPreviewInput,
} from "@/lib/quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import { recordQuoteViewAction } from "./quote-share-actions";
import { QuoteStatus } from "@prisma/client";
import { resolveQuoteShareToken } from "@/lib/public-access/public-token-service";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const { token } = await params;

  const resolved = await resolveQuoteShareToken(token);
  const shareToken = await db.quoteShareToken.findFirst({
    where: { id: resolved?.id ?? "" },
    include: {
      quote: {
        include: {
          organization: { select: { name: true } },
          customer: { select: { displayName: true, organizationId: true } },
          lead: { select: { contact: true, request: true, organizationId: true } },
          paymentSchedule: {
            orderBy: { sortOrder: "asc" },
            include: { anchorStage: { select: { name: true } } },
          },
          lineItems: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!shareToken || shareToken.revokedAt || (shareToken.expiresAt && shareToken.expiresAt < new Date())) {
    notFound();
  }

  const quote = shareToken.quote;
  
  // Record view (non-blocking)
  void recordQuoteViewAction(token);

  const input = quoteRowToCustomerPreviewInput(quote, quote.organizationId);
  const { document } = buildCustomerQuotePreviewDocument(input, {
    organizationDisplayName: quote.organization.name,
  });

  return (
    <main className="min-h-screen bg-background">
      <QuotePublicPreview
        token={token}
        document={document}
        isApproved={quote.status === QuoteStatus.APPROVED}
      />
    </main>
  );
}

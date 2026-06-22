import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { QuoteSignerReview } from "@/components/quotes/quote-signer-review";
import {
  loadSignerPageData,
  recordSignerViewAction,
} from "./signature-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  robots: { index: false, follow: false },
};

function InvalidTokenPage({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-foreground-muted">{message}</p>
      </div>
    </main>
  );
}

export default async function SignerQuotePage({
  params,
}: {
  params: Promise<{ recipientToken: string }>;
}) {
  noStore();
  const { recipientToken } = await params;
  void recordSignerViewAction(recipientToken);

  const data = await loadSignerPageData(recipientToken);
  if (data.kind === "invalid") notFound();
  if (data.kind === "expired") {
    return (
      <InvalidTokenPage
        title="Link expired"
        message="This signing link has expired. Contact the company for a new link."
      />
    );
  }
  if (data.kind === "revoked") {
    return (
      <InvalidTokenPage
        title="Link revoked"
        message="This signing link is no longer valid."
      />
    );
  }
  if (data.kind === "accepted") {
    if (!("document" in data) || !data.document) notFound();
    return (
      <main className="min-h-screen bg-background">
        <QuoteSignerReview
          recipientToken={recipientToken}
          document={data.document}
          isApproved
          recipientName={null}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <QuoteSignerReview
        recipientToken={recipientToken}
        document={data.document}
        isApproved={data.isApproved}
        recipientName={data.recipientName}
      />
    </main>
  );
}

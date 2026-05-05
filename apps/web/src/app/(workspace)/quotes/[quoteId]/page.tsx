import { QuoteWorkspaceShell } from "@/components/shells/quote-workspace-shell";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <QuoteWorkspaceShell mode="detail" quoteId={quoteId} />;
}

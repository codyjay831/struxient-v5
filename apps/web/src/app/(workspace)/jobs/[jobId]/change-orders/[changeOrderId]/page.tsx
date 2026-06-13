import { redirect } from "next/navigation";

export default async function JobChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ jobId: string; changeOrderId: string }>;
}) {
  const { jobId, changeOrderId } = await params;
  redirect(`/jobs/${jobId}/change-orders?focus=${changeOrderId}`);
}

import { redirect } from "next/navigation";
import { completeBillingReturnAction } from "../actions";

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session_id?.trim();
  if (!sessionId) {
    redirect("/onboarding/billing?error=missing_session");
  }

  await completeBillingReturnAction(sessionId);
}

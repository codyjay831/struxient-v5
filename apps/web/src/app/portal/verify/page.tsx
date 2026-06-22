import { notFound, redirect } from "next/navigation";
import { verifyPortalMagicLinkAndStartSession } from "@/lib/customer-portal/verify-service";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PortalVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    notFound();
  }

  const result = await verifyPortalMagicLinkAndStartSession(token);
  if (!result.ok) {
    notFound();
  }

  redirect(`/portal/project/${result.accessId}`);
}

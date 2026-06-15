import { PageHeader } from "@/components/ui/page-header";
import { getPlatformContext } from "@/lib/platform/platform-context";
import {
  listPlatformBetaGrants,
  listPlatformBetaInvites,
} from "@/lib/platform/platform-beta-access";
import { BetaAccessClient } from "./beta-access-client";

export const dynamic = "force-dynamic";

export default async function PlatformBetaAccessPage() {
  const ctx = await getPlatformContext();
  const [invites, grants] = await Promise.all([
    listPlatformBetaInvites(ctx, { page: 1, pageSize: 50 }),
    listPlatformBetaGrants(ctx, { page: 1, pageSize: 50 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Platform Operations"
        title="Beta access"
        description="Create private beta signup links and manage temporary no-payment access."
      />
      <BetaAccessClient invites={invites.items} grants={grants.items} />
    </div>
  );
}

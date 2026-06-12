import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { SettingsPageClient } from "@/components/settings/settings-page-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getRequestContextOrThrow();
  const [workstationSettings, publicRequestSettings] = await Promise.all([
    db.workstationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: {
        showQuickActions: true,
        urgentThresholdHours: true,
      },
    }),
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { enabled: true },
    }),
  ]);

  return (
    <SettingsPageClient
      initialShowQuickActions={workstationSettings?.showQuickActions ?? true}
      initialUrgentThresholdHours={workstationSettings?.urgentThresholdHours ?? 24}
      initialPublicRequestEnabled={publicRequestSettings?.enabled ?? true}
      includeAppearance
    />
  );
}

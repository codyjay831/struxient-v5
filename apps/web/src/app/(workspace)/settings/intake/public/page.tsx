import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { resolvePublicRequestSettingsEditorInitial } from "@/lib/public-request-settings-effective";
import { PublicRequestSettingsForm } from "./public-request-settings-form";

export const dynamic = "force-dynamic";

export default async function PublicIntakeSettingsPage() {
  const ctx = await getRequestContextOrThrow();
  const row = await db.publicRequestSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: {
      enabled: true,
      formTitle: true,
      introMessage: true,
      emergencyWarningText: true,
      submitButtonText: true,
      instantQuoteEnabled: true,
      showInstantQuoteDetails: true,
      offerings: true,
      updatedAt: true,
    },
  });

  const editorInitial = resolvePublicRequestSettingsEditorInitial(row);
  const { formKey, ...initial } = editorInitial;

  return <PublicRequestSettingsForm key={formKey} initial={initial} />;
}

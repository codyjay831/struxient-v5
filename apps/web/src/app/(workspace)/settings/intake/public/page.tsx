import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import {
  PublicRequestSettingsForm,
  type PublicRequestSettingsFormInitial,
} from "./public-request-settings-form";
import { CustomerIntakeModuleNav } from "@/components/settings/customer-intake-module-nav";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";

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
    },
  });

  const introFieldValue = !row ? DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE : (row.introMessage ?? "");

  const initial: PublicRequestSettingsFormInitial = {
    enabled: row?.enabled ?? true,
    formTitle: row?.formTitle ?? DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
    introMessage: introFieldValue,
    emergencyWarningText: row?.emergencyWarningText ?? "",
    submitButtonText: row?.submitButtonText ?? DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
    instantQuoteEnabled: row?.instantQuoteEnabled ?? true,
    showInstantQuoteDetails: row?.showInstantQuoteDetails ?? true,
    offerings: row?.offerings ?? [],
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Customer request page"
        description="Control whether your public request link is live and how the customer-facing page reads."
      />
      <CustomerIntakeModuleNav className="mb-6" />

      <WorkspacePanel>
        <PublicRequestSettingsForm initial={initial} />
      </WorkspacePanel>
    </div>
  );
}

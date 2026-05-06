import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { db, getDevOrganizationOrThrow } from "@/lib/db";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { parseStoredRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";
import {
  PublicRequestSettingsForm,
  type PublicRequestSettingsFormInitial,
} from "./public-request-settings-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function PublicRequestSettingsPage() {
  const org = await getDevOrganizationOrThrow();
  const row = await db.publicRequestSettings.findUnique({
    where: { organizationId: org.id },
  });

  const introFieldValue = !row
    ? DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE
    : (row.introMessage ?? "");

  const initial: PublicRequestSettingsFormInitial = {
    enabled: row?.enabled ?? true,
    formTitle: row?.formTitle ?? DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
    introMessage: introFieldValue,
    emergencyWarningText: row?.emergencyWarningText ?? "",
    submitButtonText: row?.submitButtonText ?? DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
    requestTypes: parseStoredRequestTypeOptionsJson(row?.requestTypeOptionsJson),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Leads", href: "/leads" },
          { label: "Public Request Settings" },
        ]}
      />
      <PageHeader
        title="Public Request Settings"
        description="Configure your Public Request Link and Public Intake Form copy. These settings apply to the public-facing intake surface for this organization."
        actions={
          <Link href="/leads" className={listLinkClass}>
            ← Back to Leads
          </Link>
        }
      />

      <WorkspacePanel>
        <PublicRequestSettingsForm initial={initial} />
      </WorkspacePanel>
    </div>
  );
}

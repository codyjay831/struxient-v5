import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
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
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
  INTAKE_SETTINGS_HUB_PATH,
} from "@/lib/intake-settings-hierarchy";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const cardLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

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
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Public page" },
        ]}
      />
      <CustomerIntakeModuleNav />
      <PageHeader
        title="Public page"
        description="Control whether customer intake is live and how the public request page looks around your intake fields."
        actions={
          <Link href={INTAKE_SETTINGS_HUB_PATH} className={listLinkClass}>
            ← Overview
          </Link>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          This page controls the customer-facing wrapper — title, intro, warning, submit button,
          and whether intake is accepting requests. Intake questions and service lines are edited
          under{" "}
          <Link href={INTAKE_CUSTOMER_FIELDS_PATH} className="text-accent hover:underline">
            customer fields
          </Link>
          .
        </p>
        <div className="mt-3">
          <Link href={INTAKE_CUSTOMER_FIELDS_PATH} className={cardLinkClass}>
            Edit customer fields
          </Link>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <PublicRequestSettingsForm initial={initial} />
      </WorkspacePanel>
    </div>
  );
}

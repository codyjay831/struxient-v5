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
import { PublicRequestLinkPanel } from "@/components/leads/public-request-link-panel";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";
import { PUBLIC_INTAKE_FORM_WHERE } from "@/lib/intake/intake-form-surface";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const cardLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export default async function PublicRequestSettingsPage() {
  const ctx = await getRequestContextOrThrow();
  const [row, organization, defaultPublicForm] = await Promise.all([
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true },
    }),
    db.intakeFormDefinition.findFirst({
      where: {
        organizationId: ctx.organizationId,
        archivedAt: null,
        ...PUBLIC_INTAKE_FORM_WHERE,
        isDefault: true,
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

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
          { label: "Public page copy & availability" },
        ]}
      />
      <PageHeader
        title="Public page copy & availability"
        description="Control whether customer intake is live and how the public request page looks around your intake fields."
        actions={
          <Link href={INTAKE_SETTINGS_HUB_PATH} className={listLinkClass}>
            ← Customer intake
          </Link>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          This page controls the customer-facing wrapper — title, intro, warning, submit button,
          and whether intake is accepting requests. Intake questions and service lines are edited
          under{" "}
          {defaultPublicForm ? (
            <Link
              href={`/settings/intake-forms/${defaultPublicForm.id}`}
              className="text-accent hover:underline"
            >
              default customer intake fields
            </Link>
          ) : (
            <span className="font-medium text-foreground">default customer intake fields</span>
          )}
          .
        </p>
        {defaultPublicForm ? (
          <div className="mt-3">
            <Link href={`/settings/intake-forms/${defaultPublicForm.id}`} className={cardLinkClass}>
              Edit customer intake fields
            </Link>
          </div>
        ) : null}
      </WorkspacePanel>

      <PublicRequestLinkPanel
        organizationName={organization?.name ?? "your organization"}
        slug={organization?.slug ?? null}
        baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
        publicRequestLive={row?.enabled ?? true}
        className="mb-6"
      />

      <WorkspacePanel>
        <PublicRequestSettingsForm initial={initial} />
      </WorkspacePanel>
    </div>
  );
}

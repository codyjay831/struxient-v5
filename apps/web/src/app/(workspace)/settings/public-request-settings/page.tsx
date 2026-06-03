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

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function PublicRequestSettingsPage() {
  const ctx = await getRequestContextOrThrow();
  const [row, organization] = await Promise.all([
    db.publicRequestSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const introFieldValue = !row
    ? DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE
    : (row.introMessage ?? "");

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
          { label: "Customer intake", href: "/settings/intake" },
          { label: "Public request page settings" },
        ]}
      />
      <PageHeader
        title="Customer request page settings"
        description="Control whether customers can submit requests, plus the page title/copy shown on your default request link. Advanced fields and request options stay in form editing."
        actions={
          <Link href="/settings/intake" className={listLinkClass}>
            ← Customer intake
          </Link>
        }
      />

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

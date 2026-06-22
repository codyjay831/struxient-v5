import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";
import { IntakeFormEditorPage } from "../_lib/intake-form-editor-page";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function StaffIntakeFieldsPage() {
  const ctx = await getRequestContextOrThrow();
  const bundle = await getOfficeIntakeFormBundle(ctx.organizationId);
  const form = bundle.formDefinition;
  const isProvisioned = !isSyntheticDefaultOfficeIntakeFormDefinitionId(form.id);

  if (!isProvisioned) {
    return (
      <div className="mx-auto max-w-3xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
            { label: "Staff intake fields" },
          ]}
        />
        <PageHeader
          title="Staff intake fields"
          description="Staff-only form at /leads/new for phone, email, walk-in, and referral leads."
          actions={
            <Link href={INTAKE_SETTINGS_HUB_PATH} className={listLinkClass}>
              ← Customer intake
            </Link>
          }
        />
        <WorkspacePanel>
          <p className="text-sm text-foreground-muted">
            Open{" "}
            <Link href="/leads/new" className="text-accent hover:underline">
              New intake
            </Link>{" "}
            once to provision the stored internal form, then return here to edit fields.
          </p>
        </WorkspacePanel>
      </div>
    );
  }

  return (
    <IntakeFormEditorPage formId={form.id} breadcrumbLeafOverride="Staff intake fields" />
  );
}

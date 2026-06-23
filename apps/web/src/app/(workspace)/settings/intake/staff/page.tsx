import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";
import { IntakeFormEditorPage } from "../_lib/intake-form-editor-page";
import { STAFF_INTAKE_HEADER_ACTIONS_PORTAL_ID } from "../intake-settings-layout-client";

export const dynamic = "force-dynamic";

export default async function StaffIntakeFieldsPage() {
  const ctx = await getRequestContextOrThrow();
  const bundle = await getOfficeIntakeFormBundle(ctx.organizationId);
  const form = bundle.formDefinition;
  const isProvisioned = !isSyntheticDefaultOfficeIntakeFormDefinitionId(form.id);

  if (!isProvisioned) {
    return (
      <>
        <PageHeader
          variant="settingsCompact"
          title="Staff intake"
          description="Internal form for phone, walk-in, and referral leads."
        />
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm text-foreground-muted">
            Open{" "}
            <Link href="/leads/new" className="text-accent hover:underline">
              New lead
            </Link>{" "}
            once to provision the stored internal form, then return here to edit fields.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        variant="settingsCompact"
        title="Staff intake"
        description="Internal form for phone, walk-in, and referral leads."
        actions={
          <div
            id={STAFF_INTAKE_HEADER_ACTIONS_PORTAL_ID}
            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
          />
        }
      />
      <IntakeFormEditorPage
        formId={form.id}
        editorShellHeight="calc(100dvh - 12rem)"
      />
    </>
  );
}

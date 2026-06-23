import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";
import { IntakeFormEditorPage } from "../_lib/intake-form-editor-page";

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
          title="Staff intake"
          description="Internal form for phone, walk-in, email, and referral leads."
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

  return <IntakeFormEditorPage formId={form.id} />;
}

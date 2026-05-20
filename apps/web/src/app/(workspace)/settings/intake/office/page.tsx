import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getOfficeIntakeFormBundle } from "@/lib/intake/load-office-intake-form";
import { INTAKE_SETTINGS_HUB_PATH } from "@/lib/intake-settings-hierarchy";
import { isSyntheticDefaultOfficeIntakeFormDefinitionId } from "@/lib/intake/default-office-intake-form";

export const dynamic = "force-dynamic";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const cardLinkClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export default async function OfficeIntakeSettingsPage() {
  const ctx = await getRequestContextOrThrow();
  const bundle = await getOfficeIntakeFormBundle(ctx.organizationId);
  const form = bundle.formDefinition;
  const isProvisioned = !isSyntheticDefaultOfficeIntakeFormDefinitionId(form.id);
  const editorHref = isProvisioned
    ? `/settings/intake-forms/${form.id}`
    : INTAKE_SETTINGS_HUB_PATH;

  return (
    <div className="mx-auto max-w-3xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Office intake form" },
        ]}
      />
      <PageHeader
        title="Office intake form"
        description="Field layout for /leads/new. Independent from public customer request forms."
        actions={
          <Link href={INTAKE_SETTINGS_HUB_PATH} className={listLinkClass}>
            ← Customer intake
          </Link>
        }
      />

      <WorkspacePanel>
        <SectionHeading
          title="Default office form"
          description="MANUAL channel, not public. Customers never see this form."
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label="Office surface" tone="approved" />
          <span className="text-xs text-foreground-muted">
            {form.name} · slug {form.slug}
          </span>
        </div>
        <p className="mt-3 text-sm text-foreground-muted">
          Sections: {form.schema.sections.map((s) => s.title).join(" → ")}. Request type options
          for staff can be extended later via form triage rules; defaults apply until then.
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Internal details on the new-lead page (source channel, internal note, template helper) are
          not part of this schema.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {isProvisioned ? (
            <Link href={editorHref} className={cardLinkClass}>
              Edit form fields
            </Link>
          ) : (
            <p className="text-sm text-foreground-muted">
              Open <Link href="/leads/new" className="text-accent hover:underline">New intake</Link>{" "}
              once to provision the stored form, then return here to edit fields.
            </p>
          )}
          <Link href="/leads/new" className={listLinkClass}>
            Preview on new intake
          </Link>
        </div>
      </WorkspacePanel>
    </div>
  );
}

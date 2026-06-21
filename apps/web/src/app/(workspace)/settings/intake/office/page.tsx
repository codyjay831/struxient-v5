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
  const editorHref = isProvisioned ? `/settings/intake-forms/${form.id}` : INTAKE_SETTINGS_HUB_PATH;

  return (
    <div className="mx-auto max-w-3xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Default internal intake" },
        ]}
      />
      <PageHeader
        title="Default internal intake"
        description="Staff-only intake at /leads/new for phone, email, walk-in, and referral leads. Customers never see this surface."
        actions={
          <Link href={INTAKE_SETTINGS_HUB_PATH} className={listLinkClass}>
            ← Customer intake
          </Link>
        }
      />

      <WorkspacePanel>
        <SectionHeading
          title="Internal intake form"
          description="Field layout for New intake. Independent from public customer request forms."
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge label="Staff only" tone="approved" />
          <StatusBadge label="Always on" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            {form.name} · slug {form.slug}
          </span>
        </div>
        <p className="mt-3 text-sm text-foreground-muted">
          Sections: {form.schema.sections.map((s) => s.title).join(" → ")}.
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          Source channel, internal notes, and template helper on the new-lead page stay outside this
          form schema.
        </p>
        {!isProvisioned ? (
          <p className="mt-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
            Open{" "}
            <Link href="/leads/new" className="text-accent hover:underline">
              New intake
            </Link>{" "}
            once to provision the stored internal form, then return here to edit fields.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {isProvisioned ? (
            <Link href={editorHref} className={cardLinkClass}>
              Edit internal intake fields
            </Link>
          ) : null}
          <Link href="/leads/new" className={listLinkClass}>
            Preview on New intake
          </Link>
        </div>
      </WorkspacePanel>
    </div>
  );
}

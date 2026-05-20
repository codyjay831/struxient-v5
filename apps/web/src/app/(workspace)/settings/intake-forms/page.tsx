import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import Link from "next/link";
import { Plus, Settings2, Globe, Lock, ExternalLink } from "lucide-react";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";

import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

export default async function IntakeFormsPage() {
  const ctx = await getRequestContextOrThrow();

  const [forms, organization] = await Promise.all([
    db.intakeFormDefinition.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { slug: true },
    }),
  ]);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: "/settings/intake" },
          { label: "Custom forms" },
        ]}
      />
      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-sm text-foreground-muted">
          <span className="font-medium text-foreground">Advanced.</span> Most organizations only
          need the default public intake and{" "}
          <a href="/settings/intake" className="text-accent hover:underline">
            customer intake settings
          </a>
          . Custom forms change field layout and public slugs — not required for Lead Review or quote
          handoff.
        </p>
      </WorkspacePanel>
      <PageHeader
        title="Custom intake forms"
        description="Optional alternate public forms. Default intake on your main request link does not require a custom form."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/settings/intake"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
            >
              ← Customer intake
            </Link>
            <Link
              href="/settings/intake-forms/new"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              <Plus className="mr-2 size-4" />
              Create Form
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {forms.map((form) => (
          <div
            key={form.id}
            className="group relative rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-2 rounded-lg ${form.isPublic ? 'bg-success/10 text-success' : 'bg-foreground/5 text-foreground-subtle'}`}>
                {form.isPublic ? <Globe className="size-5" /> : <Lock className="size-5" />}
              </div>
              {form.isDefault && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-accent">
                  Default
                </span>
              )}
            </div>
            
            <h3 className="font-bold text-foreground group-hover:text-accent transition-colors">
              {form.name}
            </h3>
            
            {form.isPublic && organization?.slug ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-[0.65rem] font-mono text-foreground-subtle truncate">
                  <ExternalLink className="size-3" />
                  {buildPublicIntakeUrl({ 
                    companySlug: organization.slug, 
                    formSlug: form.slug 
                  })}
                </div>
                {baseUrl && (
                  <CopyPublicRequestUrlButton 
                    url={buildPublicIntakeUrl({ 
                      baseUrl, 
                      companySlug: organization.slug, 
                      formSlug: form.slug 
                    })} 
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-foreground-subtle mt-1 font-mono">
                /{form.slug}
              </p>
            )}
            
            <div className="mt-6 flex items-center justify-between pt-4 border-t border-border">
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                {form.channel}
              </span>
              <Link
                href={`/settings/intake-forms/${form.id}`}
                className="inline-flex items-center text-xs font-bold text-accent hover:underline"
              >
                <Settings2 className="mr-1.5 size-3" />
                Configure
              </Link>
            </div>
          </div>
        ))}

        {forms.length === 0 && (
          <div className="col-span-full py-20 text-center rounded-xl border-2 border-dashed border-border bg-foreground/[0.01]">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground/5 text-foreground-subtle mb-4">
              <Plus className="size-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">No intake forms yet</h3>
            <p className="text-xs text-foreground-muted mt-1 max-w-[200px] mx-auto">
              Create your first form to start capturing leads from your website.
            </p>
            <Link
              href="/settings/intake-forms/new"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

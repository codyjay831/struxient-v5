"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createIntakeFormAction } from "../../intake-form-actions";
import { Loader2, Sparkles } from "lucide-react";
import { TradeTemplatePicker } from "@/components/intake/trade-template-picker";
import { TRADE_STARTERS } from "@/lib/intake/trade-starters";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import {
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_PATH,
} from "@/lib/intake-settings-hierarchy";
import { CustomerIntakeModuleNav } from "@/components/settings/customer-intake-module-nav";

type TradeStarter = (typeof TRADE_STARTERS)[number];

function resolveStarterTemplate(starterSlug: string | null): TradeStarter | null {
  if (!starterSlug) return null;
  return TRADE_STARTERS.find((s) => s.slug === starterSlug) ?? null;
}

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

export default function NewSpecializedIntakeFormPage() {
  const searchParams = useSearchParams();
  const initialTemplate = resolveStarterTemplate(searchParams.get("starter"));
  const [state, formAction, isPending] = useActionState(createIntakeFormAction, {});
  const [selectedTemplate, setSelectedTemplate] = useState<TradeStarter | null>(initialTemplate);
  const [nameValue, setNameValue] = useState(initialTemplate?.name ?? "");
  const [slugValue, setSlugValue] = useState(initialTemplate?.slug ?? "");

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Customer intake", href: INTAKE_SETTINGS_HUB_PATH },
          { label: "Specialized request links", href: INTAKE_SPECIALIZED_PATH },
          { label: "New" },
        ]}
      />
      <PageHeader
        title="Create request link"
        description="Optional public link for campaigns, trade-specific pages, referral partners, or distinct service lines."
      />
      <CustomerIntakeModuleNav className="mb-6" />

      <form action={formAction} className="max-w-3xl space-y-8">
        {state.error && (
          <p
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {state.error}
          </p>
        )}

        <details className="rounded-lg border border-border bg-foreground/[0.02] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Start from template (optional)
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              <h2 className="text-sm font-bold text-foreground">Starter templates</h2>
            </div>
            <TradeTemplatePicker
              selectedSlug={selectedTemplate?.slug}
              onSelect={(t) => {
                setSelectedTemplate(t);
                setNameValue(t.name);
                setSlugValue(t.slug);
              }}
            />
          </div>
        </details>
        <input type="hidden" name="templateSlug" value={selectedTemplate?.slug || ""} />

        <div className="grid gap-6 border-t border-border pt-8 sm:grid-cols-2">
          <div className="col-span-full">
            <label className="block">
              <span className={fieldLabelClass}>Link Name</span>
              <input
                name="name"
                type="text"
                required
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
                placeholder="e.g. Roofing Estimate Form"
                className={controlClass}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className={fieldLabelClass}>Link Slug</span>
              <div className="mt-1 flex items-center">
                <span className="mr-1 text-xs text-foreground-subtle">
                  /request/your-company-slug/
                </span>
                <input
                  name="slug"
                  type="text"
                  required
                  value={slugValue}
                  onChange={(event) => setSlugValue(event.target.value)}
                  placeholder="roofing-estimate"
                  className={controlClass}
                />
              </div>
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className="block">
              <span className={fieldLabelClass}>Channel</span>
              <input
                type="text"
                disabled
                value="Public web form (fixed)"
                className={`${controlClass} opacity-70`}
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className={primaryButtonClass} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Create & Continue
          </button>
        </div>
      </form>
    </div>
  );
}

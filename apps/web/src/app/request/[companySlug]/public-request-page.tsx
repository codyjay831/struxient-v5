import { toPublicIntakeFormViewModel } from "@/lib/public-request-settings-effective";
import { PublicIntakeClient } from "./public-intake-client";
import type { PublicRequestIntakeBundle } from "@/lib/db";

export function PublicRequestPageContent({ bundle }: { bundle: PublicRequestIntakeBundle }) {
  const view = toPublicIntakeFormViewModel(bundle.intake);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-xl">
          <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
            Service Request
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {view.formTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            {bundle.organizationDisplayName}
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-xl flex-1 space-y-6">
          {view.introMessage ? (
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-4 py-3 sm:px-5">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground-muted">
                {view.introMessage}
              </p>
            </div>
          ) : null}

          {view.emergencyWarningText ? (
            <div
              role="alert"
              className="rounded-lg border border-danger/35 bg-danger/[0.07] px-4 py-3 text-sm leading-relaxed text-danger"
            >
              {view.emergencyWarningText}
            </div>
          ) : null}

          <PublicIntakeClient
            formDefinition={bundle.formDefinition}
            companySlug={bundle.companySlug}
            organizationDisplayName={bundle.organizationDisplayName}
            googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
            requestTypeOptions={view.requestTypeOptions}
            submitButtonLabel={view.submitButtonText}
          />
        </div>
      </main>

      <footer className="mt-auto border-t border-border px-4 py-6 sm:px-8">
        <p className="mx-auto max-w-xl text-center text-xs text-foreground-subtle">
          Powered by Struxient — requests go directly to this business.
        </p>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { handoffMutedLinkClass } from "@/components/ui/handoff-panel";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";

const mutedListClass = "mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-foreground-muted";

export function PublicRequestLinkPanel({
  organizationName,
  slug,
  baseUrl,
  publicRequestLive,
  className = "",
}: {
  organizationName: string;
  slug: string | null;
  baseUrl: string;
  /** When no settings row exists, treated as live (enabled). */
  publicRequestLive: boolean;
  /** Passed to the outer {@link WorkspacePanel} (spacing in modals vs. legacy layouts). */
  className?: string;
}) {
  const path = slug ? buildPublicIntakeUrl({ companySlug: slug }) : null;
  const absoluteUrl =
    slug && baseUrl ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : path;

  return (
    <WorkspacePanel padding="compact" className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
        Public Request Link
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">Request Settings</p>
      <p className="mt-3">
        <Link href="/settings/intake" className={handoffMutedLinkClass}>
          Customer intake settings
        </Link>
      </p>
      {!publicRequestLive ? (
        <p className="mt-3 text-xs leading-relaxed text-danger">
          Public request is turned off. Customers who open your Public Request Link see an
          unavailable message until you turn it back on in customer intake settings.
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Your <span className="text-foreground">Public Intake Form</span> is a controlled
        customer-facing door — not a generic form builder.{" "}
        <span className="text-foreground">Intake Requirements</span> stay fixed in this version so
        every submission creates a proper lead in Struxient.
      </p>

      {!slug ? (
        <p className="mt-4 text-sm text-foreground-muted">
          A public link is not configured for {organizationName} yet (no company slug on file).
          When Request Settings include a slug, your Public Request Link will appear here.
        </p>
      ) : !absoluteUrl ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-foreground-muted">
            Set <code className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_APP_URL
            </code>{" "}
            for a full copyable URL. Until then, use this path on your site:
          </p>
          <p className="break-all font-mono text-xs text-foreground">{path}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              Your link
            </p>
            <p className="mt-1 break-all text-xs leading-relaxed text-foreground">{absoluteUrl}</p>
          </div>
          <CopyPublicRequestUrlButton url={absoluteUrl} />
        </div>
      )}

      <p className="mt-5 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        Where to use it
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
        Copy instructions only — there are no live integrations in this version.
      </p>
      <ul className={mutedListClass}>
        <li>Website button</li>
        <li>Google Business Profile</li>
        <li>Facebook</li>
        <li>Instagram</li>
        <li>Email signature</li>
        <li>Text message</li>
        <li>QR code</li>
      </ul>
    </WorkspacePanel>
  );
}

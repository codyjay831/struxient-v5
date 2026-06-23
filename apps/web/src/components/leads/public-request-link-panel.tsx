import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { INTAKE_PUBLIC_COPY_PATH } from "@/lib/intake-settings-hierarchy";

const secondaryButtonClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function PublicRequestLinkPanel({
  organizationName,
  slug,
  baseUrl,
  publicRequestLive,
  className = "",
  previewHref = null,
  editCopyHref = INTAKE_PUBLIC_COPY_PATH,
}: {
  organizationName: string;
  slug: string | null;
  baseUrl: string;
  /** When no settings row exists, treated as live (enabled). */
  publicRequestLive: boolean;
  /** Passed to the outer {@link WorkspacePanel} (spacing in modals vs. legacy layouts). */
  className?: string;
  previewHref?: string | null;
  editCopyHref?: string;
}) {
  const path = slug ? buildPublicIntakeUrl({ companySlug: slug }) : null;
  const absoluteUrl =
    slug && baseUrl ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : path;

  return (
    <WorkspacePanel padding="compact" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Public request link
          </p>
          {!publicRequestLive ? (
            <p className="mt-2 text-xs leading-relaxed text-danger">
              Public intake is paused. Visitors see an unavailable message until you turn intake
              back on.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {previewHref ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryButtonClass}
            >
              <ExternalLink className="mr-1.5 size-3.5" />
              Preview page
            </a>
          ) : (
            <span className={`${secondaryButtonClass} cursor-not-allowed opacity-60`}>
              Preview unavailable
            </span>
          )}
          <Link href={editCopyHref} className={secondaryButtonClass}>
            Edit page copy &amp; availability
          </Link>
        </div>
      </div>

      {!slug ? (
        <p className="mt-3 text-sm text-foreground-muted">
          No company slug configured for {organizationName}. Set one in{" "}
          <Link href="/settings/organization" className="text-accent hover:underline">
            Business profile
          </Link>{" "}
          before sharing a public link.
        </p>
      ) : !absoluteUrl ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-foreground-muted">
            Set{" "}
            <code className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.65rem]">
              NEXT_PUBLIC_APP_URL
            </code>{" "}
            for a full copyable URL. Until then, use this path:
          </p>
          <p className="break-all font-mono text-xs text-foreground">{path}</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
            <p className="break-all text-xs leading-relaxed text-foreground">{absoluteUrl}</p>
          </div>
          <CopyPublicRequestUrlButton url={absoluteUrl} />
        </div>
      )}
    </WorkspacePanel>
  );
}

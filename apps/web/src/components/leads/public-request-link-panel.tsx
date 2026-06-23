import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CopyablePublicUrl } from "@/components/leads/copyable-public-url";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";

const secondaryButtonClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function PublicRequestLinkPanel({
  organizationName,
  slug,
  baseUrl,
  publicRequestLive,
  className = "",
  previewHref = null,
  specializedFormCount = 0,
}: {
  organizationName: string;
  slug: string | null;
  baseUrl: string;
  /** When no settings row exists, treated as live (enabled). */
  publicRequestLive: boolean;
  className?: string;
  previewHref?: string | null;
  specializedFormCount?: number;
}) {
  const path = slug ? buildPublicIntakeUrl({ companySlug: slug }) : null;
  const absoluteUrl =
    slug && baseUrl ? buildPublicIntakeUrl({ baseUrl, companySlug: slug }) : path;

  const statusLabel = !slug
    ? "Slug required"
    : !publicRequestLive
      ? "Paused"
      : "Live";
  const statusTone = !slug ? "warning" : !publicRequestLive ? "warning" : "approved";

  return (
    <WorkspacePanel
      padding="compact"
      className={[
        "border-accent/20 bg-accent/[0.03]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Your customer link
            </p>
            <StatusBadge label={statusLabel} tone={statusTone} />
            {specializedFormCount > 0 ? (
              <StatusBadge
                label={`${specializedFormCount} additional link${specializedFormCount === 1 ? "" : "s"}`}
                tone="neutral"
              />
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-foreground-muted">
            Share this link so customers can request work without calling the office.
          </p>
          {!publicRequestLive && slug ? (
            <p className="mt-2 text-xs leading-relaxed text-danger">
              Intake is paused — visitors see an unavailable message until you turn requests back
              on.
            </p>
          ) : null}
        </div>
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
      </div>

      {!slug ? (
        <p className="mt-4 text-sm text-foreground-muted">
          No company slug configured for {organizationName}. Set one in{" "}
          <Link href="/settings/organization" className="text-accent hover:underline">
            Business profile
          </Link>{" "}
          before sharing a public link.
        </p>
      ) : !absoluteUrl ? (
        <div className="mt-4 space-y-2">
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
        <div className="mt-4">
          <CopyablePublicUrl url={absoluteUrl} />
        </div>
      )}
    </WorkspacePanel>
  );
}

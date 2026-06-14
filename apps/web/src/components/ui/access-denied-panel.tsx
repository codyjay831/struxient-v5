import Link from "next/link";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

export function AccessDeniedPanel({
  title = "Access denied",
  description = "Your role does not have access to this area.",
  backHref = "/workstation",
  backLabel = "Back to Workstation",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <WorkspacePanel>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-foreground-muted">{description}</p>
      <Link
        href={backHref}
        className="mt-3 inline-flex text-xs font-medium text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        {backLabel}
      </Link>
    </WorkspacePanel>
  );
}

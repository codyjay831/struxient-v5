import { WorkspacePanel } from "@/components/ui/workspace-panel";

export function PlatformAccessDeniedPanel() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <WorkspacePanel>
        <p className="text-sm font-medium text-foreground">Platform access denied</p>
        <p className="mt-1 text-sm text-foreground-muted">
          Your account is signed in but does not have active platform operator access.
        </p>
        <p className="mt-3 text-xs text-foreground-muted">
          Contact a platform administrator if you believe this is an error.
        </p>
      </WorkspacePanel>
    </div>
  );
}

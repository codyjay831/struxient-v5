import Link from "next/link";
import { WorkspacePanel } from "@/components/ui/workspace-panel";

const baseClass =
  "inline-flex rounded-lg border px-3 py-2 text-xs font-medium transition-colors";
const inactiveClass = `${baseClass} border-border text-foreground-muted hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground`;
const activeClass = `${baseClass} border-border-strong bg-foreground/5 text-foreground`;

export function ScopeLibrarySectionNav({
  active,
}: {
  active: "presets" | "tasks" | "stages" | "signals";
}) {
  return (
    <WorkspacePanel padding="compact" className="mb-6">
      <p className="text-xs font-medium text-foreground">Scope Library</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
        Saved line items, reusable tasks, and workflow configuration.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/settings/scope-library"
          className={active === "presets" ? activeClass : inactiveClass}
          aria-current={active === "presets" ? "page" : undefined}
        >
          Saved line items
        </Link>
        <Link
          href="/settings/scope-library/tasks"
          className={active === "tasks" ? activeClass : inactiveClass}
          aria-current={active === "tasks" ? "page" : undefined}
        >
          Reusable tasks
        </Link>
        <Link
          href="/settings/scope-library/stages"
          className={active === "stages" ? activeClass : inactiveClass}
          aria-current={active === "stages" ? "page" : undefined}
        >
          Stages
        </Link>
        <Link
          href="/settings/scope-library/signals"
          className={active === "signals" ? activeClass : inactiveClass}
          aria-current={active === "signals" ? "page" : undefined}
        >
          Signals
        </Link>
      </div>
    </WorkspacePanel>
  );
}

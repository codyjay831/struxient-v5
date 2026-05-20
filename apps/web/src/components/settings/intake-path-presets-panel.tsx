import { INTAKE_PATH_PRESETS } from "@/lib/intake-settings-hierarchy";
import { StatusBadge } from "@/components/ui/status-badge";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

export function IntakePathPresetsPanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        Intake paths are product modes, not separate systems. Only the standard path is active
        in this release; additional paths will appear here when ready.
      </p>
      <ul className="space-y-3">
        {INTAKE_PATH_PRESETS.map((preset) => (
          <li
            key={preset.mode}
            className="flex flex-col gap-2 rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{preset.label}</p>
              <p className="mt-1 text-xs text-foreground-muted">{preset.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {preset.available ? (
                <StatusBadge label="Active" tone="approved" />
              ) : (
                <StatusBadge label="Coming soon" tone="neutral" />
              )}
              <label className="flex cursor-not-allowed items-center gap-2 opacity-60">
                <input
                  type="checkbox"
                  checked={preset.available}
                  disabled
                  readOnly
                  className="size-4 rounded border-border"
                  aria-label={`${preset.label} enablement`}
                />
                <span className={fieldLabelClass}>Enabled</span>
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

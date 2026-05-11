"use client";

import { useRef, useState, useTransition } from "react";
import { X, Settings2, Check, Loader2 } from "lucide-react";
import { updateWorkstationSettingsAction } from "@/app/(workspace)/workstation/workstation-settings-actions";

export type WorkstationSettingsInitial = {
  showQuickActions: boolean;
  quickActions: string[];
  urgentThresholdHours: number;
};

const QUICK_ACTION_OPTIONS = [
  { id: "new-intake", label: "New Intake" },
  { id: "new-quote", label: "New Quote" },
  { id: "browse-jobs", label: "Browse Jobs" },
];

export function WorkstationSettingsDrawer({
  initial,
}: {
  initial: WorkstationSettingsInitial;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [showQuickActions, setShowQuickActions] = useState(initial.showQuickActions);
  const [quickActions, setQuickActions] = useState<string[]>(initial.quickActions);
  const [urgentThresholdHours, setUrgentThresholdHours] = useState(initial.urgentThresholdHours);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function open() {
    dialogRef.current?.showModal();
    setSaveSuccess(false);
  }

  function close() {
    dialogRef.current?.close();
  }

  function handleToggleAction(id: string) {
    setQuickActions((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaveSuccess(false);
    startTransition(async () => {
      const result = await updateWorkstationSettingsAction({
        showQuickActions,
        quickActions,
        urgentThresholdHours,
      });
      if (result.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-lg border border-border bg-surface p-2 text-foreground-subtle transition-colors hover:bg-background hover:text-foreground"
        aria-label="Workstation Settings"
      >
        <Settings2 className="size-4" />
      </button>

      <dialog
        ref={dialogRef}
        className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-sm border-l border-border bg-surface p-0 text-foreground shadow-2xl outline-none animate-in slide-in-from-right duration-300 [&::backdrop]:bg-foreground/20"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <h2 className="text-lg font-bold tracking-tight">Workstation Settings</h2>
            <button
              type="button"
              onClick={close}
              className="rounded-full p-1 text-foreground-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Quick Actions Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                  Quick Actions
                </h3>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={showQuickActions}
                    onChange={(e) => setShowQuickActions(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-5 w-9 rounded-full bg-border transition-colors peer-checked:bg-accent after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"></div>
                </label>
              </div>
              
              <p className="text-xs text-foreground-muted leading-relaxed">
                Toggle the visibility of the quick action bar and select which buttons to show.
              </p>

              {showQuickActions && (
                <div className="space-y-2 pt-2">
                  {QUICK_ACTION_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2 transition-colors hover:bg-background"
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <input
                        type="checkbox"
                        checked={quickActions.includes(opt.id)}
                        onChange={() => handleToggleAction(opt.id)}
                        className="size-4 rounded border-border text-accent focus:ring-accent"
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* Operational Tuning Section */}
            <section className="space-y-4">
              <h3 className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
                Operational Tuning
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Urgent Threshold (Hours)
                  </label>
                  <p className="text-xs text-foreground-muted mb-3">
                    Items updated within this window are flagged for attention.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max="168"
                      step="1"
                      value={urgentThresholdHours}
                      onChange={(e) => setUrgentThresholdHours(parseInt(e.target.value))}
                      className="flex-1 accent-accent"
                    />
                    <span className="w-12 text-right text-sm font-bold tabular-nums">
                      {urgentThresholdHours}h
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="border-t border-border p-6">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saveSuccess ? (
                <Check className="size-4" />
              ) : null}
              {isPending ? "Saving..." : saveSuccess ? "Saved" : "Save Settings"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

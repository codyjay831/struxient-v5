"use client";

export type SettingsSaveState = "idle" | "saving" | "saved" | "error";

export function SettingsSaveStatus({
  state,
  errorMessage,
  className = "",
}: {
  state: SettingsSaveState;
  errorMessage?: string | null;
  className?: string;
}) {
  if (state === "idle") return null;

  if (state === "saving") {
    return (
      <p className={["text-xs text-foreground-muted", className].join(" ").trim()} role="status" aria-live="polite">
        Saving...
      </p>
    );
  }

  if (state === "saved") {
    return (
      <p className={["text-xs text-success", className].join(" ").trim()} role="status" aria-live="polite">
        Saved
      </p>
    );
  }

  return (
    <p className={["text-xs text-danger", className].join(" ").trim()} role="alert" aria-live="assertive">
      {errorMessage ?? "Could not save setting. Try again."}
    </p>
  );
}

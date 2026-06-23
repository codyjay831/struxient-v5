type PublicPageCopyPreviewProps = {
  formTitle: string;
  introMessage: string;
  emergencyWarningText: string;
  submitButtonText: string;
  enabled: boolean;
};

export function PublicPageCopyPreview({
  formTitle,
  introMessage,
  emergencyWarningText,
  submitButtonText,
  enabled,
}: PublicPageCopyPreviewProps) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Live preview
        </p>
        <p className="mt-1 text-sm text-foreground-muted">
          Preview only — this is the customer-facing shell around your intake fields.
        </p>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
          Customer Request
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">{formTitle || "Request a quote"}</p>
        {!enabled ? (
          <p className="mt-3 text-sm text-danger">
            Public intake is paused — customers would see an unavailable message.
          </p>
        ) : null}
        {introMessage.trim() ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground-muted whitespace-pre-wrap">
            {introMessage}
          </p>
        ) : (
          <p className="mt-3 text-xs italic text-foreground-subtle">No intro message configured.</p>
        )}
        {emergencyWarningText.trim() ? (
          <p className="mt-3 rounded-lg border border-danger/35 bg-danger/[0.07] px-3 py-2 text-sm text-danger">
            {emergencyWarningText}
          </p>
        ) : null}
        <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-foreground-subtle">
          Intake fields render here
        </div>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-sm font-medium text-accent-contrast opacity-90"
        >
          {submitButtonText || "Submit Request"}
        </button>
      </div>
    </div>
  );
}

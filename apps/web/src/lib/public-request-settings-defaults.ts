/** Defaults when no `PublicRequestSettings` row exists yet (read-only public path). */
export const DEFAULT_PUBLIC_REQUEST_FORM_TITLE = "Request service";

export const DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT = "Send request";

/** Shown when there is no settings row; omitted when a row exists and `introMessage` is null. */
export const DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE =
  "Use this page to send a brief request. You do not need a Struxient account.";

export type PublicRequestTypeOption = {
  /** Stable key stored on the sales intake (lowercase slug). */
  value: string;
  /** Customer-facing label. */
  label: string;
};

export const DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS: PublicRequestTypeOption[] = [
  { value: "repair", label: "Repair" },
  { value: "estimate", label: "Estimate / quote" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

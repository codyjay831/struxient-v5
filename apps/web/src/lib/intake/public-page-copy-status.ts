import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";

export type PublicPageCopySnapshot = {
  formTitle: string | null;
  introMessage: string | null;
  emergencyWarningText: string | null;
  submitButtonText: string | null;
};

export function resolvePublicPageCopyDisplay(settings: PublicPageCopySnapshot | null) {
  const formTitle = settings?.formTitle ?? DEFAULT_PUBLIC_REQUEST_FORM_TITLE;
  const submitButtonText =
    settings?.submitButtonText ?? DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT;
  const hasIntro = Boolean(settings?.introMessage?.trim());
  const hasEmergencyWarning = Boolean(settings?.emergencyWarningText?.trim());

  const customized =
    formTitle !== DEFAULT_PUBLIC_REQUEST_FORM_TITLE ||
    submitButtonText !== DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT ||
    hasIntro ||
    hasEmergencyWarning;

  return {
    formTitle,
    submitButtonText,
    hasIntro,
    hasEmergencyWarning,
    customized,
  };
}

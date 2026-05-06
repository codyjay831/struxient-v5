import type { PublicRequestSettings } from "@prisma/client";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
  DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  type PublicRequestTypeOption,
} from "@/lib/public-request-settings-defaults";
import { parseStoredRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";

export type EffectivePublicRequestSettings = {
  enabled: boolean;
  formTitle: string;
  /** When null, the intro panel is omitted (only after a settings row exists). */
  introMessage: string | null;
  emergencyWarningText: string | null;
  submitButtonText: string;
  requestTypeOptions: PublicRequestTypeOption[];
};

type PublicRequestSettingsRow = Pick<
  PublicRequestSettings,
  | "enabled"
  | "formTitle"
  | "introMessage"
  | "emergencyWarningText"
  | "submitButtonText"
  | "requestTypeOptionsJson"
>;

export function effectivePublicRequestSettingsFromRow(
  row: PublicRequestSettingsRow | null,
): EffectivePublicRequestSettings {
  if (!row) {
    return {
      enabled: true,
      formTitle: DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
      introMessage: DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
      emergencyWarningText: null,
      submitButtonText: DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
      requestTypeOptions: DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
    };
  }

  const formTitle = row.formTitle.trim() || DEFAULT_PUBLIC_REQUEST_FORM_TITLE;
  const submitButtonText =
    row.submitButtonText.trim() || DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT;

  const introMessage =
    row.introMessage === null
      ? null
      : row.introMessage.trim() === ""
        ? null
        : row.introMessage.trim();

  const emergencyWarningText =
    row.emergencyWarningText && row.emergencyWarningText.trim() !== ""
      ? row.emergencyWarningText.trim()
      : null;

  return {
    enabled: row.enabled,
    formTitle,
    introMessage,
    emergencyWarningText,
    submitButtonText,
    requestTypeOptions: parseStoredRequestTypeOptionsJson(row.requestTypeOptionsJson),
  };
}

/** Serializable props for the public intake form (no org ids). */
export type PublicIntakeFormViewModel = {
  formTitle: string;
  introMessage: string | null;
  emergencyWarningText: string | null;
  submitButtonText: string;
  requestTypeOptions: PublicRequestTypeOption[];
};

export function toPublicIntakeFormViewModel(
  effective: EffectivePublicRequestSettings,
): PublicIntakeFormViewModel {
  return {
    formTitle: effective.formTitle,
    introMessage: effective.introMessage,
    emergencyWarningText: effective.emergencyWarningText,
    submitButtonText: effective.submitButtonText,
    requestTypeOptions: effective.requestTypeOptions,
  };
}

import type { PublicRequestSettings } from "@prisma/client";
import {
  DEFAULT_PUBLIC_REQUEST_FORM_TITLE,
  DEFAULT_PUBLIC_REQUEST_INTRO_MESSAGE,
  DEFAULT_PUBLIC_REQUEST_SUBMIT_BUTTON_TEXT,
} from "@/lib/public-request-settings-defaults";
import { parseInstantQuoteConfigJson } from "@/lib/public-request-settings-validation";

export type EffectivePublicRequestSettings = {
  enabled: boolean;
  formTitle: string;
  /** When null, the intro panel is omitted (only after a settings row exists). */
  introMessage: string | null;
  emergencyWarningText: string | null;
  submitButtonText: string;
  instantQuoteConfig: Record<string, string[]>;
  instantQuoteEnabled: boolean;
  showInstantQuoteDetails: boolean;
  offerings: string[];
};

type PublicRequestSettingsRow = Pick<
  PublicRequestSettings,
  | "enabled"
  | "formTitle"
  | "introMessage"
  | "emergencyWarningText"
  | "submitButtonText"
  | "instantQuoteConfigJson"
  | "instantQuoteEnabled"
  | "showInstantQuoteDetails"
  | "offerings"
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
      instantQuoteConfig: {},
      instantQuoteEnabled: true,
      showInstantQuoteDetails: true,
      offerings: [],
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
    instantQuoteConfig: parseInstantQuoteConfigJson(row.instantQuoteConfigJson),
    instantQuoteEnabled: row.instantQuoteEnabled,
    showInstantQuoteDetails: row.showInstantQuoteDetails,
    offerings: row.offerings,
  };
}

/** Serializable page copy for the public request page (no org ids). Request types come from the resolved form. */
export type PublicIntakeFormViewModel = {
  formTitle: string;
  introMessage: string | null;
  emergencyWarningText: string | null;
  submitButtonText: string;
  instantQuoteConfig: Record<string, string[]>;
  instantQuoteEnabled: boolean;
  showInstantQuoteDetails: boolean;
  offerings: string[];
};

export function toPublicIntakeFormViewModel(
  effective: EffectivePublicRequestSettings,
): PublicIntakeFormViewModel {
  return {
    formTitle: effective.formTitle,
    introMessage: effective.introMessage,
    emergencyWarningText: effective.emergencyWarningText,
    submitButtonText: effective.submitButtonText,
    instantQuoteConfig: effective.instantQuoteConfig,
    instantQuoteEnabled: effective.instantQuoteEnabled,
    showInstantQuoteDetails: effective.showInstantQuoteDetails,
    offerings: effective.offerings,
  };
}

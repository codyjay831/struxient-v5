"use client";

import { useActionState } from "react";
import type {
  BusinessProfileCustomerMarket,
  BusinessProfileOperatingModel,
  BusinessProfileTeamSize,
  BusinessProfileTrade,
  BusinessProfileWorkType,
} from "@prisma/client";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import {
  BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS,
  BUSINESS_PROFILE_OPERATING_MODEL_OPTIONS,
  BUSINESS_PROFILE_TEAM_SIZE_OPTIONS,
  BUSINESS_PROFILE_TRADE_OPTIONS,
  BUSINESS_PROFILE_WORK_TYPE_OPTIONS,
} from "@/lib/business-profile/business-profile-options";
import {
  saveBusinessProfileSettingsAction,
  type BusinessProfileSettingsFormState,
} from "./business-profile-settings-actions";

const initialActionState: BusinessProfileSettingsFormState = {};

type BusinessProfileInitialValues = {
  trades: BusinessProfileTrade[];
  workTypes: BusinessProfileWorkType[];
  customerMarkets: BusinessProfileCustomerMarket[];
  operatingModel: BusinessProfileOperatingModel | null;
  teamSize: BusinessProfileTeamSize | null;
};

export function BusinessProfileSettingsForm({
  initial,
  canManage,
}: {
  initial: BusinessProfileInitialValues;
  canManage: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBusinessProfileSettingsAction,
    initialActionState,
  );

  const disabled = !canManage || isPending;

  return (
    <form action={formAction} className="space-y-8">
      {state.error ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-success">
          Business profile saved.
        </p>
      ) : null}

      <section>
        <p className={workspaceFormFieldLabelClass}>What trades do you work in?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BUSINESS_PROFILE_TRADE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-foreground-muted">
              <input
                type="checkbox"
                name="trades"
                value={option.value}
                defaultChecked={initial.trades.includes(option.value)}
                disabled={disabled}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section>
        <p className={workspaceFormFieldLabelClass}>What kind of work do you most often do?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BUSINESS_PROFILE_WORK_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-foreground-muted">
              <input
                type="checkbox"
                name="workTypes"
                value={option.value}
                defaultChecked={initial.workTypes.includes(option.value)}
                disabled={disabled}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section>
        <p className={workspaceFormFieldLabelClass}>Who do you typically serve?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-foreground-muted">
              <input
                type="checkbox"
                name="customerMarkets"
                value={option.value}
                defaultChecked={initial.customerMarkets.includes(option.value)}
                disabled={disabled}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={workspaceFormFieldLabelClass}>Operating model</span>
          <select
            name="operatingModel"
            defaultValue={initial.operatingModel ?? ""}
            className={workspaceFormControlClass}
            disabled={disabled}
          >
            <option value="">Not specified</option>
            {BUSINESS_PROFILE_OPERATING_MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={workspaceFormFieldLabelClass}>Team size</span>
          <select
            name="teamSize"
            defaultValue={initial.teamSize ?? ""}
            className={workspaceFormControlClass}
            disabled={disabled}
          >
            <option value="">Not specified</option>
            {BUSINESS_PROFILE_TEAM_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {canManage ? (
        <button type="submit" className={workspaceFormPrimaryButtonClass} disabled={isPending}>
          {isPending ? "Saving..." : "Save Business Profile"}
        </button>
      ) : null}
    </form>
  );
}


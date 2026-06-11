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
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import {
  BUSINESS_PROFILE_CUSTOMER_MARKET_OPTIONS,
  BUSINESS_PROFILE_OPERATING_MODEL_OPTIONS,
  BUSINESS_PROFILE_TEAM_SIZE_OPTIONS,
  BUSINESS_PROFILE_TRADE_OPTIONS,
  BUSINESS_PROFILE_WORK_TYPE_OPTIONS,
} from "@/lib/business-profile/business-profile-options";
import {
  saveBusinessProfileOnboardingAction,
  skipBusinessProfileOnboardingAction,
  type OnboardingBusinessProfileState,
} from "./onboarding-actions";

const initialActionState: OnboardingBusinessProfileState = {};

export function BusinessProfileOnboardingForm({
  initial,
}: {
  initial: {
    trades: BusinessProfileTrade[];
    workTypes: BusinessProfileWorkType[];
    customerMarkets: BusinessProfileCustomerMarket[];
    operatingModel: BusinessProfileOperatingModel | null;
    teamSize: BusinessProfileTeamSize | null;
  };
}) {
  const [state, formAction, isPending] = useActionState(
    saveBusinessProfileOnboardingAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Account setup
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Set your Business Profile
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          This helps Struxient use the right terminology and defaults. You can skip and fill this in later.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger">
          {state.error}
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
                disabled={isPending}
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
                disabled={isPending}
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
                disabled={isPending}
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
            disabled={isPending}
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
            disabled={isPending}
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

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={workspaceFormPrimaryButtonClass} disabled={isPending}>
          {isPending ? "Saving..." : "Save and continue"}
        </button>
        <button
          type="button"
          className={workspaceFormSecondaryButtonClass}
          onClick={() => void skipBusinessProfileOnboardingAction()}
          disabled={isPending}
        >
          Skip for now
        </button>
      </div>
    </form>
  );
}


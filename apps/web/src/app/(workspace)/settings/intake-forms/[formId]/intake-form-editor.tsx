"use client";

import { useActionState, useMemo, useState } from "react";
import { updateIntakeFormAction } from "../intake-form-actions";
import { INTAKE_ATOMS } from "@/lib/intake/atoms";
import type {
  IntakeFormFieldRef,
  IntakeFormFieldVisibilityRule,
  IntakeFormSchema,
  IntakeFormSection,
} from "@/lib/intake/default-intake-form";
import { LeadChannel } from "@prisma/client";
import Link from "next/link";
import { ChevronLeft, Loader2, Save, Plus, Trash2, GripVertical, Info, Lock } from "lucide-react";
import { buildPublicIntakeUrlForForm } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import type { PublicRequestTypeOption } from "@/lib/public-request-settings-defaults";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import { PUBLIC_INTAKE_LOCKED_ATOMS } from "@/lib/intake/public-intake-schema-invariants";
import {
  INTAKE_FIELD_GROUPS,
  intakeEditorContextLabels,
  type IntakeEditorContext,
} from "@/lib/intake/intake-editor-context";
import { IntakeFormPreviewPanel } from "@/components/settings/intake-form-preview-panel";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

type IntakeFormEditorDefinition = {
  id: string;
  name: string;
  organizationId: string;
  slug: string;
  channel: LeadChannel;
  isPublic: boolean;
  isDefault: boolean;
  schema: IntakeFormSchema;
};

function atomsForGroup(groupKeys: string[]) {
  return groupKeys
    .map((key) => INTAKE_ATOMS[key])
    .filter((atom): atom is NonNullable<typeof atom> => Boolean(atom));
}

export function IntakeFormEditor({
  formDefinition,
  editorContext,
  isPublicIntakeForm,
  initialRequestTypeOptions,
  organizationSlug,
  organizationDisplayName,
  baseUrl,
  publicPageCopy,
}: {
  formDefinition: IntakeFormEditorDefinition;
  editorContext: IntakeEditorContext;
  isPublicIntakeForm: boolean;
  initialRequestTypeOptions: PublicRequestTypeOption[];
  organizationSlug: string | null;
  organizationDisplayName: string;
  baseUrl: string;
  publicPageCopy?: {
    formTitle: string | null;
    introMessage: string | null;
    emergencyWarningText: string | null;
    submitButtonText: string;
  };
}) {
  const labels = intakeEditorContextLabels(editorContext);
  const boundUpdate = updateIntakeFormAction.bind(null, formDefinition.id);
  const [state, formAction, isPending] = useActionState(boundUpdate, {});

  const [schema, setSchema] = useState<IntakeFormSchema>(formDefinition.schema);
  const [name, setName] = useState(formDefinition.name);
  const [isPublic, setIsPublic] = useState(formDefinition.isPublic);
  const [isDefault, setIsDefault] = useState(formDefinition.isDefault);
  const [requestTypes, setRequestTypes] = useState<PublicRequestTypeOption[]>(
    initialRequestTypeOptions,
  );
  const requestTypesJson = useMemo(() => JSON.stringify(requestTypes), [requestTypes]);

  const previewFormDefinition = useMemo(
    () => ({
      id: formDefinition.id,
      name,
      slug: formDefinition.slug,
      channel: formDefinition.channel,
      isPublic: formDefinition.isPublic,
      isDefault: formDefinition.isDefault,
      schema,
    }),
    [formDefinition, name, schema],
  );

  function addRequestType() {
    setRequestTypes((prev) => {
      if (prev.length >= PUBLIC_REQUEST_SETTINGS_LIMITS.maxRequestTypeOptions) {
        return prev;
      }
      return [...prev, { value: "", label: "" }];
    });
  }

  function removeRequestType(index: number) {
    setRequestTypes((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRequestType(index: number, patch: Partial<PublicRequestTypeOption>) {
    setRequestTypes((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  const handleAddSection = () => {
    const newSection: IntakeFormSection = {
      key: `section_${Date.now()}`,
      title: "New Section",
      fields: [],
    };
    setSchema({
      ...schema,
      sections: [...(schema.sections || []), newSection],
    });
  };

  const handleRemoveSection = (sectionIdx: number) => {
    const newSections = [...schema.sections];
    newSections.splice(sectionIdx, 1);
    setSchema({ ...schema, sections: newSections });
  };

  const handleAddField = (sectionIdx: number, atomKey: string) => {
    const newSections = [...schema.sections];
    newSections[sectionIdx].fields.push({ key: atomKey });
    setSchema({ ...schema, sections: newSections });
  };

  const handleRemoveField = (sectionIdx: number, fieldIdx: number) => {
    const field = schema.sections[sectionIdx]?.fields[fieldIdx];
    if (isPublicIntakeForm && field && PUBLIC_INTAKE_LOCKED_ATOMS.has(field.key)) {
      return;
    }
    const newSections = [...schema.sections];
    newSections[sectionIdx].fields.splice(fieldIdx, 1);
    setSchema({ ...schema, sections: newSections });
  };

  const handleUpdateFieldVisibility = (
    sectionIdx: number,
    fieldIdx: number,
    visibleIf: IntakeFormFieldVisibilityRule | undefined,
  ) => {
    const newSections = [...schema.sections];
    newSections[sectionIdx].fields[fieldIdx].visibleIf = visibleIf;
    setSchema({ ...schema, sections: newSections });
  };

  return (
    <form action={formAction} className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={labels.backHref}
            className="mb-4 inline-flex items-center text-xs font-bold text-foreground-subtle transition-colors hover:text-foreground"
          >
            <ChevronLeft className="mr-1 size-3" />
            {labels.backLabel}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{labels.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            {labels.description}
          </p>
        </div>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Save changes
        </button>
      </div>

      {state.error ? (
        <p
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">
              {labels.structureLabel}
            </h2>
            <p className="mb-6 text-xs text-foreground-muted">
              Add construction intake building blocks by section. Use conditional visibility to keep
              customer forms short while supporting different service lines.
            </p>

            <div className="space-y-6">
              {schema.sections?.map((section: IntakeFormSection, sIdx: number) => (
                <div
                  key={section.key}
                  className="group relative rounded-lg border border-border bg-foreground/[0.01] p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => {
                        const newSections = [...schema.sections];
                        newSections[sIdx].title = e.target.value;
                        setSchema({ ...schema, sections: newSections });
                      }}
                      className="border-none bg-transparent p-0 text-lg font-bold text-foreground focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sIdx)}
                      className="p-1 text-foreground-subtle transition-colors hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mb-4 space-y-2">
                    {section.fields.map((field: IntakeFormFieldRef, fIdx: number) => {
                      const isLocked =
                        isPublicIntakeForm && PUBLIC_INTAKE_LOCKED_ATOMS.has(field.key);
                      return (
                        <div
                          key={`${field.key}_${fIdx}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm"
                        >
                          <GripVertical className="size-4 text-foreground-subtle" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {INTAKE_ATOMS[field.key]?.label || field.key}
                              </p>
                              {isLocked ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-foreground-subtle">
                                  <Lock className="size-2.5" />
                                  Required
                                </span>
                              ) : null}
                            </div>
                            {field.visibleIf ? (
                              <div className="mt-1 flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent">
                                <Info className="size-2.5" />
                                Visible if {field.visibleIf.fieldKey}{" "}
                                {field.visibleIf.equals !== undefined
                                  ? `equals ${field.visibleIf.equals}`
                                  : field.visibleIf.notEmpty
                                    ? "is not empty"
                                    : ""}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const fieldKey = prompt(
                                "Enter field key to depend on (e.g. timing.bucket):",
                              );
                              if (!fieldKey) return;
                              const equals = prompt(
                                "Enter value it should equal (or leave blank for 'not empty'):",
                              );
                              handleUpdateFieldVisibility(
                                sIdx,
                                fIdx,
                                equals ? { fieldKey, equals } : { fieldKey, notEmpty: true },
                              );
                            }}
                            className="text-foreground-subtle transition-colors hover:text-accent"
                            title="Add visibility rule"
                          >
                            <Info className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(sIdx, fIdx)}
                            disabled={isLocked}
                            className="text-foreground-subtle transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    {INTAKE_FIELD_GROUPS.map((group) => {
                      const atoms = atomsForGroup(group.keys);
                      if (atoms.length === 0) return null;
                      return (
                        <div key={group.label}>
                          <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-foreground-subtle">
                            {group.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {atoms.map((atom) => (
                              <button
                                key={atom.key}
                                type="button"
                                onClick={() => handleAddField(sIdx, atom.key)}
                                className="inline-flex items-center rounded-full bg-foreground/5 px-2.5 py-1 text-[0.65rem] font-bold text-foreground-subtle transition-colors hover:bg-accent/10 hover:text-accent"
                              >
                                <Plus className="mr-1 size-3" />
                                {atom.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddSection}
                className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-border py-4 text-sm font-bold text-foreground-subtle transition-all hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
              >
                <Plus className="mr-2 size-4" />
                Add section
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <IntakeFormPreviewPanel
            formDefinition={previewFormDefinition}
            organizationDisplayName={organizationDisplayName}
            requestTypeOptions={requestTypes.filter((row) => row.value && row.label)}
            submitButtonLabel={publicPageCopy?.submitButtonText ?? "Submit Request"}
            editorContext={editorContext}
            formTitle={publicPageCopy?.formTitle}
            introMessage={publicPageCopy?.introMessage}
            emergencyWarningText={publicPageCopy?.emergencyWarningText}
          />

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-6 text-sm font-bold uppercase tracking-wider text-foreground">
              Form settings
            </h2>

            <div className="space-y-6">
              <label className="block">
                <span className={fieldLabelClass}>Form name</span>
                <input
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={controlClass}
                />
              </label>

              {editorContext !== "defaultInternalIntake" ? (
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name="isPublic"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="size-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">Public customer form</p>
                      <p className="text-[0.65rem] text-foreground-subtle">
                        Accessible via a public customer link
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name="isDefault"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="size-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">Default customer form</p>
                      <p className="text-[0.65rem] text-foreground-subtle">
                        Primary form for your main customer request link
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                <>
                  <input type="hidden" name="isPublic" value="off" />
                  <input type="hidden" name="isDefault" value="on" />
                  <p className="text-xs leading-relaxed text-foreground-muted">
                    Internal intake is staff-only and always uses your default internal form at
                    /leads/new.
                  </p>
                </>
              )}
            </div>
          </div>

          {isPublicIntakeForm ? (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground">
                Service lines / request types
              </h2>
              <p className="mb-4 text-xs text-foreground-muted">
                Customer-facing choices for this form. These can drive follow-up questions and
                future detail packs for different trades or scopes.
              </p>
              <input type="hidden" name="requestTypesJson" value={requestTypesJson} readOnly />
              <div className="space-y-3">
                {requestTypes.map((row, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3 sm:flex-row sm:items-end"
                  >
                    <label className="block flex-1">
                      <span className={fieldLabelClass}>Internal key</span>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateRequestType(index, { value: e.target.value })}
                        maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeValue}
                        autoComplete="off"
                        className={controlClass}
                        placeholder="e.g. roofing"
                      />
                    </label>
                    <label className="block flex-[2]">
                      <span className={fieldLabelClass}>Customer label</span>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRequestType(index, { label: e.target.value })}
                        maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeLabel}
                        autoComplete="off"
                        className={controlClass}
                        placeholder="e.g. Roofing repair"
                      />
                    </label>
                    <button
                      type="button"
                      className={`${secondaryButtonClass} shrink-0`}
                      onClick={() => removeRequestType(index)}
                      disabled={requestTypes.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${secondaryButtonClass} mt-3`}
                onClick={addRequestType}
              >
                Add service line
              </button>
            </div>
          ) : null}

          {isPublic && editorContext !== "defaultInternalIntake" ? (
            <div className="rounded-xl border border-border bg-foreground/[0.01] p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-foreground">
                Public link
              </h2>
              {!organizationSlug ? (
                <p className="text-xs leading-relaxed text-foreground-muted">
                  Configure a{" "}
                  <Link href="/settings/organization" className="text-accent hover:underline">
                    company slug
                  </Link>{" "}
                  to enable public links for your forms.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
                    <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                      {baseUrl ? "Full URL" : "Path"}
                    </p>
                    <p className="truncate font-mono text-xs text-foreground">
                      {buildPublicIntakeUrlForForm({
                        baseUrl,
                        companySlug: organizationSlug,
                        formSlug: formDefinition.slug,
                        isDefault: formDefinition.isDefault,
                      })}
                    </p>
                  </div>
                  {baseUrl ? (
                    <CopyPublicRequestUrlButton
                      url={buildPublicIntakeUrlForForm({
                        baseUrl,
                        companySlug: organizationSlug,
                        formSlug: formDefinition.slug,
                        isDefault: formDefinition.isDefault,
                      })}
                    />
                  ) : null}
                  {formDefinition.isDefault ? (
                    <p className="text-[0.65rem] leading-relaxed text-foreground-muted">
                      This is your main customer link at /request/{organizationSlug}. Share it on
                      your website and marketing.
                    </p>
                  ) : (
                    <p className="text-[0.65rem] leading-relaxed text-foreground-muted">
                      Specialized form link. Use for campaigns, trade pages, or distinct service
                      lines.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="schema" value={JSON.stringify(schema)} />
    </form>
  );
}

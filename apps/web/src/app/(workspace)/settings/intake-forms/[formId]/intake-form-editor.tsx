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
import Link from "next/link";
import { ChevronLeft, Loader2, Save, Plus, Trash2, GripVertical, Info, Lock } from "lucide-react";
import { buildPublicIntakeUrl } from "@/lib/public-intake-url";
import { CopyPublicRequestUrlButton } from "@/components/leads/copy-public-request-url-button";
import type { PublicRequestTypeOption } from "@/lib/public-request-settings-defaults";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";

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
  isPublic: boolean;
  isDefault: boolean;
  schema: IntakeFormSchema;
};

export function IntakeFormEditor({
  formDefinition,
  isPublicIntakeForm,
  initialRequestTypeOptions,
  organizationSlug,
  baseUrl,
}: {
  formDefinition: IntakeFormEditorDefinition;
  isPublicIntakeForm: boolean;
  initialRequestTypeOptions: PublicRequestTypeOption[];
  organizationSlug: string | null;
  baseUrl: string;
}) {
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
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/settings/intake-forms"
            className="inline-flex items-center text-xs font-bold text-foreground-subtle hover:text-foreground mb-4 transition-colors"
          >
            <ChevronLeft className="mr-1 size-3" />
            Back to public intake forms
          </Link>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Configure Form</h1>
        </div>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save Changes
        </button>
      </div>

      {state.error && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wider">Form Structure</h2>
            
            <div className="space-y-6">
              {schema.sections?.map((section: IntakeFormSection, sIdx: number) => (
                <div key={section.key} className="rounded-lg border border-border bg-foreground/[0.01] p-4 relative group">
                  <div className="flex items-center justify-between mb-4">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => {
                        const newSections = [...schema.sections];
                        newSections[sIdx].title = e.target.value;
                        setSchema({ ...schema, sections: newSections });
                      }}
                      className="bg-transparent font-bold text-foreground border-none focus:ring-0 p-0 text-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sIdx)}
                      className="text-foreground-subtle hover:text-danger transition-colors p-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4">
                    {section.fields.map((field: IntakeFormFieldRef, fIdx: number) => (
                      <div key={`${field.key}_${fIdx}`} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 shadow-sm">
                        <GripVertical className="size-4 text-foreground-subtle" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{INTAKE_ATOMS[field.key]?.label || field.key}</p>
                          <p className="text-[0.65rem] text-foreground-subtle uppercase font-bold">{field.key}</p>
                          
                          {field.visibleIf && (
                            <div className="mt-1 flex items-center gap-1.5 text-[0.6rem] font-bold text-accent uppercase tracking-wider">
                              <Info className="size-2.5" />
                              Visible if {field.visibleIf.fieldKey} {field.visibleIf.equals !== undefined ? `equals ${field.visibleIf.equals}` : field.visibleIf.notEmpty ? 'is not empty' : ''}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const fieldKey = prompt("Enter field key to depend on (e.g. timing.bucket):");
                            if (!fieldKey) return;
                            const equals = prompt("Enter value it should equal (or leave blank for 'not empty'):");
                            handleUpdateFieldVisibility(sIdx, fIdx, equals ? { fieldKey, equals } : { fieldKey, notEmpty: true });
                          }}
                          className="text-foreground-subtle hover:text-accent transition-colors"
                          title="Add visibility rule"
                        >
                          <Info className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveField(sIdx, fIdx)}
                          className="text-foreground-subtle hover:text-danger transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.values(INTAKE_ATOMS).map((atom) => (
                      <button
                        key={atom.key}
                        type="button"
                        onClick={() => handleAddField(sIdx, atom.key)}
                        className="inline-flex items-center rounded-full bg-foreground/5 px-2.5 py-1 text-[0.65rem] font-bold text-foreground-subtle hover:bg-accent/10 hover:text-accent transition-colors"
                      >
                        <Plus className="mr-1 size-3" />
                        {atom.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddSection}
                className="w-full py-4 border-2 border-dashed border-border rounded-xl text-foreground-subtle hover:text-accent hover:border-accent/40 hover:bg-accent/5 transition-all text-sm font-bold flex items-center justify-center"
              >
                <Plus className="mr-2 size-4" />
                Add Section
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wider">Settings</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block">
                  <span className={fieldLabelClass}>Form Name</span>
                  <input
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={controlClass}
                  />
                </label>
              </div>

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
                    <p className="text-sm font-bold text-foreground">Public Form</p>
                    <p className="text-[0.65rem] text-foreground-subtle">Accessible via public link</p>
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
                    <p className="text-sm font-bold text-foreground">Default Form</p>
                    <p className="text-[0.65rem] text-foreground-subtle">Primary form for this channel</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {isPublicIntakeForm ? (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wider">
                Request type options
              </h2>
              <p className="mb-4 text-xs text-foreground-muted">
                Customer-facing labels for this form only. Other public forms can use different
                options.
              </p>
              <input type="hidden" name="requestTypesJson" value={requestTypesJson} readOnly />
              <div className="space-y-3">
                {requestTypes.map((row, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3 sm:flex-row sm:items-end"
                  >
                    <label className="block flex-1">
                      <span className={fieldLabelClass}>Value (internal key)</span>
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateRequestType(index, { value: e.target.value })}
                        maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeValue}
                        autoComplete="off"
                        className={controlClass}
                      />
                    </label>
                    <label className="block flex-[2]">
                      <span className={fieldLabelClass}>Label (customer-facing)</span>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRequestType(index, { label: e.target.value })}
                        maxLength={PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeLabel}
                        autoComplete="off"
                        className={controlClass}
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
              <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={addRequestType}>
                Add request type
              </button>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-foreground/[0.01] p-6">
            <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              {isPublic ? "Public Link" : "Private Form"}
            </h2>
            {!isPublic ? (
              <div className="flex items-center gap-2 text-foreground-muted">
                <Lock className="size-4" />
                <p className="text-xs italic">This form is not accessible via public link.</p>
              </div>
            ) : !organizationSlug ? (
              <p className="text-xs text-foreground-muted leading-relaxed">
                Configure a <Link href="/settings/organization" className="text-accent hover:underline">company slug</Link> to enable public links for your forms.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-sm">
                  <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle mb-1">
                    {baseUrl ? "Full URL" : "Path"}
                  </p>
                  <p className="text-xs text-foreground truncate font-mono">
                    {buildPublicIntakeUrl({ 
                      baseUrl, 
                      companySlug: organizationSlug, 
                      formSlug: formDefinition.slug 
                    })}
                  </p>
                </div>
                {baseUrl && (
                  <CopyPublicRequestUrlButton 
                    url={buildPublicIntakeUrl({ 
                      baseUrl, 
                      companySlug: organizationSlug, 
                      formSlug: formDefinition.slug 
                    })} 
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <input type="hidden" name="schema" value={JSON.stringify(schema)} />
    </form>
  );
}

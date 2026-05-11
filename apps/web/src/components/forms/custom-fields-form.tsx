"use client";

import { LeadCustomFieldType } from "@prisma/client";

export type CustomFieldDefPayload = {
  id: string;
  key: string;
  label: string;
  type: LeadCustomFieldType;
  options: string[];
  isRequired: boolean;
};

export type CustomFieldValuePayload = {
  fieldDefId: string;
  value: string;
};

export function CustomFieldsForm({
  fields,
  initialValues = [],
  fieldLabelClass,
  controlClass,
}: {
  fields: CustomFieldDefPayload[];
  initialValues?: CustomFieldValuePayload[];
  fieldLabelClass: string;
  controlClass: string;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((field) => {
        const initialValue = initialValues.find((v) => v.fieldDefId === field.id)?.value ?? "";
        const inputName = `customField_${field.id}`;

        return (
          <div key={field.id}>
            <label className="block">
              <span className={fieldLabelClass}>
                {field.label}
                {field.isRequired && <span className="ml-1 text-danger">*</span>}
              </span>
              {field.type === "SELECT" ? (
                <select
                  name={inputName}
                  defaultValue={initialValue}
                  required={field.isRequired}
                  className={controlClass}
                >
                  <option value="">Select...</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "NUMBER" ? (
                <input
                  name={inputName}
                  type="number"
                  defaultValue={initialValue}
                  required={field.isRequired}
                  className={controlClass}
                />
              ) : (
                <input
                  name={inputName}
                  type="text"
                  defaultValue={initialValue}
                  required={field.isRequired}
                  className={controlClass}
                />
              )}
            </label>
          </div>
        );
      })}
    </div>
  );
}

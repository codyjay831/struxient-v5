/**
 * Builds the absolute or relative public intake URL.
 * When baseUrl is provided, returns an absolute URL.
 * Bare /request/{companySlug} is the org default.
 * /request/{companySlug}/{formSlug} is a specific form.
 */
export function buildPublicIntakeUrl({
  baseUrl,
  companySlug,
  formSlug,
}: {
  baseUrl?: string;
  companySlug: string;
  formSlug?: string;
}): string {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const path = formSlug 
    ? `/request/${companySlug}/${formSlug}` 
    : `/request/${companySlug}`;
  
  return `${base}${path}`;
}

/** Default public forms use the canonical org URL; additional forms use their slug path. */
export function buildPublicIntakeUrlForForm({
  baseUrl,
  companySlug,
  formSlug,
  isDefault,
}: {
  baseUrl?: string;
  companySlug: string;
  formSlug: string;
  isDefault: boolean;
}): string {
  return buildPublicIntakeUrl({
    baseUrl,
    companySlug,
    formSlug: isDefault ? undefined : formSlug,
  });
}

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

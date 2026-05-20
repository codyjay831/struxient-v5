import { LeadChannel } from "@prisma/client";
import { isValidPublicFormSlugSegment } from "@/lib/public-request-slug";

export function normalizePublicIntakeFormSlug(raw: string | null | undefined): string | null {
  const slug = raw?.trim().toLowerCase() ?? "";
  if (!slug || !isValidPublicFormSlugSegment(slug)) {
    return null;
  }
  return slug;
}

export function publicIntakeCreateDefaults() {
  return {
    channel: LeadChannel.WEB_FORM,
    isPublic: true,
  } as const;
}

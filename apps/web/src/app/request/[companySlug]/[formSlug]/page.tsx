import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicRequestIntakeBundle } from "@/lib/db";
import {
  isValidPublicCompanySlugSegment,
  isValidPublicFormSlugSegment,
} from "@/lib/public-request-slug";
import { toPublicIntakeFormViewModel } from "@/lib/public-request-settings-effective";
import { PublicRequestPageContent } from "../public-request-page";

type PageProps = { params: Promise<{ companySlug: string; formSlug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { companySlug, formSlug } = await props.params;
  const normalizedCompany = companySlug.trim().toLowerCase();
  const normalizedForm = formSlug.trim().toLowerCase();

  if (
    !isValidPublicCompanySlugSegment(normalizedCompany) ||
    !isValidPublicFormSlugSegment(normalizedForm)
  ) {
    return { title: "Request unavailable — Struxient" };
  }

  const bundle = await getPublicRequestIntakeBundle(normalizedCompany, normalizedForm);
  if (!bundle || !bundle.intake.enabled) {
    return { title: "Request unavailable — Struxient" };
  }

  const view = toPublicIntakeFormViewModel(bundle.intake);
  return {
    title: `${view.formTitle} — ${bundle.organizationDisplayName}`,
    description: `Send a service request to ${bundle.organizationDisplayName} through Struxient.`,
  };
}

export default async function PublicFormRequestPage(props: PageProps) {
  const { companySlug, formSlug } = await props.params;
  const normalizedCompany = companySlug.trim().toLowerCase();
  const normalizedForm = formSlug.trim().toLowerCase();

  if (
    !isValidPublicCompanySlugSegment(normalizedCompany) ||
    !isValidPublicFormSlugSegment(normalizedForm)
  ) {
    notFound();
  }

  const bundle = await getPublicRequestIntakeBundle(normalizedCompany, normalizedForm);
  if (!bundle || !bundle.intake.enabled) {
    notFound();
  }

  return <PublicRequestPageContent bundle={bundle} />;
}

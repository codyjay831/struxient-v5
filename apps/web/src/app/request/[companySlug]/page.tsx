import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicRequestIntakeBundle } from "@/lib/db";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { toPublicIntakeFormViewModel } from "@/lib/public-request-settings-effective";
import { PublicRequestPageContent } from "./public-request-page";

type PageProps = { params: Promise<{ companySlug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { companySlug } = await props.params;
  const normalized = companySlug.trim().toLowerCase();
  if (!isValidPublicCompanySlugSegment(normalized)) {
    return { title: "Request unavailable — Struxient" };
  }
  const bundle = await getPublicRequestIntakeBundle(normalized);
  if (!bundle || !bundle.intake.enabled) {
    return { title: "Request unavailable — Struxient" };
  }
  const view = toPublicIntakeFormViewModel(bundle.intake);
  return {
    title: `${view.formTitle} — ${bundle.organizationDisplayName}`,
    description: `Send a service request to ${bundle.organizationDisplayName} through Struxient.`,
  };
}

export default async function PublicRequestPage(props: PageProps) {
  const { companySlug } = await props.params;
  const normalized = companySlug.trim().toLowerCase();

  if (!isValidPublicCompanySlugSegment(normalized)) {
    notFound();
  }

  const bundle = await getPublicRequestIntakeBundle(normalized);
  if (!bundle || !bundle.intake.enabled) {
    notFound();
  }

  return <PublicRequestPageContent bundle={bundle} />;
}

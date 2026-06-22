import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ starter?: string }>;
};

export default async function NewIntakeFormRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params.starter ? `?starter=${encodeURIComponent(params.starter)}` : "";
  redirect(`/settings/intake/specialized/new${query}`);
}

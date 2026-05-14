import { redirect } from "next/navigation";

export default async function SalesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  if (tab === "proposals") {
    redirect("/quotes");
  }

  redirect("/leads/inbox");
}

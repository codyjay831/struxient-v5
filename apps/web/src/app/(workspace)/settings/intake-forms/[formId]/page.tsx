import { redirect } from "next/navigation";

export default async function EditIntakeFormRedirectPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  redirect(`/settings/intake/forms/${formId}`);
}

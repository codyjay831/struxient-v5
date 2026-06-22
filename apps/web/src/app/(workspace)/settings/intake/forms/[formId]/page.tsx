import { IntakeFormEditorPage } from "../_lib/intake-form-editor-page";

export default async function IntakeFormEditorRoutePage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  return <IntakeFormEditorPage formId={formId} />;
}

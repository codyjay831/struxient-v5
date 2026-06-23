import { getRequestContextOrThrow } from "@/lib/auth-context";
import { ensureDefaultPublicIntakeFormDefinition } from "@/lib/intake/ensure-default-public-intake-form";
import { IntakeFormEditorPage } from "../_lib/intake-form-editor-page";

export const dynamic = "force-dynamic";

export default async function CustomerFieldsIntakePage() {
  const ctx = await getRequestContextOrThrow();
  const form = await ensureDefaultPublicIntakeFormDefinition(ctx.organizationId);

  return (
    <IntakeFormEditorPage formId={form.id} />
  );
}

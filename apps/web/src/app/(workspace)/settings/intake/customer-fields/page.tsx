import { redirect } from "next/navigation";
import { INTAKE_SPECIALIZED_PATH } from "@/lib/intake-settings-hierarchy";

export const dynamic = "force-dynamic";

export default async function CustomerFieldsIntakePage() {
  redirect(INTAKE_SPECIALIZED_PATH);
}

import { redirect } from "next/navigation";

export default function PublicRequestSettingsRedirectPage() {
  redirect("/settings/intake/public");
}

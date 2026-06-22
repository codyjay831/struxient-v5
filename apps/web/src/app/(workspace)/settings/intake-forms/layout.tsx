import type { ReactNode } from "react";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";

export default async function IntakeFormsSettingsLayout({ children }: { children: ReactNode }) {
  await getSettingsRequestContextOrThrow();
  return children;
}

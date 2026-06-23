import type { ReactNode } from "react";
import { IntakeSettingsLayoutClient } from "./intake-settings-layout-client";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";

export default async function IntakeSettingsLayout({ children }: { children: ReactNode }) {
  await getSettingsRequestContextOrThrow();
  return <IntakeSettingsLayoutClient>{children}</IntakeSettingsLayoutClient>;
}

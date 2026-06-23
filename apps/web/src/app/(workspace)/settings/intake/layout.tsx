/**
 * Customer intake settings module layout.
 * LOCKED: see `.cursor/rules/intake-settings-locked.mdc` — no AI changes without explicit user approval.
 */
import type { ReactNode } from "react";
import { IntakeSettingsLayoutClient } from "./intake-settings-layout-client";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";

export default async function IntakeSettingsLayout({ children }: { children: ReactNode }) {
  await getSettingsRequestContextOrThrow();
  return <IntakeSettingsLayoutClient>{children}</IntakeSettingsLayoutClient>;
}

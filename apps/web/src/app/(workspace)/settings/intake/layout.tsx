import type { ReactNode } from "react";
import { CustomerIntakeModuleNav } from "@/components/settings/customer-intake-module-nav";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";

export default async function IntakeSettingsLayout({ children }: { children: ReactNode }) {
  await getSettingsRequestContextOrThrow();
  return (
    <div className="mx-auto w-full max-w-7xl">
      <CustomerIntakeModuleNav className="mb-6" />
      {children}
    </div>
  );
}

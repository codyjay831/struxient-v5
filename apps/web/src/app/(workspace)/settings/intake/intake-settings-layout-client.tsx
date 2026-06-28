"use client";

import type { ReactNode } from "react";
import { CustomerIntakeSubnav } from "@/components/settings/customer-intake-subnav";

export const INTAKE_EDITOR_TOOLBAR_PORTAL_ID = "intake-editor-toolbar";
/** Staff intake tab: Save portals into the compact PageHeader actions row. */
export const STAFF_INTAKE_HEADER_ACTIONS_PORTAL_ID = "staff-intake-header-actions";

export function IntakeSettingsLayoutClient({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-3 border-b border-border pb-2">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CustomerIntakeSubnav variant="embedded" className="w-full min-w-0 sm:flex-1" />
          <div
            id={INTAKE_EDITOR_TOOLBAR_PORTAL_ID}
            className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

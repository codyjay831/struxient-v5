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
        <div className="flex items-center justify-between gap-3">
          <CustomerIntakeSubnav variant="embedded" className="min-w-0 flex-1" />
          <div
            id={INTAKE_EDITOR_TOOLBAR_PORTAL_ID}
            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

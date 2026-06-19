"use client";

import { useState, useTransition } from "react";
import { updateLeadVisitAccessDetailsAction } from "@/app/(workspace)/schedule/schedule-actions";
import { Button } from "@/components/ui/button";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import type {
  LeadVisitAccessSnapshot,
  LeadVisitSiteContactSnapshot,
} from "@/lib/scheduling/lead-visit-schemas";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { LeadVisitRequestStatus } from "@prisma/client";

const emptyAccessSnapshot = (): LeadVisitAccessSnapshot => ({
  someoneMustBeHome: false,
  gateCode: "",
  garageAccess: "",
  lockbox: "",
  pets: "",
  parking: "",
  callOnArrival: false,
  accessNotes: "",
});

const emptySiteContactSnapshot = (): LeadVisitSiteContactSnapshot => ({
  name: "",
  phone: "",
  email: "",
  relationship: "",
  notes: "",
});

function snapshotFromVisit(visit: LeadVisitRequestPayload): {
  access: LeadVisitAccessSnapshot;
  siteContact: LeadVisitSiteContactSnapshot;
} {
  return {
    access: {
      ...emptyAccessSnapshot(),
      ...visit.accessSnapshot,
      gateCode: visit.accessSnapshot?.gateCode ?? "",
      garageAccess: visit.accessSnapshot?.garageAccess ?? "",
      lockbox: visit.accessSnapshot?.lockbox ?? "",
      pets: visit.accessSnapshot?.pets ?? "",
      parking: visit.accessSnapshot?.parking ?? "",
      accessNotes: visit.accessSnapshot?.accessNotes ?? "",
    },
    siteContact: {
      ...emptySiteContactSnapshot(),
      ...visit.siteContactSnapshot,
      name: visit.siteContactSnapshot?.name ?? "",
      phone: visit.siteContactSnapshot?.phone ?? "",
      email: visit.siteContactSnapshot?.email ?? "",
      relationship: visit.siteContactSnapshot?.relationship ?? "",
      notes: visit.siteContactSnapshot?.notes ?? "",
    },
  };
}

export function LeadVisitAccessDetailsPanel({
  visit,
  onSaved,
}: {
  visit: LeadVisitRequestPayload;
  onSaved?: () => void;
}) {
  const canEdit =
    visit.canEditAccessDetails &&
    (visit.status === LeadVisitRequestStatus.PENDING ||
      visit.status === LeadVisitRequestStatus.CONFIRMED);
  const initial = snapshotFromVisit(visit);
  const [access, setAccess] = useState(initial.access);
  const [siteContact, setSiteContact] = useState(initial.siteContact);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!visit.canEditAccessDetails && !visit.accessSnapshot && !visit.siteContactSnapshot) {
    return null;
  }

  const readOnly = !canEdit;

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-surface-elevated p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
        Access & site contact
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(access.someoneMustBeHome)}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, someoneMustBeHome: event.target.checked }))
            }
          />
          Someone must be home
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(access.callOnArrival)}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, callOnArrival: event.target.checked }))
            }
          />
          Call on arrival
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={workspaceFormFieldLabelClass}>Gate code</span>
          <input
            className={workspaceFormControlClass}
            value={access.gateCode ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, gateCode: event.target.value }))
            }
          />
        </label>
        <label>
          <span className={workspaceFormFieldLabelClass}>Lockbox</span>
          <input
            className={workspaceFormControlClass}
            value={access.lockbox ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, lockbox: event.target.value }))
            }
          />
        </label>
        <label>
          <span className={workspaceFormFieldLabelClass}>Garage access</span>
          <input
            className={workspaceFormControlClass}
            value={access.garageAccess ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, garageAccess: event.target.value }))
            }
          />
        </label>
        <label>
          <span className={workspaceFormFieldLabelClass}>Parking</span>
          <input
            className={workspaceFormControlClass}
            value={access.parking ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setAccess((current) => ({ ...current, parking: event.target.value }))
            }
          />
        </label>
      </div>

      <label>
        <span className={workspaceFormFieldLabelClass}>Access notes</span>
        <textarea
          className={workspaceFormControlClass}
          rows={2}
          value={access.accessNotes ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            setAccess((current) => ({ ...current, accessNotes: event.target.value }))
          }
        />
      </label>

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold text-foreground-muted">Site contact</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={workspaceFormFieldLabelClass}>Name</span>
            <input
              className={workspaceFormControlClass}
              value={siteContact.name ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                setSiteContact((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            <span className={workspaceFormFieldLabelClass}>Phone</span>
            <input
              className={workspaceFormControlClass}
              value={siteContact.phone ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                setSiteContact((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </label>
          <label>
            <span className={workspaceFormFieldLabelClass}>Email</span>
            <input
              className={workspaceFormControlClass}
              value={siteContact.email ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                setSiteContact((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label>
            <span className={workspaceFormFieldLabelClass}>Relationship</span>
            <input
              className={workspaceFormControlClass}
              value={siteContact.relationship ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                setSiteContact((current) => ({ ...current, relationship: event.target.value }))
              }
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className={workspaceFormFieldLabelClass}>Site contact notes</span>
          <textarea
            className={workspaceFormControlClass}
            rows={2}
            value={siteContact.notes ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setSiteContact((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
      </div>

      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await updateLeadVisitAccessDetailsAction(visit.id, {
                accessSnapshot: access,
                siteContactSnapshot: siteContact,
                sourceSurface: "lead",
                expectedUpdatedAt: visit.updatedAt,
              });
              if (result.error) {
                setError(result.error);
                return;
              }
              onSaved?.();
            });
          }}
        >
          {isPending ? "Saving..." : "Save access details"}
        </Button>
      ) : null}
    </div>
  );
}

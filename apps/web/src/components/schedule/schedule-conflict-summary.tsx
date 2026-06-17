"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { ScheduleConflict } from "@/lib/schedule-query";

export function ScheduleConflictSummary({ conflicts }: { conflicts: ScheduleConflict[] }) {
  const [expanded, setExpanded] = useState(false);

  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-warning"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        <span>
          {conflicts.length} schedule conflict{conflicts.length === 1 ? "" : "s"}
        </span>
        <ChevronDown
          className={`ml-auto size-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <ul className="mt-2 space-y-1 border-t border-warning/20 pt-2">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.userId}-${conflict.eventIds.join("-")}`}
              className="text-xs text-warning"
            >
              <span className="font-medium">{conflict.userLabel}</span>: {conflict.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

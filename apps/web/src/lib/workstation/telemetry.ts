/**
 * Simple telemetry for Workstation Slice 1.
 * 
 * In a real app, this would send events to PostHog, Segment, or a custom backend.
 */
export const workstationTelemetry = {
  trackLaneClick: (lane: string, itemId: string, itemKind: string) => {
    console.log(`[Telemetry] Lane Click: lane=${lane}, itemId=${itemId}, itemKind=${itemKind}`);
  },
  trackActionClick: (signalId: string, action: string) => {
    console.log(`[Telemetry] Action Click: signalId=${signalId}, action=${action}`);
  },
  trackSurfaceOpen: (surface: string, id: string, entryPoint: "workstation" | "record") => {
    console.log(`[Telemetry] Surface Open: surface=${surface}, id=${id}, entryPoint=${entryPoint}`);
  },
  trackBounceToRecord: (surface: string, id: string) => {
    console.log(`[Telemetry] Bounce to Record: surface=${surface}, id=${id}`);
  },
  trackRecoveryActionOpened: (actionKind: string, issueId: string) => {
    console.log(
      `[Telemetry] recovery_action_opened: actionKind=${actionKind}, issueId=${issueId}`,
    );
  },
  trackRecoveryResumeFromWs: (issueId: string) => {
    console.log(`[Telemetry] recovery_resume_from_ws: issueId=${issueId}`);
  },
};

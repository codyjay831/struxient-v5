/**
 * Simple feature flag system for Slice 1 rollout.
 */
export const FEATURE_FLAGS = {
  USE_LEAD_COMMERCIAL_SURFACE: process.env.NEXT_PUBLIC_USE_LEAD_COMMERCIAL_SURFACE === "true",
};

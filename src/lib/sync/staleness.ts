/**
 * Staleness thresholds for sync-derived data (Task 8 / p2-globals.md Global
 * Constraints: "recovery > 3h, activities > 1h"). Consumed by Task 12's
 * `StaleMarker` component and any freshness checks in the sync layer.
 */
export const STALE_RECOVERY_MS = 3 * 3600e3;
export const STALE_ACTIVITIES_MS = 3600e3;

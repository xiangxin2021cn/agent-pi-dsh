/** Persisted choices shared by the profile monitor and its settings UI. */
export declare const UPDATE_CHECK_INTERVAL_HOURS: readonly [6, 12, 72, 168];
export type UpdateCheckIntervalHours = typeof UPDATE_CHECK_INTERVAL_HOURS[number];
export declare const DEFAULT_UPDATE_CHECK_INTERVAL_HOURS: UpdateCheckIntervalHours;
export declare function isUpdateCheckIntervalHours(value: unknown): value is UpdateCheckIntervalHours;

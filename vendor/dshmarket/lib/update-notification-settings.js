/** Persisted choices shared by the profile monitor and its settings UI. */
export const UPDATE_CHECK_INTERVAL_HOURS = [6, 12, 72, 168];
export const DEFAULT_UPDATE_CHECK_INTERVAL_HOURS = 6;
export function isUpdateCheckIntervalHours(value) {
    return typeof value === 'number' && UPDATE_CHECK_INTERVAL_HOURS.includes(value);
}

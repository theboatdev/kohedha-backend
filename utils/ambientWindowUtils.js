const AMBIENT_TIMEZONE = "Asia/Colombo";

/**
 * Checks whether the current moment falls inside an ambient deal's active window.
 * Time is evaluated in Asia/Colombo (fixed for all vendors).
 *
 * Behaviour: 
 *  - No daysOfWeek AND no startTime/endTime → always active (always returns true).
 *  - daysOfWeek present → current day must be in the set.
 *  - startTime AND endTime present → time must be within the range.
 *    - startTime <= endTime: same-day window (e.g. 09:00–17:00).
 *    - startTime > endTime: overnight window (e.g. 22:00–02:00).
 *  - Only one of startTime/endTime set → ignore time constraint (treat as all-day). 
 */
export function isActiveNow(activeWindow) {
  if (!activeWindow) return false;

  const { daysOfWeek = [], startTime, endTime } = activeWindow;

  const hasNoDays = !daysOfWeek || daysOfWeek.length === 0;
  const hasNoTime = !startTime || !endTime;

  // No constraints at all → always surfaced
  if (hasNoDays && hasNoTime) return true;

  const now = new Date();

  // Resolve current day-of-week and HH:mm in the target timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AMBIENT_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === "weekday")?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDay = weekdayMap[weekdayStr];

  // Intl can return "24" for midnight in some environments
  let hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hourStr === "24") hourStr = "00";

  const currentTime = `${hourStr.padStart(2, "0")}:${minuteStr.padStart(2, "0")}`;

  // Day-of-week check
  if (!hasNoDays && !daysOfWeek.includes(currentDay)) return false;

  // Time-range check (only when both boundaries are present)
  if (!hasNoTime) {
    if (startTime <= endTime) {
      // Same-day window: e.g. 12:00–15:00
      return currentTime >= startTime && currentTime < endTime;
    } else {
      // Overnight window: e.g. 22:00–02:00
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  return true;
}

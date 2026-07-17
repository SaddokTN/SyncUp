/* ============================================================
   SyncUp — Timezone helpers
   ------------------------------------------------------------
   Availability is stored in the DB as UTC weekday/hour. Each user's grid is
   rendered and edited in THEIR local time, then converted to UTC on save
   (and back to local on load) so overlap across timezones is meaningful.

   LIMITATION (documented, not hidden): this uses the CURRENT UTC offset for
   the user's IANA timezone, not the historically-correct offset for every
   day of the week — so a recurring Tuesday slot near a DST transition can
   be off by an hour for a few days a year. For a "roughly what time works
   weekly" scheduling tool this tradeoff is reasonable; a booking system
   handling exact calendar dates should use a full library (e.g. Luxon)
   instead of this lightweight approach.
   ============================================================ */

/** Offset in hours such that: localTime = utcTime + offset */
function getUtcOffsetHours(timeZone) {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone }));
    return Math.round((local - utc) / 3600000);
  } catch {
    return 0; // unknown/invalid timezone -> treat as UTC rather than throw
  }
}

function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** weekday: 0=Mon..6=Sun. Wraps correctly across week boundaries. */
function shiftWeekdayHour(weekday, hour, offsetHours) {
  const total = ((weekday * 24 + hour + offsetHours) % 168 + 168) % 168;
  return { weekday: Math.floor(total / 24), hour: total % 24 };
}

function localToUtc(weekday, hour, timeZone) {
  return shiftWeekdayHour(weekday, hour, -getUtcOffsetHours(timeZone));
}

function utcToLocal(weekday, hour, timeZone) {
  return shiftWeekdayHour(weekday, hour, getUtcOffsetHours(timeZone));
}

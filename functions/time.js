/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const TIME_ZONE = "Pacific/Auckland";

// Calendar date (YYYY-MM-DD) in NZ local time for the given instant.
function getNZDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// UTC offset (e.g. "+13:00" in NZDT, "+12:00" in NZST) in effect in NZ at the given instant.
function getNZOffset(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName").value; // e.g. "GMT+13:00"
  const match = name.match(/^GMT(?:([+-]\d{2}):(\d{2}))?$/);
  if (!match) throw new Error(`Unexpected time zone offset format: ${name}`);
  return match[1] ? `${match[1]}:${match[2]}` : "+00:00";
}

// Instant of 00:00 NZ local time on the NZ calendar day containing the given instant.
function getNZStartOfDay(date = new Date()) {
  // Offset taken at the given instant; can be an hour off only on a daylight-saving changeover day.
  return new Date(`${getNZDate(date)}T00:00:00${getNZOffset(date)}`);
}

// Human-readable NZ local date and time, e.g. "Thursday, 22 October 2026 at 9:00 am".
function formatNZNow(date = new Date()) {
  return date.toLocaleString("en-NZ", {
    timeZone: TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  });
}

// Minutes since 00:00 NZ local time for the given instant.
function getNZMinutesOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour * 60 + minute;
}

// Instant of 00:00 NZ local time on the given YYYY-MM-DD date.
function getNZDayStart(dateStr) {
  // Offset taken at 00:00-01:00 NZ on that date, before any 2-3am daylight-saving changeover.
  const probe = new Date(Date.parse(`${dateStr}T00:00:00Z`) - 12 * 60 * 60 * 1000);
  return new Date(`${dateStr}T00:00:00${getNZOffset(probe)}`);
}

// YYYY-MM-DD shifted by n calendar days (n may be negative).
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = {TIME_ZONE, getNZDate, getNZOffset, getNZStartOfDay, formatNZNow, getNZMinutesOfDay, getNZDayStart, addDays};

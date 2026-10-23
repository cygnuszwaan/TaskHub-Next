/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Date and time helpers for an IANA time zone given by the caller (the owner's configured zone). The zone is
// always the first argument and is required: Intl would silently fall back to the server's zone (UTC) if it
// were missing.

function requireZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) throw new Error("A time zone is required");
  return timeZone;
}

// Local calendar date (YYYY-MM-DD) and minutes since local midnight for the given instant.
function localParts(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: requireZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute"))};
}

// Calendar date (YYYY-MM-DD) in the zone for the given instant.
function localDate(timeZone, date = new Date()) {
  return localParts(timeZone, date).date;
}

// Minutes since 00:00 local time for the given instant.
function localMinutesOfDay(timeZone, date) {
  return localParts(timeZone, date).minutes;
}

// UTC offset in minutes (e.g. 780 for +13:00, -420 for -07:00) in effect in the zone at the given instant.
function utcOffsetMinutes(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: requireZone(timeZone),
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName").value; // e.g. "GMT+13:00", "GMT-03:30" or "GMT"
  const match = name.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!match) throw new Error(`Unexpected time zone offset format: ${name}`);
  if (!match[1]) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

// UTC offset as "+13:00" / "-07:00" / "+00:00" in effect in the zone at the given instant.
function utcOffset(timeZone, date = new Date()) {
  const minutes = utcOffsetMinutes(timeZone, date);
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

// First instant of the given YYYY-MM-DD local date: 00:00, or the first moment after a changeover that skips
// midnight. On a changeover day the offset used is the one in effect at that moment, so the day is 23 or 25
// hours long.
function localDayStart(timeZone, dateStr) {
  const utcMidnight = Date.parse(`${dateStr}T00:00:00Z`);
  let guess = utcMidnight - utcOffsetMinutes(timeZone, new Date(utcMidnight)) * 60000;
  guess = utcMidnight - utcOffsetMinutes(timeZone, new Date(guess)) * 60000;
  // A changeover at midnight itself (a clock jumping 00:00 to 01:00) can leave the guess on the previous date.
  for (let i = 0; i < 16 && localDate(timeZone, new Date(guess)) < dateStr; i++) guess += 15 * 60000;
  return new Date(guess);
}

// The instant at which the zone's clock reads `minutes` past midnight on the YYYY-MM-DD local date (e.g. 480 for
// 8:00), or null when no instant has that reading (a clock that skips over it). When a clock set back repeats the
// reading, the instant found is one of the two; changeovers happen at night, so this does not matter for working hours.
function localInstant(timeZone, dateStr, minutes) {
  const wall = Date.parse(`${dateStr}T00:00:00Z`) + minutes * 60000;
  let guess = wall - utcOffsetMinutes(timeZone, new Date(wall)) * 60000;
  guess = wall - utcOffsetMinutes(timeZone, new Date(guess)) * 60000;
  const parts = localParts(timeZone, new Date(guess));
  return parts.date === dateStr && parts.minutes === minutes ? new Date(guess) : null;
}

// The instant as ISO 8601 in the zone's local time with its UTC offset, to the minute, e.g. "2026-10-22T09:00:00+13:00".
function formatLocalISO(timeZone, date) {
  const {date: day, minutes} = localParts(timeZone, date);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${day}T${hh}:${mm}:00${utcOffset(timeZone, date)}`;
}

// First instant of the local day containing the given instant.
function startOfLocalDay(timeZone, date = new Date()) {
  return localDayStart(timeZone, localDate(timeZone, date));
}

// Human-readable local date and time, e.g. "Thursday, 22 October 2026 at 9:00 am".
function formatLocalNow(timeZone, date = new Date()) {
  return date.toLocaleString("en-NZ", {
    timeZone: requireZone(timeZone),
    dateStyle: "full",
    timeStyle: "short",
  });
}

// YYYY-MM-DD shifted by n calendar days (n may be negative). Zone-independent.
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = {localParts, localDate, localMinutesOfDay, utcOffsetMinutes, utcOffset, localInstant, formatLocalISO, localDayStart, startOfLocalDay, formatLocalNow, addDays};

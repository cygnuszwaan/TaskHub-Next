/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localParts} = require("./time");

const INTERVALS = [15, 30, 60, 120, 240];
const FREQUENCIES = ["DAILY", "INTERVAL"];
// INTERVAL runs happen only inside this local window (the engine schedules nothing outside 8:00-19:00).
const WINDOW_START_MINUTES = 8 * 60;
const WINDOW_END_MINUTES = 19 * 60;
// The dispatcher ticks every 15 minutes and a tick can fire a little early or late, so an interval counts as
// elapsed when it is within this grace of the target.
const TICK_GRACE_MS = 60 * 1000;

// How far ahead a run schedules. The upper bound keeps the prompt (it lists every busy window in range) small.
const MIN_SCHEDULE_DAYS = 1;
const MAX_SCHEDULE_DAYS = 28;

// Gap left between scheduled tasks (minutes), and the lunch break's length range (minutes).
const MIN_GAP_MINUTES = 0;
const MAX_GAP_MINUTES = 60;
const MIN_LUNCH_MINUTES = 5;
const MAX_LUNCH_MINUTES = 180;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ZONE_PATTERN = /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/;

const DEFAULTS = Object.freeze({
  location: Object.freeze({name: "Whangaparāoa, Auckland", latitude: -36.63, longitude: 174.78}),
  timeZone: "Pacific/Auckland",
  scheduleDays: 7,
  gapMinutes: 0,
  lunch: Object.freeze({enabled: false, time: "12:00", minutes: 30}),
  schedule: Object.freeze({enabled: true, frequency: "DAILY", time: "20:00", intervalMinutes: 60}),
  lastAutoRunAt: null,
  lastRunFingerprint: null,
});

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Each check returns the cleaned value, or throws an Error whose message names the problem.
function checkName(v) {
  if (typeof v !== "string" || !v.trim()) throw new Error("location.name must be a non-empty string");
  if (v.trim().length > 100) throw new Error("location.name must be at most 100 characters");
  return v.trim();
}

function checkNumber(v, field, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`${field} must be a number from ${min} to ${max}`);
  }
  return v;
}

function checkTimeZone(v) {
  if (typeof v !== "string" || !ZONE_PATTERN.test(v)) throw new Error("timeZone must be an IANA time zone such as Pacific/Auckland");
  try {
    new Intl.DateTimeFormat("en-NZ", {timeZone: v});
  } catch (err) {
    throw new Error(`timeZone is not a known time zone: ${v}`);
  }
  return v;
}

function checkScheduleDays(v) {
  if (!Number.isInteger(v) || v < MIN_SCHEDULE_DAYS || v > MAX_SCHEDULE_DAYS) {
    throw new Error(`scheduleDays must be a whole number from ${MIN_SCHEDULE_DAYS} to ${MAX_SCHEDULE_DAYS}`);
  }
  return v;
}

function checkTime(v) {
  if (typeof v !== "string" || !TIME_PATTERN.test(v)) throw new Error("schedule.time must be HH:MM in 24-hour time");
  return v;
}

function checkGapMinutes(v) {
  if (!Number.isInteger(v) || v < MIN_GAP_MINUTES || v > MAX_GAP_MINUTES) {
    throw new Error(`gapMinutes must be a whole number from ${MIN_GAP_MINUTES} to ${MAX_GAP_MINUTES}`);
  }
  return v;
}

function checkLunchEnabled(v) {
  if (typeof v !== "boolean") throw new Error("lunch.enabled must be true or false");
  return v;
}

function checkLunchTime(v) {
  if (typeof v !== "string" || !TIME_PATTERN.test(v)) throw new Error("lunch.time must be HH:MM in 24-hour time");
  return v;
}

function checkLunchMinutes(v) {
  if (!Number.isInteger(v) || v < MIN_LUNCH_MINUTES || v > MAX_LUNCH_MINUTES) {
    throw new Error(`lunch.minutes must be a whole number from ${MIN_LUNCH_MINUTES} to ${MAX_LUNCH_MINUTES}`);
  }
  return v;
}

function checkFrequency(v) {
  if (!FREQUENCIES.includes(v)) throw new Error(`schedule.frequency must be one of ${FREQUENCIES.join(", ")}`);
  return v;
}

function checkInterval(v) {
  if (!INTERVALS.includes(v)) throw new Error(`schedule.intervalMinutes must be one of ${INTERVALS.join(", ")}`);
  return v;
}

function checkEnabled(v) {
  if (typeof v !== "boolean") throw new Error("schedule.enabled must be true or false");
  return v;
}

// Editable fields and their checks, addressed by path. Anything not listed (the run state in particular) can
// never be set through an update.
const EDITABLE = [
  ["location", "name", checkName],
  ["location", "latitude", (v) => checkNumber(v, "location.latitude", -90, 90)],
  ["location", "longitude", (v) => checkNumber(v, "location.longitude", -180, 180)],
  ["timeZone", null, checkTimeZone],
  ["scheduleDays", null, checkScheduleDays],
  ["gapMinutes", null, checkGapMinutes],
  ["lunch", "enabled", checkLunchEnabled],
  ["lunch", "time", checkLunchTime],
  ["lunch", "minutes", checkLunchMinutes],
  ["schedule", "enabled", checkEnabled],
  ["schedule", "frequency", checkFrequency],
  ["schedule", "time", checkTime],
  ["schedule", "intervalMinutes", checkInterval],
];

function readField(source, group, key) {
  if (key === null) return source ? source[group] : undefined;
  return isPlainObject(source && source[group]) ? source[group][key] : undefined;
}

function writeField(target, group, key, value) {
  if (key === null) target[group] = value;
  else target[group][key] = value;
}

function isoOrNull(v) {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
}

// Full settings from whatever is stored (possibly nothing). A missing or unusable stored field falls back to
// its default, so a hand-edited document can never break the app. Pure: returns a new object.
function mergeSettings(stored) {
  const out = {location: {...DEFAULTS.location}, timeZone: DEFAULTS.timeZone, scheduleDays: DEFAULTS.scheduleDays, gapMinutes: DEFAULTS.gapMinutes, lunch: {...DEFAULTS.lunch}, schedule: {...DEFAULTS.schedule}};
  for (const [group, key, check] of EDITABLE) {
    const value = readField(stored, group, key);
    if (value === undefined) continue;
    try {
      writeField(out, group, key, check(value));
    } catch (err) {
      // keep the default
    }
  }
  out.lastAutoRunAt = isoOrNull(stored && stored.lastAutoRunAt);
  out.lastRunFingerprint = typeof (stored && stored.lastRunFingerprint) === "string" ? stored.lastRunFingerprint : null;
  return out;
}

// Apply a partial update (only the editable fields present in `patch`) to the current settings. Returns
// {settings} or {error}; nothing is applied if any provided field is invalid. Run state is carried over.
function applySettingsUpdate(current, patch) {
  if (!isPlainObject(patch)) return {error: "Settings update must be an object"};
  for (const group of ["location", "lunch", "schedule"]) {
    if (patch[group] !== undefined && !isPlainObject(patch[group])) return {error: `${group} must be an object`};
  }
  const next = mergeSettings(current);
  try {
    for (const [group, key, check] of EDITABLE) {
      const value = readField(patch, group, key);
      if (value !== undefined) writeField(next, group, key, check(value));
    }
  } catch (err) {
    return {error: err.message};
  }
  next.lastAutoRunAt = current.lastAutoRunAt || null;
  next.lastRunFingerprint = current.lastRunFingerprint || null;
  return {settings: next};
}

// Whether the automatic run should fire now. Called on every 15-minute tick with settings from mergeSettings.
//   Disabled: never.
//   DAILY: once the local time has reached schedule.time, if the last run was not on today's local date.
//   INTERVAL: within the 8:00-19:00 local window, once intervalMinutes have passed since the last run
//             (a run is also due if there has never been one).
function isRunDue(settings, now = new Date()) {
  const {schedule, timeZone} = settings;
  if (!schedule.enabled) return false;
  const last = settings.lastAutoRunAt ? new Date(settings.lastAutoRunAt) : null;
  const local = localParts(timeZone, now);
  if (schedule.frequency === "DAILY") {
    const [h, m] = schedule.time.split(":").map(Number);
    if (local.minutes < h * 60 + m) return false;
    return !last || localParts(timeZone, last).date !== local.date;
  }
  if (local.minutes < WINDOW_START_MINUTES || local.minutes >= WINDOW_END_MINUTES) return false;
  return !last || now - last >= schedule.intervalMinutes * 60 * 1000 - TICK_GRACE_MS;
}

// Decide whether this tick starts a run and, if so, mark the run as started. Returns {due, settings}: when due,
// `settings` is the input with `lastAutoRunAt` set to `now`; otherwise it is the input unchanged. The mark counts
// the attempt, not its success, so a failing run is not retried on every tick (it waits for the next due time).
function claimRun(settings, now = new Date()) {
  if (!isRunDue(settings, now)) return {due: false, settings};
  return {due: true, settings: {...settings, lastAutoRunAt: now.toISOString()}};
}

module.exports = {MIN_SCHEDULE_DAYS, MAX_SCHEDULE_DAYS, MIN_GAP_MINUTES, MAX_GAP_MINUTES, MIN_LUNCH_MINUTES, MAX_LUNCH_MINUTES, INTERVALS, FREQUENCIES, TICK_GRACE_MS, DEFAULTS, mergeSettings, applySettingsUpdate, isRunDue, claimRun};

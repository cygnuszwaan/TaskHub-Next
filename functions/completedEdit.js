/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {cleanTags} = require("./tasks");
const {localInstant} = require("./time");
const {randomUUID} = require("crypto");
const {normalizeComments} = require("./comments");
const {normalizeTravelKm} = require("./travel");
const {normalizePhone, normalizeEmail} = require("./contact");
const {normalizeMaterials} = require("./materials");

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^([01]\d|2[0-3]):([0-5]\d)$/;
// Most tracked time a correction may set (1000 hours), most estimate (10000 minutes), most tags kept.
const MAX_TRACKED_SECONDS = 3600000;
const MAX_ESTIMATE_MINUTES = 10000;
const MAX_TAGS = 20;
// A completion cannot be set further ahead than this (clock slack), nor before the year 2000.
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const EARLIEST = Date.parse("2000-01-01T00:00:00Z");

// Whether a value can be the id of an archive document (what the page got from getCompletedTasks). Pure.
function isArchiveId(id) {
  return typeof id === "string" && id !== "" && id.length <= 200 && !id.includes("/");
}

// A correction to an archived completion. Pure: no I/O, the row is not modified.
//   row:     the archive document as stored (a Task plus completedAt and its history)
//   fields:  what the owner changed; only these keys are read, any other (title, recurrence, history, ...) is ignored:
//            priority (HIGH, MEDIUM or LOW), estimatedMinutes (a whole number from 1 to MAX_ESTIMATE_MINUTES),
//            trackedSeconds (0 to MAX_TRACKED_SECONDS, whole seconds; 0 makes the estimate count), tags (a list, cleaned
//            as the model's tags are, at most MAX_TAGS), comments (text, trimmed and cut to 2000 characters; null or empty
//            text removes them), travelKm (kilometres, at most one decimal, 0.1 to 10000; null, empty or 0 removes it), phone and email (as a task's, see contact.js: null or empty text removes them), materials (a list of texts, or of {text, cost?} objects, a plain record of what was used: each trimmed and cut
//            to 100 characters, blanks dropped, at most 30, a cost kept when usable as in materials.js; null or an empty list removes them; stored as a task's materials are,
//            every item checked), projectId (a current project, or null or "" for none; the id the row
//            already has counts as unchanged even when that project is gone), and the completion time as the two
//            keys completedDate (YYYY-MM-DD) and completedTime (HH:MM) together, the zone's wall clock
//   options: {projectIds: ids of the current projects, timeZone, now: Date}
// Returns {error} (text for the owner) for the first unusable value or when there is nothing to change, otherwise
// {set, remove}: `set` the fields to write (completedAt as a Date) and `remove` the fields to delete. The history the row
// carries (completedCount, recentSeconds) is a snapshot of the job at that completion and is never changed here.
function applyCompletedEdit(row, fields, options) {
  const {projectIds = [], timeZone, now = new Date(), makeId = randomUUID} = options || {};
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {error: "Nothing to change"};
  const set = {};
  const remove = [];

  if ("priority" in fields) {
    if (!PRIORITIES.includes(fields.priority)) return {error: "Priority must be HIGH, MEDIUM or LOW"};
    set.priority = fields.priority;
  }
  if ("estimatedMinutes" in fields) {
    const n = fields.estimatedMinutes;
    if (!Number.isFinite(n) || n < 1 || Math.round(n) > MAX_ESTIMATE_MINUTES) return {error: `Estimate must be 1 to ${MAX_ESTIMATE_MINUTES} minutes`};
    set.estimatedMinutes = Math.round(n);
  }
  if ("trackedSeconds" in fields) {
    const n = fields.trackedSeconds;
    if (!Number.isFinite(n) || n < 0 || Math.round(n) > MAX_TRACKED_SECONDS) return {error: "Time must be 0 to 1000 hours"};
    set.trackedSeconds = Math.round(n);
  }
  if ("tags" in fields) {
    if (!Array.isArray(fields.tags)) return {error: "Tags must be a list"};
    set.tags = cleanTags(fields.tags, MAX_TAGS);
  }
  if ("comments" in fields) {
    const comments = normalizeComments(fields.comments);
    if (comments === undefined) return {error: "Comments must be text"};
    if (comments === null) {
      if (row && row.comments !== undefined) remove.push("comments");
    } else {
      set.comments = comments;
    }
  }
  for (const [key, normalize, label] of [["phone", normalizePhone, "Phone must be text of at most 40 characters"], ["email", normalizeEmail, "Email must be an address of at most 100 characters"]]) {
    if (!(key in fields)) continue;
    const value = normalize(fields[key]);
    if (value === undefined) return {error: label};
    if (value === null) {
      if (row && row[key] !== undefined) remove.push(key);
    } else {
      set[key] = value;
    }
  }
  if ("travelKm" in fields) {
    const travelKm = normalizeTravelKm(fields.travelKm);
    if (travelKm === undefined) return {error: "Travel must be a distance in km, 0 to 10000"};
    if (travelKm === null) {
      if (row && row.travelKm !== undefined) remove.push("travelKm");
    } else {
      set.travelKm = travelKm;
    }
  }
  if ("materials" in fields) {
    const given = fields.materials;
    if (given !== null && !Array.isArray(given)) return {error: "Materials must be a list"};
    const items = given === null ? null : given
        .map((t) => (typeof t === "string" ? {text: t} : t))
        .filter((t) => t && typeof t === "object" && typeof t.text === "string");
    const cleaned = items === null ? null : normalizeMaterials(items, makeId);
    if (cleaned === null) {
      if (row && row.materials !== undefined) remove.push("materials");
    } else {
      set.materials = cleaned.map((m) => ({...m, checked: true}));
    }
  }
  if ("projectId" in fields) {
    const id = fields.projectId;
    if (id === null || id === "") {
      if (row && (row.projectId !== undefined || row.projectOrder !== undefined)) remove.push("projectId", "projectOrder");
    } else if (typeof id === "string" && projectIds.includes(id)) {
      if (!row || row.projectId !== id) {
        set.projectId = id;
        remove.push("projectOrder");
      }
    } else if (!(typeof id === "string" && row && row.projectId === id)) {
      return {error: "Unknown project"};
    }
  }
  if ("completedDate" in fields || "completedTime" in fields) {
    const {completedDate: date, completedTime: time} = fields;
    const match = typeof time === "string" ? time.match(TIME_ONLY) : null;
    if (typeof date !== "string" || !DATE_ONLY.test(date) || !match) return {error: "The completion needs a date and a time"};
    const instant = localInstant(timeZone, date, Number(match[1]) * 60 + Number(match[2]));
    if (!instant) return {error: "That time does not exist in your time zone"};
    if (instant.getTime() > now.getTime() + FUTURE_SLACK_MS) return {error: "A task cannot be completed in the future"};
    if (instant.getTime() < EARLIEST) return {error: "That date is too far back"};
    set.completedAt = instant;
  }

  if (Object.keys(set).length === 0 && remove.length === 0) return {error: "Nothing to change"};
  return {set, remove};
}

module.exports = {MAX_TRACKED_SECONDS, MAX_ESTIMATE_MINUTES, MAX_TAGS, isArchiveId, applyCompletedEdit};

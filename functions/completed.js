/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {getNZDate, getNZDayStart, addDays} = require("./time");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// The summary covers this many NZ weeks (Monday start), the current one included.
const SUMMARY_WEEKS = 8;
// Most archive rows read for one summary.
const SUMMARY_MAX_ROWS = 1000;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

// How many completed tasks to return: a whole number from 1 to MAX_LIMIT, DEFAULT_LIMIT when missing or invalid.
function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// A completedAt value as an ISO string: Firestore Timestamps (anything with toDate), Dates and ISO strings
// are accepted; anything else, including a missing value, becomes "".
function toIso(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// Archive documents (a Task plus completedAt) as plain JSON for the client. Pure: the input is not modified.
function serializeCompleted(rows) {
  return rows.map((row) => ({...row, completedAt: toIso(row.completedAt)}));
}

// Monday (YYYY-MM-DD) of the week containing the given YYYY-MM-DD date.
function weekStartOf(dateStr) {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((dow + 6) % 7));
}

// Monday (YYYY-MM-DD, NZ) of the oldest week the summary covers.
function firstSummaryWeek(now = new Date(), weeks = SUMMARY_WEEKS) {
  return addDays(weekStartOf(getNZDate(now)), -7 * (weeks - 1));
}

// Instant the summary window opens: 00:00 NZ on the Monday of its oldest week.
function summaryWindowStart(now = new Date(), weeks = SUMMARY_WEEKS) {
  return getNZDayStart(firstSummaryWeek(now, weeks));
}

function minutesOf(row) {
  return Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 0;
}

// Totals for completed tasks over the last `weeks` NZ weeks. Pure: no I/O.
//   rows: archive documents (a Task plus completedAt as a Timestamp, Date or ISO string)
// Rows with no valid completedAt, or outside the window, are ignored. Returns
//   {since, totalCount, totalMinutes, weeks: [{weekStart, count, minutes}] oldest first, every week present,
//    byPriority: [{priority, count, minutes}] HIGH, MEDIUM, LOW,
//    byTag: [{tag, count, minutes}] most completed first, then most minutes, then name}.
// Tags group case-insensitively (first spelling seen is shown) and count once per task; tasks without tags are not in byTag.
function summarizeCompleted(rows, now = new Date(), weeks = SUMMARY_WEEKS) {
  const since = firstSummaryWeek(now, weeks);
  const buckets = new Map();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(since, 7 * i), {count: 0, minutes: 0});
  const priorities = new Map(PRIORITIES.map((p) => [p, {count: 0, minutes: 0}]));
  const tags = new Map();
  let totalCount = 0;
  let totalMinutes = 0;

  for (const row of rows) {
    const iso = toIso(row && row.completedAt);
    if (!iso) continue;
    const bucket = buckets.get(weekStartOf(getNZDate(new Date(iso))));
    if (!bucket) continue;
    const minutes = minutesOf(row);
    bucket.count++;
    bucket.minutes += minutes;
    totalCount++;
    totalMinutes += minutes;
    const priority = priorities.get(row.priority);
    if (priority) {
      priority.count++;
      priority.minutes += minutes;
    }
    const seen = new Set();
    for (const raw of Array.isArray(row.tags) ? row.tags : []) {
      const tag = typeof raw === "string" ? raw.trim() : "";
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      const entry = tags.get(key) || {tag, count: 0, minutes: 0};
      entry.count++;
      entry.minutes += minutes;
      tags.set(key, entry);
    }
  }

  return {
    since,
    totalCount,
    totalMinutes,
    weeks: [...buckets].map(([weekStart, v]) => ({weekStart, ...v})),
    byPriority: [...priorities].map(([priority, v]) => ({priority, ...v})),
    byTag: [...tags.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || a.tag.localeCompare(b.tag)),
  };
}

module.exports = {DEFAULT_LIMIT, MAX_LIMIT, SUMMARY_WEEKS, SUMMARY_MAX_ROWS, clampLimit, toIso, serializeCompleted, weekStartOf, firstSummaryWeek, summaryWindowStart, summarizeCompleted};

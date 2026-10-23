/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localDate, localDayStart, addDays} = require("./time");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// The summary covers this many local weeks (Monday start), the current one included.
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

// Monday (YYYY-MM-DD, local) of the oldest week the summary covers.
function firstSummaryWeek(timeZone, now = new Date(), weeks = SUMMARY_WEEKS) {
  return addDays(weekStartOf(localDate(timeZone, now)), -7 * (weeks - 1));
}

// Instant the summary window opens: 00:00 local on the Monday of its oldest week.
function summaryWindowStart(timeZone, now = new Date(), weeks = SUMMARY_WEEKS) {
  return localDayStart(timeZone, firstSummaryWeek(timeZone, now, weeks));
}

function minutesOf(row) {
  return Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 0;
}

// Streaks of local days with at least one completion, within the summary window. Pure: no I/O.
//   days:  Set of YYYY-MM-DD local dates that had a completion
//   since: first date of the window; today: the current local date
// The current streak is the run of consecutive days ending today, or ending yesterday when today has none yet (the
// day is not over, so it does not break the streak); 0 when neither day has a completion. The longest streak is the
// longest run anywhere in the window. A run that begins on `since` may have begun earlier, so its number is only a
// lower bound: `currentLimited` / `longestLimited` say so. Returns {current, longest, currentLimited, longestLimited}.
function computeStreaks(days, since, today) {
  const runs = []; // {start, length} for every run of consecutive days, oldest first
  for (let day = since; day <= today; day = addDays(day, 1)) {
    if (!days.has(day)) continue;
    const last = runs[runs.length - 1];
    if (last && addDays(last.end, 1) === day) {
      last.end = day;
      last.length++;
    } else {
      runs.push({start: day, end: day, length: 1});
    }
  }
  const yesterday = addDays(today, -1);
  const live = runs.find((r) => r.end === today || r.end === yesterday);
  const longest = runs.reduce((best, r) => (r.length > best ? r.length : best), 0);
  const longestLimited = runs.length > 0 && runs[0].start === since && runs[0].length === longest;
  return {current: live ? live.length : 0, longest, currentLimited: Boolean(live) && live.start === since, longestLimited};
}

// Totals for completed tasks over the last `weeks` local weeks in the given zone. Pure: no I/O.
//   rows:     archive documents (a Task plus completedAt as a Timestamp, Date or ISO string)
//   projects: the current projects [{id, name}], to name the project of each row
// Rows with no valid completedAt, or outside the window, are ignored. Returns
//   {since, totalCount, totalMinutes, weeks: [{weekStart, count, minutes}] oldest first, every week present,
//    byPriority: [{priority, count, minutes}] HIGH, MEDIUM, LOW,
//    byTag: [{tag, count, minutes}] most completed first, then most minutes, then name,
//    byProject: [{projectId, name, count, minutes}] in the same order, a deleted project's tasks together in one
//      entry with projectId and name null, last on a tie,
//    streak: {current, longest, currentLimited, longestLimited} (see computeStreaks)}.
// Tags group case-insensitively (first spelling seen is shown) and count once per task; tasks without tags are not in byTag.
// Tasks outside any project are not in byProject.
function summarizeCompleted(rows, timeZone, now = new Date(), weeks = SUMMARY_WEEKS, projects = []) {
  const since = firstSummaryWeek(timeZone, now, weeks);
  const buckets = new Map();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(since, 7 * i), {count: 0, minutes: 0});
  const priorities = new Map(PRIORITIES.map((p) => [p, {count: 0, minutes: 0}]));
  const tags = new Map();
  const projectNames = new Map((Array.isArray(projects) ? projects : []).map((p) => [p.id, p.name]));
  const byProject = new Map(); // project id (null for a deleted project) -> entry
  const days = new Set();
  const today = localDate(timeZone, now);
  let totalCount = 0;
  let totalMinutes = 0;

  for (const row of rows) {
    const iso = toIso(row && row.completedAt);
    if (!iso) continue;
    const day = localDate(timeZone, new Date(iso));
    const bucket = buckets.get(weekStartOf(day));
    if (!bucket) continue;
    const minutes = minutesOf(row);
    bucket.count++;
    bucket.minutes += minutes;
    totalCount++;
    totalMinutes += minutes;
    if (day <= today) days.add(day);
    if (typeof row.projectId === "string" && row.projectId) {
      const known = projectNames.has(row.projectId);
      const key = known ? row.projectId : null;
      const entry = byProject.get(key) || {projectId: key, name: known ? projectNames.get(row.projectId) : null, count: 0, minutes: 0};
      entry.count++;
      entry.minutes += minutes;
      byProject.set(key, entry);
    }
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
    byProject: [...byProject.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || (a.name === null) - (b.name === null) || String(a.name).localeCompare(String(b.name))),
    streak: computeStreaks(days, since, today),
  };
}

module.exports = {DEFAULT_LIMIT, MAX_LIMIT, SUMMARY_WEEKS, SUMMARY_MAX_ROWS, clampLimit, toIso, serializeCompleted, weekStartOf, firstSummaryWeek, summaryWindowStart, computeStreaks, summarizeCompleted};

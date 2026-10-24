/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// A job's history: how many times it has been completed (`completedCount`) and how long its latest instances really took
// (`recentSeconds`: the tracked time of up to the last ROLLING_WINDOW completions that had any, oldest first). An
// instance's estimate is the rolling average of those times, rounded to the nearest 5 minutes. All of this is pure.

// How many of the latest timed instances the average covers.
const ROLLING_WINDOW = 5;
const MAX_COUNT = 1000000;

// Minutes rounded to the nearest 5 (a half rounds up), never less than 5.
function roundToFive(minutes) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

// A list of tracked seconds as clean samples: finite numbers of at least one second, rounded, the newest ROLLING_WINDOW
// kept (the list is oldest first). Anything but an array gives [].
function normalizeSamples(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => Number.isFinite(s) && s >= 0.5).map((s) => Math.round(s)).slice(-ROLLING_WINDOW);
}

// A completion count: a whole number from 1 to MAX_COUNT, else 0.
function normalizeCount(raw) {
  return Number.isInteger(raw) && raw >= 1 && raw <= MAX_COUNT ? raw : 0;
}

// The rolling average of the samples in minutes, rounded to the nearest 5 (see roundToFive); null with no usable sample.
function averageMinutes(samples) {
  const clean = normalizeSamples(samples);
  if (clean.length === 0) return null;
  return roundToFive(clean.reduce((a, b) => a + b, 0) / clean.length / 60);
}

// The history the owner's page sends for a new task copied from a completed one, as {completedCount?, recentSeconds?}
// with only the usable parts; null when nothing is usable.
function normalizeHistory(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const count = normalizeCount(raw.completedCount);
  const samples = normalizeSamples(raw.recentSeconds);
  if (!count && samples.length === 0) return null;
  const out = {};
  if (count) out.completedCount = count;
  if (samples.length > 0) out.recentSeconds = samples;
  return out;
}

// The history of a job after `task` (a settled task, `trackedSeconds` holding its time) is completed: one more
// completion, and its tracked time added to the samples when there was any. `recentSeconds` is left out when empty.
function recordCompletion(task) {
  const samples = normalizeSamples(task && task.recentSeconds);
  const tracked = task && task.trackedSeconds;
  if (Number.isFinite(tracked) && tracked >= 0.5) samples.push(Math.round(tracked));
  const out = {completedCount: normalizeCount(task && task.completedCount) + 1};
  if (samples.length > 0) out.recentSeconds = samples.slice(-ROLLING_WINDOW);
  return out;
}

module.exports = {ROLLING_WINDOW, roundToFive, normalizeSamples, normalizeCount, averageMinutes, normalizeHistory, recordCompletion};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

module.exports = {DEFAULT_LIMIT, MAX_LIMIT, clampLimit, toIso, serializeCompleted};

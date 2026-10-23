/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Snooze: a task can be told not to be scheduled before a local date (`snoozedUntil`, YYYY-MM-DD). Its due date is
// untouched. Pure: no I/O.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (!DATE_ONLY.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

// A `snoozedUntil` value from the client.
//   undefined: the value is unusable, meaning "no change"
//   null:      not snoozed (null or an empty string); the task's field is removed
//   string:    a real calendar date, YYYY-MM-DD
function normalizeSnooze(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isRealDate(value)) return undefined;
  return value;
}

// The task's snooze date, or null when it has none (or an unusable one). The date may already be past, which
// restricts nothing.
function snoozeDate(task) {
  return task && typeof task.snoozedUntil === "string" && isRealDate(task.snoozedUntil) ? task.snoozedUntil : null;
}

// True while the snooze date is after `today` (YYYY-MM-DD, the local date).
function isSnoozed(task, today) {
  const date = snoozeDate(task);
  return date !== null && date > today;
}

module.exports = {normalizeSnooze, snoozeDate, isSnoozed};

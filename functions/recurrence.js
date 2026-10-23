/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {addDays} = require("./time");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Most occurrences stepped over when a recurring task is completed very late.
const MAX_STEPS = 5000;

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
}

// YYYY-MM-DD shifted by n calendar months. A day past the end of the target month moves to its last day
// (31 Jan + 1 month = 28 or 29 Feb). Pure: no I/O.
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// YYYY-MM-DD shifted by `steps` repeats of a recurrence ({frequency, interval}).
function addRecurrence(dateStr, recurrence, steps) {
  const n = recurrence.interval * steps;
  switch (recurrence.frequency) {
    case "DAILY": return addDays(dateStr, n);
    case "WEEKLY": return addDays(dateStr, 7 * n);
    case "MONTHLY": return addMonths(dateStr, n);
    case "YEARLY": return addMonths(dateStr, 12 * n);
    default: throw new Error(`Unknown frequency: ${recurrence.frequency}`);
  }
}

// Due date (YYYY-MM-DD) of the occurrence that follows a completed one. Pure: no I/O.
//   dueDate:    the completed task's due date; an empty or invalid one counts as `today`
//   recurrence: {frequency: DAILY|WEEKLY|MONTHLY|YEARLY, interval: whole number >= 1}
//   today:      the current local date, YYYY-MM-DD
// The result steps forward from the due date in whole intervals and is always after `today`, so finishing a
// task early keeps its rhythm (due Monday, done Saturday: the next Monday) while finishing late skips the
// occurrences already missed rather than creating overdue tasks. Each step is counted from the original date,
// so month-end clamping does not drift (31 Jan, 28 Feb, 31 Mar).
function nextDueDate(dueDate, recurrence, today) {
  const base = typeof dueDate === "string" && DATE_ONLY.test(dueDate) ? dueDate : today;
  for (let step = 1; step <= MAX_STEPS; step++) {
    const next = addRecurrence(base, recurrence, step);
    if (next > today) return next;
  }
  return addRecurrence(today, recurrence, 1);
}

module.exports = {addMonths, addRecurrence, nextDueDate};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days from `today` to the task's due date (negative when overdue, 0 when due today),
// or null when the task has no valid due date. Both are YYYY-MM-DD calendar dates.
function daysUntilDue(task, today) {
  if (!task || typeof task.dueDate !== "string" || !DATE_ONLY.test(task.dueDate)) return null;
  const due = Date.parse(`${task.dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return null;
  return Math.round((due - now) / DAY_MS);
}

// A task is overdue once its due date is before today. A task due today is not overdue.
function isOverdue(task, today) {
  const days = daysUntilDue(task, today);
  return days !== null && days < 0;
}

// Tasks for the scheduling prompt: each gains `overdue` and `daysUntilDue` (null without a due date), and the
// list is ordered most overdue first, then earliest due date, then undated tasks. Ties keep their `order` rank
// (then their input position). Pure: the input list and its tasks are not modified.
function annotateDue(tasks, today) {
  return tasks
      .map((task, index) => ({task, index, days: daysUntilDue(task, today)}))
      .sort((a, b) => {
        if (a.days !== b.days) {
          if (a.days === null) return 1;
          if (b.days === null) return -1;
          return a.days - b.days;
        }
        return ((a.task.order || 0) - (b.task.order || 0)) || (a.index - b.index);
      })
      .map(({task, days}) => ({...task, overdue: days !== null && days < 0, daysUntilDue: days}));
}

module.exports = {daysUntilDue, isOverdue, annotateDue};

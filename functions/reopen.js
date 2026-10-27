/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {normalizeSamples, normalizeCount} = require("./history");

// Archive-row fields that do not come back with a reopened task: the completion itself, the job history the row carries
// (replaced by the history from before it, see historyBefore), a running timer or active mark (a row has neither, so this
// is only defensive) and the repetition (see reopenTask).
const NOT_RESTORED = ["archiveId", "completedAt", "completedCount", "recentSeconds", "timerStartedAt", "active", "recurrence"];

// The job history from before the completion on `row` was recorded: one fewer completion, and the completion's own tracked
// time taken off the end of the samples when it is there (the page can correct a row's tracked time without changing the
// history snapshot it carries, in which case the samples are left as they are). Keys with nothing in them are left out. Pure.
function historyBefore(row) {
  const count = normalizeCount(row && row.completedCount) - 1;
  const samples = normalizeSamples(row && row.recentSeconds);
  const tracked = row && row.trackedSeconds;
  if (Number.isFinite(tracked) && tracked >= 0.5 && samples.length > 0 && samples[samples.length - 1] === Math.round(tracked)) samples.pop();
  const out = {};
  if (count >= 1) out.completedCount = count;
  if (samples.length > 0) out.recentSeconds = samples;
  return out;
}

// The queue with a completed task put back, built from its archive row. Pure: no I/O, nothing passed in is modified.
//   tasks:      the stored task list
//   row:        the archive document as stored (a Task plus completedAt and its history), without its archive id
//   options:    {projectIds: ids of the current projects, makeId: () => a new task id}
// The task comes back as a plain PENDING task at the end of the list, with everything the row holds: its title, priority,
// due date, estimate, tags, materials, description, snooze date and `addedAt`, its own id (a new one when that id is already on
// the list), and, above all, the time it accrued (`trackedSeconds`) and when it was first started (`firstStartedAt`). Its
// timer is stopped and it is not the active task. Its calendar event was deleted at completion, so, unless it is pinned
// (`locked`, whose event is on the personal calendar), its schedule fields are cleared and the next run books it again. It
// leaves a project that has been deleted since. Its job history goes back to what it was before the completion (the
// completion is recorded afresh when the task is completed again). It does not repeat: a repeating task's next
// occurrence was added when it was completed, so the series carries on from that one and this is a one-off return of the earlier
// instance (`droppedRecurrence` says it had a repetition).
// Returns {tasks, task, droppedRecurrence}, or {error} (text for the owner) when the row has no title.
function reopenTask(tasks, row, {projectIds = [], makeId} = {}) {
  if (!row || typeof row !== "object" || typeof row.title !== "string" || !row.title.trim()) {
    return {error: "This completed task has no title, so it cannot be reopened"};
  }
  const list = Array.isArray(tasks) ? tasks : [];
  const task = {...row};
  for (const key of NOT_RESTORED) delete task[key];
  task.id = typeof row.id === "string" && row.id !== "" && !list.some((t) => t.id === row.id) ? row.id : makeId();
  task.status = "PENDING";
  task.order = list.reduce((max, t) => (Number.isFinite(t.order) && t.order > max ? t.order : max), 0) + 1;
  if (Number.isFinite(row.trackedSeconds) && row.trackedSeconds > 0) task.trackedSeconds = Math.round(row.trackedSeconds);
  else delete task.trackedSeconds;
  if (!task.locked) {
    delete task.googleCalendarEventId;
    delete task.scheduledStart;
    delete task.scheduledEnd;
  }
  if (task.projectId && !projectIds.includes(task.projectId)) {
    delete task.projectId;
    delete task.projectOrder;
  }
  Object.assign(task, historyBefore(row));
  return {tasks: [...list, task], task, droppedRecurrence: Boolean(row.recurrence)};
}

module.exports = {historyBefore, reopenTask};

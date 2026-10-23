/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {nextDueDate} = require("./recurrence");
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const MAX_INTERVAL = 365;

// A recurrence value from the model or the client as {frequency, interval}. Pure: no I/O.
//   undefined: the value is missing or unusable, meaning "no change"
//   null:      the task does not repeat (null, or frequency "NONE")
//   object:    {frequency: DAILY|WEEKLY|MONTHLY|YEARLY, interval: whole number 1..365}
// Frequency is case-insensitive. A missing or non-numeric interval becomes 1; others are rounded and clamped.
function normalizeRecurrence(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const frequency = typeof value.frequency === "string" ? value.frequency.trim().toUpperCase() : "";
  if (frequency === "NONE") return null;
  if (!FREQUENCIES.includes(frequency)) return undefined;
  const interval = Number.isFinite(value.interval) ? Math.min(Math.max(Math.round(value.interval), 1), MAX_INTERVAL) : 1;
  return {frequency, interval};
}

// `task` with `fields` applied for a direct edit. Fields are applied as given, except `recurrence`, which is
// validated: null or frequency "NONE" removes it, an unusable value leaves the task's recurrence as it was.
// Pure: the input is not modified.
function applyDirectUpdate(task, fields) {
  const next = {...task, ...fields};
  if (fields && "recurrence" in fields) {
    const recurrence = normalizeRecurrence(fields.recurrence);
    if (recurrence) next.recurrence = recurrence;
    else if (recurrence === null || !task.recurrence) delete next.recurrence;
    else next.recurrence = task.recurrence;
  }
  return next;
}

// Fields the model may set. Everything else on a task (id, status, order, calendar and schedule fields, locked) is server-owned.
function cleanFields(change) {
  const out = {};
  if (typeof change.title === "string" && change.title.trim()) out.title = change.title.trim();
  if (PRIORITIES.includes(change.priority)) out.priority = change.priority;
  if (typeof change.dueDate === "string" && (change.dueDate === "" || DATE_ONLY.test(change.dueDate))) out.dueDate = change.dueDate;
  if (Number.isFinite(change.estimatedMinutes) && change.estimatedMinutes > 0) out.estimatedMinutes = Math.round(change.estimatedMinutes);
  if (Array.isArray(change.tags)) out.tags = change.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  const recurrence = normalizeRecurrence(change.recurrence);
  if (recurrence !== undefined) out.recurrence = recurrence; // null clears it
  return out;
}

// Place `task` at the 1-based rank `rank` in `list` (clamped), removing any earlier copy.
function placeAtRank(list, task, rank) {
  const rest = list.filter((t) => t.id !== task.id);
  const index = Number.isInteger(rank) ? Math.min(Math.max(rank - 1, 0), rest.length) : rest.length;
  rest.splice(index, 0, task);
  return rest;
}

// Merge the model's new or changed tasks into the stored list. Pure: no I/O.
//   existing: stored tasks
//   changes:  [{id?, title, priority, dueDate, estimatedMinutes, tags, recurrence?, order?}]. A change whose id matches a
//             stored task updates its model-owned fields; any other change is a new task and gets a server id.
//   makeId:   () => new task id
// Untouched tasks, and every server-owned field of updated tasks, are preserved. A change naming an id that is
// no longer stored is skipped. Ranks are renumbered 1..n in list order.
// Returns {tasks, added, updated, skipped}.
function mergeTaskChanges(existing, changes, makeId) {
  let list = [...existing].sort((a, b) => (a.order || 0) - (b.order || 0));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const change of changes) {
    if (!change || typeof change !== "object") {
      skipped++;
      continue;
    }
    const fields = cleanFields(change);
    const current = change.id ? list.find((t) => t.id === change.id) : null;

    if (current) {
      const next = {...current, ...fields};
      if (next.recurrence === null) delete next.recurrence;
      if (Number.isInteger(change.order)) {
        list = placeAtRank(list, next, change.order);
      } else {
        list = list.map((t) => (t.id === current.id ? next : t)); // no rank given: keep its place
      }
      updated++;
    } else if (change.id) {
      skipped++; // names a task that no longer exists
    } else if (fields.title) {
      const task = {
        id: makeId(),
        title: fields.title,
        priority: fields.priority || "MEDIUM",
        dueDate: fields.dueDate || "",
        estimatedMinutes: fields.estimatedMinutes || 15,
        tags: fields.tags || [],
        status: "PENDING",
      };
      if (fields.recurrence) task.recurrence = fields.recurrence;
      list = placeAtRank(list, task, change.order);
      added++;
    } else {
      skipped++;
    }
  }

  return {tasks: list.map((t, i) => ({...t, order: i + 1})), added, updated, skipped};
}

// Remove a completed task from the list and, if it repeats, create its next occurrence. Pure: no I/O.
//   tasks:  the stored list
//   taskId: the task being completed
//   today:  the current local date, YYYY-MM-DD
//   makeId: () => new task id
// The next occurrence copies title, priority, estimatedMinutes, tags and recurrence, is PENDING, has the next
// due date (see nextDueDate) and takes the completed task's rank; it has no schedule, calendar event or lock.
// Other tasks are left exactly as they were. Returns null when no task has that id, otherwise
// {tasks, completedTask, spawned} with spawned null for a task that does not repeat.
function completeInList(tasks, taskId, today, makeId) {
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  const completedTask = tasks[index];
  const recurrence = normalizeRecurrence(completedTask.recurrence);
  const rest = tasks.filter((t) => t.id !== taskId);
  if (!recurrence) return {tasks: rest, completedTask, spawned: null};
  const spawned = {
    id: makeId(),
    title: completedTask.title,
    priority: completedTask.priority,
    dueDate: nextDueDate(completedTask.dueDate, recurrence, today),
    estimatedMinutes: completedTask.estimatedMinutes,
    tags: [...(completedTask.tags || [])],
    status: "PENDING",
    recurrence,
    order: completedTask.order,
  };
  return {tasks: [...rest, spawned], completedTask, spawned};
}

// Record an engine run's results on the freshly read list. Pure: no I/O.
//   tasks:       the list as stored now (it may have changed while the engine ran)
//   knownIds:    ids of the tasks the engine read at the start of its run
//   locked:      Map task id -> personal-calendar event ({id, start: {dateTime|date}, end: {dateTime|date}})
//   scheduled:   Map task id -> {eventId, start, end}
//   createdEvents: [{taskId, eventId}] events the run inserted
// Only the schedule fields of known tasks are rewritten, so edits and additions made during the run survive.
// Returns {tasks, orphanEventIds}: events created for tasks that were deleted or completed meanwhile.
function applyScheduleResults({tasks, knownIds, locked, scheduled, createdEvents}) {
  const present = new Set(tasks.map((t) => t.id));
  const updatedTasks = tasks.map((task) => {
    if (!knownIds.has(task.id)) return task;
    const next = {...task};
    delete next.googleCalendarEventId;
    delete next.scheduledStart;
    delete next.scheduledEnd;
    delete next.locked;
    const lockedEvent = locked.get(task.id);
    const hit = scheduled.get(task.id);
    if (lockedEvent) {
      next.googleCalendarEventId = lockedEvent.id;
      next.scheduledStart = lockedEvent.start.dateTime || lockedEvent.start.date;
      next.scheduledEnd = lockedEvent.end.dateTime || lockedEvent.end.date;
      next.locked = true;
    } else if (hit) {
      next.googleCalendarEventId = hit.eventId;
      next.scheduledStart = hit.start;
      next.scheduledEnd = hit.end;
    }
    return next;
  });
  const orphanEventIds = createdEvents.filter((c) => !present.has(c.taskId)).map((c) => c.eventId);
  return {tasks: updatedTasks, orphanEventIds};
}

module.exports = {FREQUENCIES, MAX_INTERVAL, normalizeRecurrence, applyDirectUpdate, completeInList, mergeTaskChanges, applyScheduleResults};

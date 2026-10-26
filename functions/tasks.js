/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {nextDueDate} = require("./recurrence");
const {randomUUID} = require("crypto");
const {applyProjectFields, projectFieldsOf} = require("./projects");
const {normalizeMaterials} = require("./materials");
const {normalizeSnooze} = require("./snooze");
const {normalizeComments} = require("./comments");
const {normalizeTravelKm} = require("./travel");
const {normalizePhone, normalizeEmail} = require("./contact");
const {averageMinutes, normalizeHistory, recordCompletion} = require("./history");
const {settleTimer} = require("./timer");
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
// validated: null or frequency "NONE" removes it, an unusable value leaves the task's recurrence as it was; and
// `projectId` / `projectOrder`, which go through applyProjectFields against `projectIds` (the ids of the projects
// that exist; none when omitted, so a task can leave a project but not join one); and `materials`, which is
// validated by normalizeMaterials (null or an empty list removes it, an unusable value leaves it as it was; new
// items get ids from `makeId`); and `snoozedUntil`, validated by normalizeSnooze (null or an empty string removes it, an
// unusable value leaves it as it was); and `comments`, validated by normalizeComments (null or empty text removes it, a
// non-string leaves it as it was); and `travelKm`, validated by normalizeTravelKm (null, empty text or 0 removes it, an unusable value
// leaves it as it was); and `phone` and `email`, validated by normalizePhone and normalizeEmail (null or empty text removes it, an unusable value
// leaves it as it was). `addedAt`, `trackedSeconds`, `firstStartedAt`, `timerStartedAt`, `active`, `order` and `jobNumber` are never changed by an edit.
// Pure apart from `makeId`: the input is not modified.
function applyDirectUpdate(task, fields, projectIds = [], makeId = randomUUID) {
  const rest = {...fields};
  delete rest.projectId;
  delete rest.projectOrder;
  delete rest.newProject; // a project to create is handled by the endpoint, which passes its id as `projectId`
  delete rest.materials;
  delete rest.snoozedUntil;
  delete rest.comments;
  delete rest.travelKm;
  delete rest.phone;
  delete rest.email;
  delete rest.completedCount;
  delete rest.recentSeconds;
  delete rest.addedAt;
  delete rest.trackedSeconds;
  delete rest.timerStartedAt;
  delete rest.firstStartedAt;
  delete rest.active;
  delete rest.jobNumber;
  delete rest.order; // the queue position changes only through moveToQueueNumber
  delete rest.queueNumber;
  const next = {...task, ...rest};
  if (fields && "recurrence" in fields) {
    const recurrence = normalizeRecurrence(fields.recurrence);
    if (recurrence) next.recurrence = recurrence;
    else if (recurrence === null || !task.recurrence) delete next.recurrence;
    else next.recurrence = task.recurrence;
  }
  if (fields && "materials" in fields) {
    const materials = normalizeMaterials(fields.materials, makeId);
    if (materials) next.materials = materials;
    else if (materials === null) delete next.materials;
  }
  if (fields && "snoozedUntil" in fields) {
    const snoozedUntil = normalizeSnooze(fields.snoozedUntil);
    if (typeof snoozedUntil === "string") next.snoozedUntil = snoozedUntil;
    else if (snoozedUntil === null) delete next.snoozedUntil;
  }
  if (fields && "comments" in fields) {
    const comments = normalizeComments(fields.comments);
    if (typeof comments === "string") next.comments = comments;
    else if (comments === null) delete next.comments;
  }
  if (fields && "travelKm" in fields) {
    const travelKm = normalizeTravelKm(fields.travelKm);
    if (typeof travelKm === "number") next.travelKm = travelKm;
    else if (travelKm === null) delete next.travelKm;
  }
  if (fields && "phone" in fields) {
    const phone = normalizePhone(fields.phone);
    if (typeof phone === "string") next.phone = phone;
    else if (phone === null) delete next.phone;
  }
  if (fields && "email" in fields) {
    const email = normalizeEmail(fields.email);
    if (typeof email === "string") next.email = email;
    else if (email === null) delete next.email;
  }
  return applyProjectFields(next, fields, projectIds);
}

// The tasks in queue order (`order`, ties in list order) with the task `taskId` moved to the 1-based queue number
// `number` (clamped to 1..n) and every rank renumbered 1..n, so no number is ever missing. Returns null when no task
// has that id or `number` is not a whole number. Pure: the input is not modified.
function moveToQueueNumber(tasks, taskId, number) {
  if (!Number.isInteger(number)) return null;
  const list = tasks.map((t, i) => [t, i]).sort((a, b) => (a[0].order || 0) - (b[0].order || 0) || a[1] - b[1]).map((pair) => pair[0]);
  const task = list.find((t) => t.id === taskId);
  if (!task) return null;
  return placeAtRank(list, task, number).map((t, i) => ({...t, order: i + 1}));
}

// Fields the model may set. Everything else on a task (id, status, order, calendar and schedule fields, locked,
// materials, snoozedUntil, comments, addedAt, trackedSeconds, timerStartedAt, active) is server-owned.
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

// The project fields of a change, as {projectId?, projectOrder?} for applyProjectFields. Pure: no I/O.
// Only an id in `projectIds` counts, and only a number is an order, so a change can put a task in a project or
// move it to another and give it an order number, but an empty, null, unknown or missing value changes nothing:
// it never removes a task from a project or clears its order number, and never invents a project.
// Only manual entries and accepted project suggestions carry these fields; the model's changes are stripped of them
// first (withoutProjectFields).
function changeProjectFields(change, projectIds) {
  const out = {};
  if (typeof change.projectId === "string" && projectIds.includes(change.projectId)) out.projectId = change.projectId;
  if (Number.isFinite(change.projectOrder)) out.projectOrder = change.projectOrder;
  return out;
}

// The new-task change for a task entered by hand, in the shape mergeTaskChanges takes. Pure: no I/O.
//   manual: {title, priority?, dueDate?, estimatedMinutes?, tags?, recurrence?, projectId?, projectOrder?, materials?, comments?, travelKm?, phone?, email?}
//           from the entry form
// Returns null without a usable title. The fields are validated by the same rules as the model's (see cleanFields,
// changeProjectFields), so an unusable priority, date, estimate, tag list, recurrence or project falls back to the
// new-task default; a field the form did not send is left out of the change. `materials`, `comments`, `travelKm`, `phone` and `email` are passed on as
// sent and are only applied when mergeTaskChanges is told to (the model's changes never set them). There is no id (a manual
// entry is always a new task) and no rank (it goes last).
function manualTaskChange(manual) {
  if (!manual || typeof manual !== "object" || Array.isArray(manual)) return null;
  if (typeof manual.title !== "string" || !manual.title.trim()) return null;
  const change = {title: manual.title, priority: manual.priority, dueDate: manual.dueDate, estimatedMinutes: manual.estimatedMinutes, tags: manual.tags};
  for (const key of ["recurrence", "projectId", "projectOrder", "materials", "comments", "travelKm", "phone", "email", "history"]) {
    if (manual[key] !== undefined) change[key] = manual[key];
  }
  return change;
}

// The model's changes with every project field removed, so a free-text add never puts a task into a project, moves it
// or renumbers it (a project comes only from a manual entry or an accepted suggestion). Pure: no I/O; the changes
// passed in are not modified, and anything that is not an object is passed through for mergeTaskChanges to skip.
function withoutProjectFields(changes) {
  return (Array.isArray(changes) ? changes : []).map((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) return change;
    const {projectId, projectOrder, ...rest} = change; // eslint-disable-line no-unused-vars
    return rest;
  });
}

// Whether a manual entry's change has no usable tag, so the model is asked to fill them. Pure.
function needsTagFill(change) {
  return !change || !Array.isArray(change.tags) || !change.tags.some((t) => typeof t === "string" && t.trim());
}

// Tags from the model as a clean list: strings only, trimmed, duplicates (ignoring case) removed, at most `max`. Pure.
function cleanTags(raw, max = 5) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    const text = tag.trim();
    if (!text || text.length > 40 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

// Ids of the tasks in `after` that are not in `before`, in `after`'s list order. Pure.
function newTaskIds(before, after) {
  const old = new Set(before.map((t) => t.id));
  return after.filter((t) => !old.has(t.id)).map((t) => t.id);
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
//   changes:  [{id?, title, priority, dueDate, estimatedMinutes, tags, recurrence?, projectId?, projectOrder?, order?}].
//             A change whose id matches a stored task updates its model-owned fields; any other change is a new task
//             and gets a server id.
//   makeId:   () => new task id
//   projectIds: ids of the projects that exist (none when omitted). The model's projectId and projectOrder are applied
//             through applyProjectFields (see changeProjectFields for what counts).
//   options:  {jobCounter: n} numbers each new task (`jobNumber`) from n + 1 on, in the order the changes are listed, and returns the
//             last number issued as `jobCounter`; without it new tasks are not numbered. {history: true} lets a new task take the change's `history` (validated by normalizeHistory), {materials: true} lets a new task take the change's `materials` (validated by normalizeMaterials) and
//             {comments: true} its `comments` (validated by normalizeComments) and {travelKm: true} its `travelKm` (validated by normalizeTravelKm) and {contact: true} its `phone` and `email` (validated by normalizePhone and normalizeEmail); only a manual entry or a template sets them. Without
//             the option, and for an update, the field is never read.
// Untouched tasks, and every server-owned field of updated tasks, are preserved. A change naming an id that is
// no longer stored is skipped. An existing task never moves: a rank on a change to one is ignored. A new task takes
// the rank asked for (clamped; at the end when none), new tasks going in lowest rank first. Ranks are renumbered 1..n in list order.
// Returns {tasks, added, updated, skipped}.
function mergeTaskChanges(existing, changes, makeId, projectIds = [], options = {}) {
  let list = [...existing].sort((a, b) => (a.order || 0) - (b.order || 0));
  const created = []; // new tasks with the rank asked for, inserted after the loop
  let counter = Number.isSafeInteger(options.jobCounter) ? options.jobCounter : null; // last job number issued, when numbering
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
      const next = applyProjectFields({...current, ...fields}, changeProjectFields(change, projectIds), projectIds);
      if (next.recurrence === null) delete next.recurrence;
      list = list.map((t) => (t.id === current.id ? next : t)); // an existing task always keeps its place: any rank is ignored
      updated++;
    } else if (change.id) {
      skipped++; // names a task that no longer exists
    } else if (fields.title) {
      const base = {
        id: makeId(),
        title: fields.title,
        priority: fields.priority || "MEDIUM",
        dueDate: fields.dueDate || "",
        estimatedMinutes: fields.estimatedMinutes || 15,
        tags: fields.tags || [],
        status: "PENDING",
      };
      if (counter !== null) base.jobNumber = ++counter;
      if (fields.recurrence) base.recurrence = fields.recurrence;
      if (typeof options.now === "string" && options.now) base.addedAt = options.now;
      const task = applyProjectFields(base, changeProjectFields(change, projectIds), projectIds);
      if (options.materials === true) {
        const materials = normalizeMaterials(change.materials, makeId);
        if (materials) task.materials = materials;
      }
      if (options.comments === true) {
        const comments = normalizeComments(change.comments);
        if (comments) task.comments = comments;
      }
      if (options.travelKm === true) {
        const travelKm = normalizeTravelKm(change.travelKm);
        if (travelKm) task.travelKm = travelKm;
      }
      if (options.contact === true) {
        const phone = normalizePhone(change.phone);
        if (phone) task.phone = phone;
        const email = normalizeEmail(change.email);
        if (email) task.email = email;
      }
      if (options.history === true) {
        const history = normalizeHistory(change.history);
        if (history) Object.assign(task, history);
      }
      created.push({task, rank: change.order});
      added++;
    } else {
      skipped++;
    }
  }

  // New tasks go in lowest requested rank first, so each rank (a place in the final list) is where the task ends up;
  // a task with no usable rank goes at the end. Existing tasks keep their order relative to each other.
  const ranked = created.filter((c) => Number.isInteger(c.rank)).sort((a, b) => a.rank - b.rank);
  for (const {task, rank} of [...ranked, ...created.filter((c) => !Number.isInteger(c.rank))]) list = placeAtRank(list, task, rank);

  const out = {tasks: list.map((t, i) => ({...t, order: i + 1})), added, updated, skipped};
  if (counter !== null) out.jobCounter = counter;
  return out;
}

// Remove a completed task from the list and, if it repeats, create its next occurrence. Pure: no I/O.
//   tasks:  the stored list
//   taskId: the task being completed
//   today:  the current local date, YYYY-MM-DD
//   makeId: () => new task id
//   now:    ISO text; the next occurrence's `addedAt` (left off when omitted), and the instant a running timer on the
//           completed task stops at. The completed task always carries `trackedSeconds` (0 if never timed) and no
//           `timerStartedAt` or `active`; the next occurrence starts with no tracked time.
// The next occurrence copies title, priority, estimatedMinutes, tags, recurrence and project membership
// (projectId, projectOrder), materials (all unchecked, as the next occurrence needs them again) and comments, is PENDING, has the next due date (see nextDueDate) and takes the completed task's
// rank; it has no schedule, calendar event or lock. It is snoozed until that due date (a cooldown: the next occurrence is not scheduled before it is
// due, so a weekly task completed today does not come back on today's schedule).
// The job's history moves on (see history.js): `history` is {completedCount, recentSeconds?} after this completion, which the
// caller stores on the archive row (`completedTask` itself keeps the history it had, so an undo restores it) and which the next
// occurrence carries; the next occurrence's estimate becomes the rolling average of the tracked times, rounded to 5 minutes
// (the completed task's estimate while no instance has any tracked time).
// With `jobCounter` (the last job number issued) the next occurrence is a new task and takes the next job number; the result then
// carries `jobCounter`, the last number issued afterwards. The completed task keeps its own number.
// Other tasks are left exactly as they were. Returns null when no task has that id, otherwise
// {tasks, completedTask, spawned, history} with spawned null for a task that does not repeat.
function completeInList(tasks, taskId, today, makeId, now, jobCounter) {
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  const completedTask = settleTimer(tasks[index], Date.parse(now));
  const history = recordCompletion(completedTask);
  const recurrence = normalizeRecurrence(completedTask.recurrence);
  const rest = tasks.filter((t) => t.id !== taskId);
  const counting = Number.isSafeInteger(jobCounter);
  if (!recurrence) return {tasks: rest, completedTask, spawned: null, history, ...(counting ? {jobCounter} : {})};
  const spawned = {
    id: makeId(),
    title: completedTask.title,
    priority: completedTask.priority,
    dueDate: nextDueDate(completedTask.dueDate, recurrence, today),
    estimatedMinutes: averageMinutes(history.recentSeconds) || completedTask.estimatedMinutes,
    tags: [...(completedTask.tags || [])],
    status: "PENDING",
    recurrence,
    ...projectFieldsOf(completedTask),
    ...history,
    order: completedTask.order,
  };
  spawned.snoozedUntil = spawned.dueDate;
  if (typeof now === "string" && now) spawned.addedAt = now;
  if (Array.isArray(completedTask.materials) && completedTask.materials.length > 0) {
    spawned.materials = completedTask.materials.map((m) => ({id: makeId(), text: m.text, checked: false, ...(typeof m.cost === "number" ? {cost: m.cost} : {})}));
  }
  if (typeof completedTask.comments === "string" && completedTask.comments !== "") spawned.comments = completedTask.comments;
  if (typeof completedTask.travelKm === "number" && completedTask.travelKm > 0) spawned.travelKm = completedTask.travelKm;
  if (typeof completedTask.phone === "string" && completedTask.phone !== "") spawned.phone = completedTask.phone;
  if (typeof completedTask.email === "string" && completedTask.email !== "") spawned.email = completedTask.email;
  if (counting) spawned.jobNumber = jobCounter + 1;
  return {tasks: [...rest, spawned], completedTask, spawned, history, ...(counting ? {jobCounter: jobCounter + 1} : {})};
}

// How long after a delete or completion it can still be undone.
const UNDO_WINDOW_MS = 10 * 60 * 1000;

// The record kept (one at a time, `settings/lastRemoved`) so the last delete or completion can be undone.
//   kind:    "DELETE" or "COMPLETE"
//   task:    the task as it was on the list
//   archiveId: id of its `completed_tasks` document (a completion), else null
//   spawned: the next occurrence a completion created (or null)
//   now:     milliseconds since the epoch
function removalRecord(kind, task, archiveId, spawned, now) {
  return {kind, task, archiveId: archiveId || null, spawnedId: spawned ? spawned.id : null, at: now};
}

// Whether a stored record can still be undone at `now`.
function isUndoable(record, now) {
  return Boolean(record) && typeof record.at === "number" && now - record.at >= 0 && now - record.at <= UNDO_WINDOW_MS &&
    Boolean(record.task) && typeof record.task.id === "string" && record.task.id !== "";
}

// Put a removed task back on the list. Pure: no I/O.
//   tasks:   the list as stored now
//   record:  see removalRecord
// The next occurrence a completion created is taken off again. The task returns with its own id, rank and fields; its
// calendar event was deleted with it, so its schedule fields are dropped (the next run schedules it again), unless it is
// pinned to a personal-calendar event (`locked`), whose event was never touched.
// Returns null when the task is already on the list (nothing to restore), otherwise {tasks, restored}.
function undoInList(tasks, record) {
  const task = record && record.task;
  if (!task || typeof task.id !== "string" || tasks.some((t) => t.id === task.id)) return null;
  const rest = record.spawnedId ? tasks.filter((t) => t.id !== record.spawnedId) : tasks;
  const restored = {...task};
  delete restored.timerStartedAt; // a restored task never comes back with its timer running or as the active task
  delete restored.active;
  if (!restored.locked) {
    delete restored.googleCalendarEventId;
    delete restored.scheduledStart;
    delete restored.scheduledEnd;
  }
  return {tasks: [...rest, restored], restored};
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

module.exports = {withoutProjectFields, needsTagFill, cleanTags, newTaskIds, FREQUENCIES, MAX_INTERVAL, UNDO_WINDOW_MS, normalizeRecurrence, manualTaskChange, applyDirectUpdate, moveToQueueNumber, completeInList, removalRecord, isUndoable, undoInList, mergeTaskChanges, applyScheduleResults};

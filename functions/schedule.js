/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localDate, localMinutesOfDay, addDays, localDayStart} = require("./time");

// Scheduling hours in the owner's local time, as minutes since midnight.
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 19 * 60;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

// Validate the slots Gemini returned. Pure: no I/O.
//   items:   scheduledTasks from the model ({taskId, startISO, endISO, transparency, isAllDay, reasoning})
//   tasks:   the active task list
//   busy:    merged busy windows [{start, end}] (ISO strings)
//   now, horizon: Date objects bounding the schedulable range
//   timeZone: the owner's IANA time zone, which defines days and the 8:00-19:00 window
//   allTasks: every active task (default `tasks`), for project membership; see checkProjectOrder
//   fixed:    slots of tasks outside this run ([{taskId, start, end}], ISO instants); see checkProjectOrder
// Returns {slots, errors}. Slots are only meaningful when errors is empty.
// Timed slots must be parseable, in the future, end by the horizon, sit on one local day
// inside 8:00-19:00, and not overlap busy windows or each other. All-day slots must fall
// on a local date between today and the horizon's date; they are reminders and skip overlap checks.
function validateSchedule({items, tasks, busy, now, horizon, timeZone, allTasks = tasks, fixed = []}) {
  const errors = [];
  const slots = [];
  const taskIds = new Set(tasks.map((t) => t.id));
  const seen = new Set();
  const busyMs = busy
      .map((w) => ({startMs: Date.parse(w.start), endMs: Date.parse(w.end)}))
      .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs));
  const firstDate = localDate(timeZone, now);
  const lastDate = localDate(timeZone, horizon);

  items.forEach((item, i) => {
    const label = `Slot ${i + 1} (task ${item && item.taskId})`;
    const fail = (msg) => errors.push(`${label}: ${msg}`);

    if (!item || typeof item !== "object") return fail("not an object");
    if (!taskIds.has(item.taskId)) return fail("unknown task id");
    if (seen.has(item.taskId)) return fail("task scheduled more than once");
    seen.add(item.taskId);

    if (item.isAllDay) {
      const date = typeof item.startISO === "string" ? item.startISO.slice(0, 10) : "";
      if (!DATE_ONLY.test(date) || !isRealDate(date)) return fail("invalid all-day date");
      if (date < firstDate || date > lastDate) return fail(`all-day date ${date} outside ${firstDate}..${lastDate}`);
      slots.push({taskId: item.taskId, item, allDay: true, date, endDate: addDays(date, 1)});
      return;
    }

    if (!ISO_WITH_OFFSET.test(item.startISO || "") || !ISO_WITH_OFFSET.test(item.endISO || "")) {
      return fail("start/end must be ISO 8601 with a UTC offset");
    }
    const startMs = Date.parse(item.startISO);
    const endMs = Date.parse(item.endISO);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return fail("unparseable start/end");
    if (endMs <= startMs) return fail("end is not after start");
    if (startMs < now.getTime()) return fail("starts in the past");
    if (endMs > horizon.getTime()) return fail("ends after the 7-day horizon");

    const start = new Date(startMs);
    const end = new Date(endMs);
    if (localDate(timeZone, start) !== localDate(timeZone, end)) return fail("spans more than one local day");
    if (localMinutesOfDay(timeZone, start) < DAY_START_MIN || localMinutesOfDay(timeZone, end) > DAY_END_MIN) {
      return fail("outside 8:00-19:00 local time");
    }
    if (busyMs.some((w) => startMs < w.endMs && endMs > w.startMs)) return fail("overlaps a busy window");

    slots.push({taskId: item.taskId, item, allDay: false, startMs, endMs});
  });

  // Timed slots must not overlap each other
  const timed = slots.filter((s) => !s.allDay).sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].startMs < timed[i - 1].endMs) {
      errors.push(`Slots for tasks ${timed[i - 1].taskId} and ${timed[i].taskId} overlap each other`);
    }
  }

  errors.push(...checkProjectOrder({slots, tasks: allTasks, fixed, timeZone}));

  return {slots, errors};
}

// The task's project tier (its order number), or null when it is outside a project or unordered.
function tierOf(task) {
  return task && task.projectId && Number.isInteger(task.projectOrder) ? task.projectOrder : null;
}

// A validated slot as an interval of instants. An all-day slot occupies its whole local date.
function slotInterval(slot, timeZone) {
  if (slot.allDay) {
    return {startMs: localDayStart(timeZone, slot.date).getTime(), endMs: localDayStart(timeZone, slot.endDate).getTime()};
  }
  return {startMs: slot.startMs, endMs: slot.endMs};
}

// Project order. Pure: no I/O. Returns a list of error strings.
//   slots:    validated slots of this run (validateSchedule's)
//   tasks:    every active task, for projectId and projectOrder
//   fixed:    slots of tasks outside this run, [{taskId, start, end}] with ISO instants (see buildFixedSlots)
//   timeZone: defines what an all-day slot's date covers
// Within a project, every task of a tier must start at or after the end of every task of each lower tier. Tasks
// sharing a tier are unconstrained among themselves, as are tasks without an order number. A task of this run is
// left unscheduled when a lower-tier member of its project has no slot, so that is an error. Two tasks that are
// both outside this run are not checked, and a fixed task never requires a missing slot.
function checkProjectOrder({slots, tasks, fixed = [], timeZone}) {
  const errors = [];
  const intervals = new Map(); // task id -> {startMs, endMs, inRun}
  for (const s of slots) intervals.set(s.taskId, {...slotInterval(s, timeZone), inRun: true});
  for (const f of fixed) {
    if (!f || intervals.has(f.taskId)) continue;
    const startMs = Date.parse(f.start);
    const endMs = Date.parse(f.end);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) intervals.set(f.taskId, {startMs, endMs, inRun: false});
  }

  const members = tasks.filter((t) => tierOf(t) !== null);
  for (const hi of members) {
    const hiSlot = intervals.get(hi.id);
    if (!hiSlot) continue;
    for (const lo of members) {
      if (lo.projectId !== hi.projectId || tierOf(lo) >= tierOf(hi)) continue;
      const loSlot = intervals.get(lo.id);
      const names = `task ${hi.id} (order ${tierOf(hi)}) and task ${lo.id} (order ${tierOf(lo)}) of the same project`;
      if (!loSlot) {
        if (hiSlot.inRun) errors.push(`Project order: ${names}: the earlier one has no slot`);
      } else if ((hiSlot.inRun || loSlot.inRun) && hiSlot.startMs < loSlot.endMs) {
        errors.push(`Project order: ${names}: the later one starts before the earlier one ends`);
      }
    }
  }
  return errors;
}

// ISO instant for a stored schedule value (an ISO time, or a YYYY-MM-DD date taken as local midnight), or null.
function toInstant(value, timeZone) {
  if (typeof value !== "string") return null;
  if (DATE_ONLY.test(value)) return isRealDate(value) ? localDayStart(timeZone, value).toISOString() : null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// The slots of tasks that this run does not place but must respect for project order. Pure: no I/O.
//   tasks:         every active task
//   inScopeIds:    Set of the task ids the run schedules, or null for a full run
//   lockedWindows: Map of task id -> {start, end} (ISO) for the tasks pinned to the personal calendar
//   timeZone:      turns all-day dates into instants
// Locked tasks are fixed at their event windows. In a subset run, every other task outside it that has a stored
// schedule is fixed there (an all-day end date is exclusive). Only tasks with an order number in a project count.
// Returns [{taskId, start, end}] with ISO instants.
function buildFixedSlots({tasks, inScopeIds, lockedWindows, timeZone}) {
  const out = [];
  for (const task of tasks) {
    if (tierOf(task) === null) continue;
    const win = lockedWindows.get(task.id);
    if (win) {
      out.push({taskId: task.id, start: win.start, end: win.end});
    } else if (inScopeIds && !inScopeIds.has(task.id)) {
      const start = toInstant(task.scheduledStart, timeZone);
      const end = toInstant(task.scheduledEnd, timeZone);
      if (start && end) out.push({taskId: task.id, start, end});
    }
  }
  return out;
}

// Match app-tagged events found on the personal calendar to tasks, so those tasks count
// as locked. Pure: no I/O. Each event matches at most one task and vice versa. Passes, in
// order: the task's stored event id, then the event's private `taskId` tag, then the title
// (trimmed, case-insensitive). Returns a Map of task id -> event.
function matchLockedEvents(events, tasks) {
  const byTask = new Map();
  const claimed = new Set();
  const pass = (isMatch) => {
    for (const task of tasks) {
      if (byTask.has(task.id)) continue;
      const ev = events.find((e) => !claimed.has(e) && isMatch(task, e));
      if (ev) {
        byTask.set(task.id, ev);
        claimed.add(ev);
      }
    }
  };
  const norm = (s) => String(s || "").trim().toLowerCase();
  pass((task, ev) => Boolean(task.googleCalendarEventId) && task.googleCalendarEventId === ev.id);
  pass((task, ev) => ((ev.extendedProperties || {}).private || {}).taskId === task.id);
  pass((task, ev) => norm(task.title) !== "" && norm(task.title) === norm(ev.summary));
  return byTask;
}

module.exports = {DAY_START_MIN, DAY_END_MIN, validateSchedule, checkProjectOrder, buildFixedSlots, matchLockedEvents};

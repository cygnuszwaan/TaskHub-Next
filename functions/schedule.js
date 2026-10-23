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

// What per-slot checks need, computed once per run.
function makeContext({tasks, busy, now, horizon, timeZone}) {
  return {
    taskIds: new Set(tasks.map((t) => t.id)),
    busyMs: busy
        .map((w) => ({startMs: Date.parse(w.start), endMs: Date.parse(w.end)}))
        .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs)),
    now,
    horizon,
    timeZone,
    firstDate: localDate(timeZone, now),
    lastDate: localDate(timeZone, horizon),
  };
}

// Check one slot on its own (shape, time window, busy overlap). Returns {slot} or {error}.
function checkItem(item, {taskIds, busyMs, now, horizon, timeZone, firstDate, lastDate}) {
  if (!item || typeof item !== "object") return {error: "not an object"};
  if (!taskIds.has(item.taskId)) return {error: "unknown task id"};

  if (item.isAllDay) {
    const date = typeof item.startISO === "string" ? item.startISO.slice(0, 10) : "";
    if (!DATE_ONLY.test(date) || !isRealDate(date)) return {error: "invalid all-day date"};
    if (date < firstDate || date > lastDate) return {error: `all-day date ${date} outside ${firstDate}..${lastDate}`};
    return {slot: {taskId: item.taskId, item, allDay: true, date, endDate: addDays(date, 1)}};
  }

  if (!ISO_WITH_OFFSET.test(item.startISO || "") || !ISO_WITH_OFFSET.test(item.endISO || "")) {
    return {error: "start/end must be ISO 8601 with a UTC offset"};
  }
  const startMs = Date.parse(item.startISO);
  const endMs = Date.parse(item.endISO);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return {error: "unparseable start/end"};
  if (endMs <= startMs) return {error: "end is not after start"};
  if (startMs < now.getTime()) return {error: "starts in the past"};
  if (endMs > horizon.getTime()) return {error: "ends after the scheduling horizon"};

  const start = new Date(startMs);
  const end = new Date(endMs);
  if (localDate(timeZone, start) !== localDate(timeZone, end)) return {error: "spans more than one local day"};
  if (localMinutesOfDay(timeZone, start) < DAY_START_MIN || localMinutesOfDay(timeZone, end) > DAY_END_MIN) {
    return {error: "outside 8:00-19:00 local time"};
  }
  if (busyMs.some((w) => startMs < w.endMs && endMs > w.startMs)) return {error: "overlaps a busy window"};

  return {slot: {taskId: item.taskId, item, allDay: false, startMs, endMs}};
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
  const ctx = makeContext({tasks, busy, now, horizon, timeZone});
  const {taskIds} = ctx;
  const seen = new Set();

  items.forEach((item, i) => {
    const label = `Slot ${i + 1} (task ${item && item.taskId})`;
    if (item && typeof item === "object" && taskIds.has(item.taskId)) {
      if (seen.has(item.taskId)) return errors.push(`${label}: task scheduled more than once`);
      seen.add(item.taskId);
    }
    const checked = checkItem(item, ctx);
    if (checked.error) return errors.push(`${label}: ${checked.error}`);
    slots.push(checked.slot);
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
function projectOrderViolations({slots, tasks, fixed = [], timeZone}) {
  const out = [];
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
        if (hiSlot.inRun) out.push({hiId: hi.id, loId: lo.id, hiInRun: true, loInRun: false, message: `Project order: ${names}: the earlier one has no slot`});
      } else if ((hiSlot.inRun || loSlot.inRun) && hiSlot.startMs < loSlot.endMs) {
        out.push({hiId: hi.id, loId: lo.id, hiInRun: hiSlot.inRun, loInRun: loSlot.inRun, message: `Project order: ${names}: the later one starts before the earlier one ends`});
      }
    }
  }
  return out;
}

function checkProjectOrder(args) {
  return projectOrderViolations(args).map((v) => v.message);
}

// Make Gemini's answer usable instead of rejecting all of it. Pure: no I/O. Takes the same arguments as
// validateSchedule and returns {slots, dropped, errors}: `slots` are the slots that survive, `dropped` is
// [{taskId, reason}] for every task of the run that ended up without a slot, and `errors` is whatever
// validateSchedule still finds in the survivors (empty by construction; kept as a safety net).
// Rules: a slot that fails its own checks is dropped, a repeated task keeps its first slot, of two overlapping
// timed slots the earlier one is kept, and a project-order violation drops the later-tier task (or, when that task
// is fixed outside the run, the run's earlier-tier task). Dropping a task can only create new violations for the
// higher tiers of its project, so the order check repeats until nothing more is dropped.
function repairSchedule({items, tasks, busy, now, horizon, timeZone, allTasks = tasks, fixed = []}) {
  const ctx = makeContext({tasks, busy, now, horizon, timeZone});
  const dropped = [];
  const drop = (taskId, reason) => dropped.push({taskId, reason});
  let slots = [];
  const seen = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item && typeof item === "object" && ctx.taskIds.has(item.taskId)) {
      if (seen.has(item.taskId)) return; // the first slot for a task wins; the repeat is not a task loss
      seen.add(item.taskId);
    }
    const checked = checkItem(item, ctx);
    if (checked.error) {
      if (item && ctx.taskIds.has(item.taskId)) drop(item.taskId, checked.error);
      return;
    }
    slots.push(checked.slot);
  });

  // Overlaps between timed slots: keep the one that starts first
  const timed = slots.filter((s) => !s.allDay).sort((a, b) => a.startMs - b.startMs);
  const overlapDropped = new Set();
  let lastEnd = -Infinity;
  for (const s of timed) {
    if (s.startMs < lastEnd) {
      overlapDropped.add(s.taskId);
      drop(s.taskId, "overlaps another scheduled task");
    } else {
      lastEnd = s.endMs;
    }
  }
  slots = slots.filter((s) => !overlapDropped.has(s.taskId));

  // Project order, to a fixed point
  for (let guard = 0; guard <= tasks.length + 1; guard++) {
    const violations = projectOrderViolations({slots, tasks: allTasks, fixed, timeZone});
    if (violations.length === 0) break;
    const victims = new Map();
    for (const v of violations) {
      if (v.hiInRun) victims.set(v.hiId, v.message);
      else if (v.loInRun) victims.set(v.loId, v.message);
    }
    if (victims.size === 0) break;
    for (const [id, message] of victims) drop(id, message);
    slots = slots.filter((s) => !victims.has(s.taskId));
  }

  const kept = new Set(slots.map((s) => s.taskId));
  // Tasks the model left out entirely are not "dropped": they simply have no slot. Only report ones it tried.
  const result = validateSchedule({items: slots.map((s) => s.item), tasks, busy, now, horizon, timeZone, allTasks, fixed});
  return {slots: result.slots, dropped: dropped.filter((d) => !kept.has(d.taskId)), errors: result.errors};
}

// Parse the text of Gemini's scheduling answer into its scheduledTasks list. Pure: no I/O. Tolerates a Markdown code
// fence around the JSON and a bare array. Throws an Error with a readable reason when there is nothing usable.
function parseScheduleResponse(text) {
  if (typeof text !== "string" || text.trim() === "") throw new Error("Gemini returned an empty response");
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    throw new Error("Gemini returned malformed JSON (the answer may have been cut off)");
  }
  const list = Array.isArray(data) ? data : data && data.scheduledTasks;
  if (!Array.isArray(list)) throw new Error("Gemini's answer had no scheduledTasks list");
  return list;
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

module.exports = {DAY_START_MIN, DAY_END_MIN, validateSchedule, repairSchedule, parseScheduleResponse, checkProjectOrder, buildFixedSlots, matchLockedEvents};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Deterministic scheduler: places tasks into the open gaps of the working day without asking a model. Pure: no I/O.
// It produces the same item shape Gemini does ({taskId, title, startISO, endISO, transparency, isAllDay, reasoning}),
// so the output goes through the same repairSchedule checks and the same calendar code as a model's answer.
const {localDate, localInstant, localDayStart, formatLocalISO, addDays} = require("./time");
const {DAY_START_MIN, DAY_END_MIN, tierOf} = require("./schedule");
const {isWeatherSensitive} = require("./weather");
const {daysUntilDue} = require("./due");

// Timed slots start on multiples of this many minutes (when a gap opens at an odd minute, the slot waits for the next one).
const SNAP_MINUTES = 5;
const SNAP_MS = SNAP_MINUTES * 60000;
// A task estimated at this many minutes or fewer is a quick chore, shown as free time ("transparent"); longer ones block the calendar.
const QUICK_MINUTES = 15;
// Used for a task without a usable estimate (the same default a new task gets).
const DEFAULT_MINUTES = 15;
// A task longer than the working day cannot sit in one timed slot, so it becomes an all-day reminder.
const DAY_MINUTES = DAY_END_MIN - DAY_START_MIN;

const PRIORITY_RANK = {HIGH: 0, MEDIUM: 1, LOW: 2};

function snapUp(ms) {
  return Math.ceil(ms / SNAP_MS) * SNAP_MS;
}

function durationMinutes(task) {
  const m = task && task.estimatedMinutes;
  return Number.isFinite(m) && m > 0 ? Math.ceil(m) : DEFAULT_MINUTES;
}

// Most urgent first: overdue, then earliest due date, then tasks without one; ties by priority, then by list rank.
// Tasks without a due date go by priority, then rank. Pure: the input is not modified.
function sortByUrgency(tasks, today) {
  return tasks
      .map((task, index) => ({task, index, days: daysUntilDue(task, today)}))
      .sort((a, b) => {
        if (a.days !== b.days) {
          if (a.days === null) return 1;
          if (b.days === null) return -1;
          return a.days - b.days;
        }
        const pa = a.task.priority in PRIORITY_RANK ? PRIORITY_RANK[a.task.priority] : 3;
        const pb = b.task.priority in PRIORITY_RANK ? PRIORITY_RANK[b.task.priority] : 3;
        return (pa - pb) || ((a.task.order || 0) - (b.task.order || 0)) || (a.index - b.index);
      })
      .map(({task}) => task);
}

// The urgency order, adjusted so that a task never comes before a lower-numbered member of its own project that is
// also in the run: project order wins over due dates and priority.
function orderTasks(tasks, today) {
  const remaining = sortByUrgency(tasks, today);
  const done = new Set();
  const out = [];
  const blocked = (t) => tierOf(t) !== null && remaining.some((o) => o !== t && !done.has(o.id) && o.projectId === t.projectId && tierOf(o) !== null && tierOf(o) < tierOf(t));
  while (remaining.length > 0) {
    let i = remaining.findIndex((t) => !blocked(t));
    if (i === -1) i = 0; // cannot happen (the lowest tier is never blocked); keeps the loop finite regardless
    const [task] = remaining.splice(i, 1);
    done.add(task.id);
    out.push(task);
  }
  return out;
}

// The start (ms) of the first stretch inside [minStartMs, limitMs) of `win` that is at least `durMs` long and clear of
// `busy` (sorted by start), or null. Starts are snapped up to SNAP_MINUTES.
function firstFit(win, durMs, busy, minStartMs, maxEndMs) {
  let cursor = snapUp(Math.max(win.startMs, minStartMs));
  const limit = Math.min(win.endMs, maxEndMs);
  for (const b of busy) {
    if (b.endMs <= cursor) continue;
    if (b.startMs >= limit) break;
    if (b.startMs - cursor >= durMs) return cursor;
    cursor = snapUp(Math.max(cursor, b.endMs));
  }
  return cursor + durMs <= limit ? cursor : null;
}

function reasonFor(task, today) {
  const days = daysUntilDue(task, today);
  if (days === null) return "Earliest open gap, by priority.";
  if (days < 0) return `Overdue (due ${task.dueDate}); earliest open gap.`;
  return `Due ${task.dueDate}; earliest open gap.`;
}

// Place `tasks` into the open time between now and the horizon.
//   tasks:    the tasks to place (unlocked, not held)
//   busy:     merged busy windows [{start, end}] (ISO strings); never overlapped
//   now, horizon: Date objects bounding the schedulable range
//   timeZone: the owner's IANA zone, which defines days and the 8:00-19:00 working window
//   weather:  optional {lastDate, rainyDates} (weather.js `weatherWindow`): tasks tagged Outdoor or Garden only go on a
//             local date up to lastDate that is not rainy
//   allTasks: every active task (default `tasks`), for project membership
//   fixed:    [{taskId, start, end}] slots of project members outside the run (see schedule.js `buildFixedSlots`)
// Tasks are taken most urgent first (see sortByUrgency) and each goes in the earliest gap that fits, so a short task can
// fill a gap a longer, more urgent one did not fit. Within a project, a task starts only after every lower-numbered
// member has ended (and ends before any fixed higher-numbered member starts); a task whose lower-numbered member has no
// slot is left out. A task longer than the working day becomes an all-day reminder on the earliest day allowed.
// Returns {items, unplaced}: `items` in the shape of Gemini's scheduledTasks, `unplaced` [{taskId, reason}] for every
// task that got no slot.
function planSchedule({tasks, busy, now, horizon, timeZone, weather, allTasks = tasks, fixed = []}) {
  const today = localDate(timeZone, now);
  const lastDate = localDate(timeZone, horizon);
  const nowMs = snapUp(now.getTime());
  const horizonMs = horizon.getTime();

  // The working window of each local day that has any time left: [8:00, 19:00], cut to [now, horizon]
  const days = [];
  for (let date = today; date <= lastDate && days.length < 400; date = addDays(date, 1)) {
    const open = localInstant(timeZone, date, DAY_START_MIN);
    const close = localInstant(timeZone, date, DAY_END_MIN);
    if (!open || !close) continue;
    const startMs = Math.max(open.getTime(), nowMs);
    const endMs = Math.min(close.getTime(), horizonMs);
    if (endMs > startMs) days.push({date, startMs, endMs});
  }

  const busyMs = (Array.isArray(busy) ? busy : [])
      .map((w) => ({startMs: Date.parse(w.start), endMs: Date.parse(w.end)}))
      .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs) && w.endMs > w.startMs)
      .sort((a, b) => a.startMs - b.startMs);

  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const fixedSlots = [];
  for (const f of fixed) {
    const task = f && byId.get(f.taskId);
    const startMs = f ? Date.parse(f.start) : NaN;
    const endMs = f ? Date.parse(f.end) : NaN;
    if (task && tierOf(task) !== null && !Number.isNaN(startMs) && !Number.isNaN(endMs)) fixedSlots.push({task, startMs, endMs});
  }
  const fixedById = new Map(fixedSlots.map((f) => [f.task.id, f]));

  const placed = new Map(); // task id -> {startMs, endMs}, the run's own slots
  const items = [];
  const unplaced = [];

  for (const task of orderTasks(tasks, today)) {
    // Project order: start after every lower-numbered member, end before any fixed higher-numbered one
    let minStartMs = -Infinity;
    let maxEndMs = Infinity;
    let blockedBy = null;
    const tier = tierOf(task);
    if (tier !== null) {
      for (const other of allTasks) {
        if (other.projectId !== task.projectId || tierOf(other) === null || tierOf(other) >= tier) continue;
        const slot = placed.get(other.id) || fixedById.get(other.id);
        if (slot) minStartMs = Math.max(minStartMs, slot.endMs);
        else blockedBy = other;
      }
      for (const f of fixedSlots) {
        if (f.task.projectId === task.projectId && tierOf(f.task) > tier) maxEndMs = Math.min(maxEndMs, f.startMs);
      }
    }
    if (blockedBy) {
      unplaced.push({taskId: task.id, reason: `an earlier step in its project ("${blockedBy.title}") has no slot`});
      continue;
    }

    const sensitive = isWeatherSensitive(task);
    const allowed = days.filter((d) => !(sensitive && weather && (d.date > weather.lastDate || (weather.rainyDates || []).includes(d.date))));
    const minutes = durationMinutes(task);
    const base = {taskId: task.id, title: task.title, reasoning: reasonFor(task, today)};

    if (minutes > DAY_MINUTES) {
      const day = allowed.find((d) => localDayStart(timeZone, d.date).getTime() >= minStartMs && localDayStart(timeZone, addDays(d.date, 1)).getTime() <= maxEndMs);
      if (!day) {
        unplaced.push({taskId: task.id, reason: sensitive ? "no dry day left inside the forecast window" : "no day left before the horizon or its project order allows"});
        continue;
      }
      const startMs = localDayStart(timeZone, day.date).getTime();
      const endMs = localDayStart(timeZone, addDays(day.date, 1)).getTime();
      placed.set(task.id, {startMs, endMs});
      items.push({...base, startISO: day.date, endISO: addDays(day.date, 1), transparency: "transparent", isAllDay: true});
      continue;
    }

    const durMs = minutes * 60000;
    let startMs = null;
    for (const day of allowed) {
      startMs = firstFit(day, durMs, busyMs, minStartMs, maxEndMs);
      if (startMs !== null) break;
    }
    if (startMs === null) {
      unplaced.push({taskId: task.id, reason: sensitive ? `no gap of ${minutes} minutes left on a dry day inside the forecast window` : `no gap of ${minutes} minutes left before the horizon or its project order allows`});
      continue;
    }
    const endMs = startMs + durMs;
    placed.set(task.id, {startMs, endMs});
    busyMs.push({startMs, endMs});
    busyMs.sort((a, b) => a.startMs - b.startMs);
    items.push({
      ...base,
      startISO: formatLocalISO(timeZone, new Date(startMs)),
      endISO: formatLocalISO(timeZone, new Date(endMs)),
      transparency: minutes <= QUICK_MINUTES ? "transparent" : "opaque",
      isAllDay: false,
    });
  }

  return {items, unplaced};
}

module.exports = {SNAP_MINUTES, QUICK_MINUTES, DEFAULT_MINUTES, planSchedule, sortByUrgency};

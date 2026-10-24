/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Time tracking on a task. A task keeps the seconds it has accrued (`trackedSeconds`, a whole number >= 0, absent
// until first used) and, while its timer runs, the instant it started (`timerStartedAt`, ISO text; absent when paused).
// The first time the timer is ever started on the task is kept as `firstStartedAt` (ISO text, set once and never moved by
// later starts or pauses; absent on a task never timed).
// The task whose timer was started last also carries `active: true`, which a pause leaves in place, so the page can keep
// showing it until another task is started; at most one task has it.
// Everything here is pure: the caller passes the clock as `nowMs` (milliseconds since the epoch).

function startedMs(task) {
  const ms = Date.parse(task && task.timerStartedAt);
  return Number.isNaN(ms) ? null : ms;
}

function savedSeconds(task) {
  const s = task && task.trackedSeconds;
  return Number.isFinite(s) && s > 0 ? Math.round(s) : 0;
}

// Whether the task's timer is running.
function isRunning(task) {
  return startedMs(task) !== null;
}

// Seconds the task has accrued at `nowMs`, the running stretch included. A start in the future (clock skew) or an
// unusable `nowMs` adds nothing.
function elapsedSeconds(task, nowMs) {
  const start = startedMs(task);
  const running = start !== null && Number.isFinite(nowMs) && nowMs > start ? Math.round((nowMs - start) / 1000) : 0;
  return savedSeconds(task) + running;
}

// The task with its timer paused: the running stretch is added to `trackedSeconds` and `timerStartedAt` removed.
// A task whose timer is not running is returned as it is.
function pauseTimer(task, nowMs) {
  if (!isRunning(task)) return task;
  const next = {...task, trackedSeconds: elapsedSeconds(task, nowMs)};
  delete next.timerStartedAt;
  return next;
}

// The task without the `active` mark; a task without it is returned as it is.
function clearActive(task) {
  if (!task || !task.active) return task;
  const next = {...task};
  delete next.active;
  return next;
}

// The task with its timer running from `nowMs` and marked `active` (and `firstStartedAt` set when it has none); one
// already running is returned as it is.
function startTimer(task, nowMs) {
  if (isRunning(task) || !Number.isFinite(nowMs)) return task;
  const iso = new Date(nowMs).toISOString();
  const next = {...task, timerStartedAt: iso, active: true};
  if (Number.isNaN(Date.parse(task && task.firstStartedAt))) next.firstStartedAt = iso;
  return next;
}

// Start or pause one task's timer on the list. Starting also pauses every other running timer, so at most one runs
// at a time, and takes the `active` mark from every other task (a start of a running timer changes nothing, and a
// pause keeps the mark). Pure: the input is not modified; tasks not touched are returned as they were.
//   action: "START" or "PAUSE" (case-insensitive); anything else, or an unknown task id, returns null
// Returns {tasks, task} (the changed task).
function setTimerInList(tasks, taskId, action, nowMs) {
  const verb = typeof action === "string" ? action.trim().toUpperCase() : "";
  if ((verb !== "START" && verb !== "PAUSE") || !tasks.some((t) => t.id === taskId)) return null;
  let changed = null;
  const next = tasks.map((t) => {
    if (t.id === taskId) {
      changed = verb === "START" ? startTimer(t, nowMs) : pauseTimer(t, nowMs);
      return changed;
    }
    return verb === "START" ? clearActive(pauseTimer(t, nowMs)) : t;
  });
  return {tasks: next, task: changed};
}

// A task as it is archived: its timer stopped, `trackedSeconds` holding everything accrued (0 for a task that was
// never timed) and no `active` mark. Pure.
function settleTimer(task, nowMs) {
  const paused = pauseTimer(task, nowMs);
  return {...clearActive(paused), trackedSeconds: savedSeconds(paused)};
}

module.exports = {clearActive, isRunning, elapsedSeconds, pauseTimer, startTimer, setTimerInList, settleTimer};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localDate} = require("./time");
const {isWeatherSensitive} = require("./weather");
const {isRunning} = require("./timer");

// The push alerts the engine and the dispatcher send (see push.js for delivery). Pure: no I/O.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// The dispatcher ticks every 15 minutes. A reminder is sent at the first tick after its moment (start less the lead),
// so it arrives up to one tick after that moment: the leads are all longer than a tick, so a reminder never arrives
// after the task has started.
const TICK_MS = 15 * 60 * 1000;
// The longest stretch one reminder check looks back (after an outage, so a backlog never floods the phone).
const MAX_LOOKBACK_MS = 30 * 60 * 1000;
const MAX_BODY = 200;
const MAX_TITLES = 3;

function clip(text, max = MAX_BODY) {
  const s = String(text === undefined || text === null ? "" : text).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// The local date (YYYY-MM-DD) of a task's scheduledStart: an all-day slot is already one, a timed one is an instant.
// Null for anything else.
function scheduledDate(timeZone, value) {
  if (typeof value !== "string") return null;
  if (DATE_ONLY.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : localDate(timeZone, new Date(t));
}

// Outdoor or Garden tasks a run took off a rainy day. `before` is the task list as it was before the run, `scheduled`
// a Map of task id to {start} for the tasks the run gave a slot, `rainyDates` the forecast's rainy local dates
// (weather.js `weatherWindow`), `today` the local date. A task counts when it was booked on a rainy date from today on
// and now has a different date or none. Returns [{taskId, title, from, to}] (`to` null when it got no slot), in the
// order of `before`. Pure.
function weatherMoves({before, scheduled, rainyDates, today, timeZone}) {
  const rainy = new Set(Array.isArray(rainyDates) ? rainyDates : []);
  const out = [];
  if (!rainy.size) return out;
  for (const task of Array.isArray(before) ? before : []) {
    if (!isWeatherSensitive(task) || task.locked) continue;
    const from = scheduledDate(timeZone, task.scheduledStart);
    if (!from || from < today || !rainy.has(from)) continue;
    const slot = scheduled instanceof Map ? scheduled.get(task.id) : undefined;
    const to = slot ? scheduledDate(timeZone, slot.start) : null;
    if (to !== from) out.push({taskId: task.id, title: task.title, from, to});
  }
  return out;
}

// "Tue 27 Oct" for a local date.
function dayText(date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"}).formatToParts(new Date(`${date}T12:00:00Z`));
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

// "9:30 am" for an instant in the zone.
function timeText(timeZone, date) {
  return new Intl.DateTimeFormat("en-NZ", {hour: "numeric", minute: "2-digit", hour12: true, timeZone}).format(date).replace(/\s/g, " ");
}

// The message for a run's weather moves ({title, body, tag}), or null when there are none.
function weatherMoveMessage(moves) {
  if (!Array.isArray(moves) || !moves.length) return null;
  const describe = (m) => (m.to ? `${m.title} is now on ${dayText(m.to)}` : `${m.title} has no dry slot yet`);
  if (moves.length === 1) return {title: `Rain on ${dayText(moves[0].from)}`, body: clip(`${describe(moves[0])}.`), tag: "weather-moved"};
  const shown = moves.slice(0, MAX_TITLES).map((m) => m.title).join(", ");
  const more = moves.length > MAX_TITLES ? ` and ${moves.length - MAX_TITLES} more` : "";
  return {title: `${moves.length} outdoor tasks moved off rainy days`, body: clip(`${shown}${more}.`), tag: "weather-moved"};
}

// The message for a failed automatic run.
function runFailedMessage(err) {
  const text = clip(err && err.message ? err.message : err) || "Unknown error";
  return {title: "Automatic schedule failed", body: text, tag: "run-failed"};
}

// The stretch one reminder check covers, as epoch ms {from, to}: after the last check (or one tick back when there has
// been none) up to now, never looking back further than MAX_LOOKBACK_MS. `lastAt` is an ISO string or null.
function reminderWindow({lastAt, now}) {
  const nowMs = now.getTime();
  const last = typeof lastAt === "string" ? Date.parse(lastAt) : NaN;
  let from = Number.isNaN(last) || last > nowMs ? nowMs - TICK_MS : last;
  from = Math.max(from, nowMs - MAX_LOOKBACK_MS);
  return {from, to: nowMs};
}

// Tasks whose reminder moment (start less the lead) falls after `from` and up to `to`, and which have not started by
// `to`. Only timed slots count (an all-day one has no start time), and not a task whose timer is already running.
// Oldest start first. Pure.
function dueReminders({tasks, from, to, leadMinutes}) {
  const lead = leadMinutes * 60 * 1000;
  const due = [];
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (typeof task.scheduledStart !== "string" || DATE_ONLY.test(task.scheduledStart) || isRunning(task)) continue;
    const start = Date.parse(task.scheduledStart);
    if (Number.isNaN(start) || start <= to) continue;
    const moment = start - lead;
    if (moment > from && moment <= to) due.push({task, start});
  }
  return due.sort((a, b) => a.start - b.start).map((d) => d.task);
}

// The message for the tasks about to start ({title, body, tag, url}), or null for none. One task: its title and start
// time; several: a count with the first few in order.
function reminderMessage(tasks, timeZone) {
  if (!Array.isArray(tasks) || !tasks.length) return null;
  const at = (t) => timeText(timeZone, new Date(t.scheduledStart));
  if (tasks.length === 1) return {title: clip(tasks[0].title, 100), body: `Starts at ${at(tasks[0])}.`, tag: `starting-${tasks[0].id}`};
  const shown = tasks.slice(0, MAX_TITLES).map((t) => `${t.title} ${at(t)}`).join(", ");
  const more = tasks.length > MAX_TITLES ? ` and ${tasks.length - MAX_TITLES} more` : "";
  return {title: `${tasks.length} tasks starting soon`, body: clip(`${shown}${more}.`), tag: "starting-soon"};
}

module.exports = {TICK_MS, MAX_LOOKBACK_MS, scheduledDate, weatherMoves, weatherMoveMessage, runFailedMessage, reminderWindow, dueReminders, reminderMessage, dayText, timeText};

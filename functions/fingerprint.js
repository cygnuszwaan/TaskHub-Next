/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {createHash} = require("crypto");
const {localDate} = require("./time");
const {snoozeDate} = require("./snooze");

// Bump when the scheduling prompt or the engine's rules change, so the first run after a deploy is never skipped.
const FINGERPRINT_VERSION = 17;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// The fields of a task that can change what Gemini is asked or how it answers. Calendar and schedule fields are
// left out on purpose: the run itself rewrites them, so they would make every run differ from the last.
function taskKey(task) {
  const r = task.recurrence;
  return {
    id: task.id,
    title: task.title,
    description: typeof task.description === "string" ? task.description : "", // it goes into the event, so an edit must re-run the engine
    priority: task.priority,
    dueDate: task.dueDate || "",
    estimatedMinutes: task.estimatedMinutes,
    tags: Array.isArray(task.tags) ? [...task.tags].sort() : [],
    recurrence: r && typeof r === "object" ? {frequency: r.frequency, interval: r.interval} : null,
    order: task.order,
    projectId: task.projectId || null,
    projectOrder: Number.isInteger(task.projectOrder) ? task.projectOrder : null,
    snoozedUntil: snoozeDate(task),
  };
}

// Busy windows reduced to what stays the same between two runs with nothing changed. Free/busy answers are
// clipped to the query range, so a window already under way starts at "now" and one running past the horizon ends
// at the horizon; both move with every run. Those edges become the markers "now" and "horizon".
function normalizeBusy(busySlots, now, horizon) {
  const nowMs = now.getTime();
  const horizonMs = horizon.getTime();
  return busySlots.map((w) => ({
    start: Date.parse(w.start) <= nowMs ? "now" : w.start,
    end: Date.parse(w.end) >= horizonMs ? "horizon" : w.end,
  }));
}

// True when any of the tasks has a scheduled slot that is over, i.e. it was meant to be done and still is on the
// list. A timed slot is over at its end instant; an all-day slot (exclusive end date) at the start of that date.
function hasEndedSlot(tasks, timeZone, now) {
  const today = localDate(timeZone, now);
  return tasks.some((t) => {
    const end = t.scheduledEnd;
    if (typeof end !== "string") return false;
    if (DATE_ONLY.test(end)) return end <= today;
    const ms = Date.parse(end);
    return !Number.isNaN(ms) && ms <= now.getTime();
  });
}

// The coordinates of the tasks being scheduled that have any, as [id, latitude, longitude] sorted by id.
function groupingCoords(tasks, locations) {
  if (!locations) return [];
  return tasks
      .filter((t) => Object.prototype.hasOwnProperty.call(locations, t.id) && locations[t.id])
      .map((t) => [t.id, locations[t.id].latitude, locations[t.id].longitude])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// The anchors as [date, latitude, longitude], sorted.
function groupingAnchors(anchors) {
  return (Array.isArray(anchors) ? anchors : [])
      .map((a) => [a.date, a.latitude, a.longitude])
      .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
}

// Hash of everything an automatic run's outcome depends on.
//   tasks:      the unlocked tasks being scheduled
//   busySlots:  merged busy windows, as passed to the planner
//   weatherKey: coarse weather summary (see weather.js `forecastKey`)
//   settings:   {timeZone, location, scheduleDays, gapMinutes, scheduleOrder, day, travelGrouping} (the lunch break is already part of busySlots)
//   locations:  {taskId: {latitude, longitude}}, the tasks' effective coordinates (location.js `taskCoordinates`); only counted with the area preference on
//   anchors:    [{date, latitude, longitude}], the slots the run leaves in place (schedule.js `buildAnchors`); only counted with the area preference on
//   now, horizon: the run's instant and the end of the scheduling window
function computeFingerprint({tasks, busySlots, weatherKey, settings, now, horizon, locations = null, anchors = []}) {
  const timeZone = settings.timeZone;
  const l = settings.location;
  const g = settings.travelGrouping;
  const payload = {
    version: FINGERPRINT_VERSION,
    timeZone,
    scheduleDays: settings.scheduleDays,
    gapMinutes: settings.gapMinutes || 0,
    scheduleOrder: settings.scheduleOrder === "NUMBER" ? "NUMBER" : "URGENCY",
    day: settings.day ? {start: settings.day.start, end: settings.day.end} : null,
    location: {name: l.name, latitude: l.latitude, longitude: l.longitude},
    today: localDate(timeZone, now),
    weather: weatherKey,
    travelGrouping: g && g.enabled === true ? {radiusKm: g.radiusKm, maxDeferDays: g.maxDeferDays, coords: groupingCoords(tasks, locations), anchors: groupingAnchors(anchors)} : null,
    tasks: tasks.map(taskKey).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    busy: normalizeBusy(busySlots, now, horizon),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

// Whether a run can be skipped: only when the caller allows it, nothing has ended without being completed, and
// the fingerprint equals the one stored by the last successful full run. A slot that has ended always forces a
// run, so a missed task is moved forward instead of sitting in the past.
function shouldSkipRun({skipIfUnchanged, fingerprint, lastRunFingerprint, endedSlot}) {
  if (!skipIfUnchanged || endedSlot) return false;
  return typeof lastRunFingerprint === "string" && lastRunFingerprint === fingerprint;
}

module.exports = {FINGERPRINT_VERSION, taskKey, normalizeBusy, hasEndedSlot, computeFingerprint, shouldSkipRun};

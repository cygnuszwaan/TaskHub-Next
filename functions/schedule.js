/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {getNZDate, getNZMinutesOfDay, addDays} = require("./time");

// Scheduling hours in NZ local time, as minutes since midnight.
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
// Returns {slots, errors}. Slots are only meaningful when errors is empty.
// Timed slots must be parseable, in the future, end by the horizon, sit on one NZ day
// inside 8:00-19:00, and not overlap busy windows or each other. All-day slots must fall
// on an NZ date between today and the horizon's date; they are reminders and skip overlap checks.
function validateSchedule({items, tasks, busy, now, horizon}) {
  const errors = [];
  const slots = [];
  const taskIds = new Set(tasks.map((t) => t.id));
  const seen = new Set();
  const busyMs = busy
      .map((w) => ({startMs: Date.parse(w.start), endMs: Date.parse(w.end)}))
      .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs));
  const firstDate = getNZDate(now);
  const lastDate = getNZDate(horizon);

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
    if (getNZDate(start) !== getNZDate(end)) return fail("spans more than one NZ day");
    if (getNZMinutesOfDay(start) < DAY_START_MIN || getNZMinutesOfDay(end) > DAY_END_MIN) {
      return fail("outside 8:00-19:00 NZ time");
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

  return {slots, errors};
}

module.exports = {DAY_START_MIN, DAY_END_MIN, validateSchedule};

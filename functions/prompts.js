/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localDate, utcOffset, formatLocalNow} = require("./time");
const {annotateDue} = require("./due");

// Place names are typed by the owner; keep one to a single line before it goes into a prompt.
function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

// The scheduling prompt for Gemini. Pure: no I/O.
//   tasks:     the unlocked tasks to schedule
//   busySlots: merged busy windows [{start, end}]
//   now:       the current instant
//   weather:   one-line weather description for the owner's location
//   settings:  {location: {name}, timeZone}; the zone defines the local time, the date and the 8:00-19:00 window
function buildSchedulePrompt({tasks, busySlots, now, weather, settings}) {
  const place = oneLine(settings.location.name);
  const zone = settings.timeZone;
  const nowString = formatLocalNow(zone, now);
  const offset = utcOffset(zone, now);
  const today = localDate(zone, now);

  return `
    You are an AI calendar scheduler in ${place}.
    Current Time: ${nowString} (${zone}, UTC offset ${offset})
    ${place} Weather: ${weather}
    
    Existing Busy Calendar Windows, covering the owner's personal appointments, already-booked task time and tasks the owner has pinned to a time (DO NOT OVERLAP WITH THESE):
    ${JSON.stringify(busySlots, null, 2)}
    
    Today (${zone}): ${today}
    Active Task Queue To Schedule, ordered most urgent first. "overdue" is true when dueDate is before today; "daysUntilDue" is negative when overdue and null when the task has no due date:
    ${JSON.stringify(annotateDue(tasks, today), null, 2)}
    
    Rules:
    1. Schedule uncompleted tasks across the next 7 days in open gaps between 8:00 AM and 7:00 PM local time in ${zone}. Each timed slot must start after the current time, fit entirely within one day's 8:00 AM-7:00 PM window, and must not overlap a busy window or another slot.
    2. Schedule each task at most once. Place overdue tasks first, in the earliest open gaps, then tasks with the nearest due dates. Where possible, place a task with a dueDate on or before that date; a task that cannot fit before its due date goes in the earliest gap left. Tasks without a dueDate fill the remaining gaps by priority.
    3. Set transparency: "opaque" for focus tasks (blocks busy); "transparent" for quick chores/reminders.
    4. Avoid scheduling Outdoor tasks if weather is rainy.
    5. Write every startISO/endISO in local time in ${zone} using the UTC offset that applies on that date (currently ${offset}; it changes if the date falls after a daylight saving change).
    6. Return the non-conflicting schedule matching the JSON schema.
  `;
}

module.exports = {buildSchedulePrompt};

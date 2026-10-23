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
//   projects:  [{id, name}], the stored projects; a task's project name is added to its annotations
//   fixed:     [{taskId, start, end}] slots of tasks outside this run (see buildFixedSlots)
//   allTasks:  every active task (default `tasks`), to say which project and order number each fixed slot has
//   feedback:  problems found in the previous answer (strings), asked to be avoided on a retry
function buildSchedulePrompt({tasks, busySlots, now, weather, settings, projects = [], fixed = [], allTasks = tasks, feedback = []}) {
  const place = oneLine(settings.location.name);
  const zone = settings.timeZone;
  const nowString = formatLocalNow(zone, now);
  const offset = utcOffset(zone, now);
  const today = localDate(zone, now);

  const projectName = new Map(projects.map((p) => [p.id, oneLine(p.name)]));
  const annotated = annotateDue(tasks, today).map((t) => (projectName.has(t.projectId) ? {...t, project: projectName.get(t.projectId)} : t));
  const taskById = new Map(allTasks.map((t) => [t.id, t]));
  const fixedMembers = fixed
      .map((f) => ({f, task: taskById.get(f.taskId)}))
      .filter(({task}) => task && projectName.has(task.projectId) && Number.isInteger(task.projectOrder))
      .map(({f, task}) => ({project: projectName.get(task.projectId), projectOrder: task.projectOrder, start: f.start, end: f.end}));

  const retry = feedback.length === 0 ? "" : `
    Your previous answer had problems. Fix them in this answer:
    ${feedback.map((f) => `- ${oneLine(f)}`).join("\n    ")}
    `;

  return `
    You are an AI calendar scheduler in ${place}.
    Current Time: ${nowString} (${zone}, UTC offset ${offset})
    ${place} Weather: ${weather}
    
    Existing Busy Calendar Windows, covering the owner's personal appointments, already-booked task time and tasks the owner has pinned to a time (DO NOT OVERLAP WITH THESE):
    ${JSON.stringify(busySlots, null, 2)}
    
    Today (${zone}): ${today}
    Active Task Queue To Schedule, ordered most urgent first. "overdue" is true when dueDate is before today; "daysUntilDue" is negative when overdue and null when the task has no due date:
    ${JSON.stringify(annotated, null, 2)}
    
    Project members already placed outside this run (they are also busy windows; their project and projectOrder apply to the order rule below):
    ${JSON.stringify(fixedMembers, null, 2)}
    
    Rules:
    1. Schedule uncompleted tasks across the next 7 days in open gaps between 8:00 AM and 7:00 PM local time in ${zone}. Each timed slot must start after the current time, fit entirely within one day's 8:00 AM-7:00 PM window, and must not overlap a busy window or another slot.
    2. Schedule each task at most once. Place overdue tasks first, in the earliest open gaps, then tasks with the nearest due dates. Where possible, place a task with a dueDate on or before that date; a task that cannot fit before its due date goes in the earliest gap left. Tasks without a dueDate fill the remaining gaps by priority.
    3. Project order, which overrides due dates and priority: tasks with the same "project" and a "projectOrder" must run in order. Every task with a lower projectOrder must end before any task of that project with a higher projectOrder starts (a task scheduled all-day occupies its whole date, so it must be on a later date). Tasks sharing a projectOrder may go in any order, and a task without a projectOrder is unconstrained. The placed project members listed above count too. If a task cannot be scheduled, leave out every task of that project with a higher projectOrder as well.
    4. Set transparency: "opaque" for focus tasks (blocks busy); "transparent" for quick chores/reminders.
    5. Avoid scheduling Outdoor tasks if weather is rainy.
    6. Write every startISO/endISO in local time in ${zone} using the UTC offset that applies on that date (currently ${offset}; it changes if the date falls after a daylight saving change).
    7. Return the non-conflicting schedule matching the JSON schema. Always return as many tasks as fit; return an empty list only if nothing fits at all.
    ${retry}
  `;
}

// The prompt that turns free text into new or changed tasks. Pure: no I/O.
//   tasks:    the stored task list (the model sees only the fields it may change, plus id, rank and project)
//   projects: [{id, name}], the stored projects; the model may only use these ids
//   input:    the text the owner typed
//   today:    the current local date, YYYY-MM-DD
function buildTaskPrompt({tasks, projects, input, today}) {
  const visibleTasks = tasks.map(({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, projectId, projectOrder, order}) => ({id, title, priority, dueDate, estimatedMinutes, tags, recurrence, projectId, projectOrder, order}));
  const visibleProjects = projects.map((p) => ({id: p.id, name: oneLine(p.name)}));

  return `
      You are an expert task queue organizer. Today's date is: ${today}.
      
      Current Task List (for context; do not return tasks you leave unchanged):
      ${JSON.stringify(visibleTasks, null, 2)}
      
      Existing Projects (the only projects a task can belong to):
      ${JSON.stringify(visibleProjects, null, 2)}
      
      New Input: "${input}"
      
      Parse the input into tasks, inferring priority, estimatedMinutes and tags.
      Return ONLY the tasks that are new or that the input changes.
      For a change to an existing task, return it with that task's id and its complete updated fields.
      For a new task, leave id empty.
      Set order to the rank (from 1) the task should hold in the full list.
      If the input says a task repeats (for example "every Monday", "monthly", "every 2 weeks"), set recurrence
      to the frequency and interval, and set dueDate to its first occurrence. Leave recurrence out for tasks that do not repeat
      and for existing tasks whose repetition the input does not mention. To stop an existing task repeating, return frequency NONE.
      If the input says a task belongs to one of the Existing Projects, set projectId to that project's id, copied exactly from the list.
      Never invent a project or an id: if the input names a project that is not listed, leave projectId out.
      If the input gives the task's place in the project's sequence (for example "first", "step 2"), set projectOrder to a whole number from 1; tasks that can be done in any order share a number.
      Leave projectId and projectOrder out for tasks the input does not place in a project, and for existing tasks whose project the input does not mention.
      You cannot create, rename or delete projects, or take a task out of one.
    `;
}

module.exports = {buildSchedulePrompt, buildTaskPrompt};

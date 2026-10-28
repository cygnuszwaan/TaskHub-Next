/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Batch changes to several queued tasks at once (the Queue's Multi-Select mode). Pure: no I/O, the input is not modified.
// Completing and deleting are not here: they go through `completeTask` and `updateTaskDirect` one task at a time, since
// each also archives, cleans up the calendar and keeps photos.

const {applyProjectFields} = require("./projects");
const {normalizeSnooze} = require("./snooze");
const {hasOpenMaterials} = require("./materials");

const BATCH_ACTIONS = ["MOVE_TO_TOP", "SET_PROJECT", "SET_DUE", "SNOOZE"];
const MAX_BATCH = 500;

// The tasks in queue order (`order`, ties in list order), as moveToQueueNumber reads them.
function inQueueOrder(tasks) {
  return tasks.map((t, i) => [t, i]).sort((a, b) => (a[0].order || 0) - (b[0].order || 0) || a[1] - b[1]).map((pair) => pair[0]);
}

// The selected tasks moved to the top of the queue, keeping the order they had among themselves, every rank renumbered
// 1..n. Ids that match no task are ignored. Returns null when none matches.
function moveToTop(tasks, ids) {
  const wanted = new Set(ids);
  const list = inQueueOrder(tasks);
  const picked = list.filter((t) => wanted.has(t.id));
  if (picked.length === 0) return null;
  return [...picked, ...list.filter((t) => !wanted.has(t.id))].map((t, i) => ({...t, order: i + 1}));
}

// Whether a changed snooze should be followed by finding the task a new time at once: it has a calendar event, is not
// pinned to the personal calendar and is not waiting on materials (the page's snoozeNeedsReschedule).
function needsReschedule(task) {
  return Boolean(task.googleCalendarEventId || task.scheduledStart) && !task.locked && !hasOpenMaterials(task);
}

// Applies one batch action to the tasks named in `request.taskIds`.
//   request:    {action, taskIds, projectId?, dueDate?, snoozedUntil?}
//     MOVE_TO_TOP  no value
//     SET_PROJECT  `projectId`, which must be in `projectIds`; a task already in it keeps its order number, any other loses it;
//                  `projectId: null` takes the tasks out of their project and drops their order numbers
//     SET_DUE      `dueDate`, a real YYYY-MM-DD date; null or "" clears it (stored as "")
//     SNOOZE       `snoozedUntil`, a real YYYY-MM-DD date; null or "" unsnoozes
//   projectIds: ids of the projects that exist
// Returns {tasks, count, ids} (`count` tasks matched, `ids` their ids in queue order) or {error} for an unusable request,
// or {error, notFound: true} when no task matches. Ids that match no task are ignored.
function applyBatch(tasks, request, projectIds = []) {
  const {action, taskIds} = request || {};
  if (!BATCH_ACTIONS.includes(action)) return {error: `action must be one of ${BATCH_ACTIONS.join(", ")}`};
  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.some((id) => typeof id !== "string")) return {error: "taskIds must be a list of task ids"};
  if (taskIds.length > MAX_BATCH) return {error: `At most ${MAX_BATCH} tasks at a time`};
  const wanted = new Set(taskIds);
  const ids = inQueueOrder(tasks).filter((t) => wanted.has(t.id)).map((t) => t.id);
  if (ids.length === 0) return {error: "No matching tasks", notFound: true};
  const hit = new Set(ids);
  const change = (fn) => ({tasks: tasks.map((t) => (hit.has(t.id) ? fn(t) : t)), count: ids.length, ids});

  if (action === "MOVE_TO_TOP") return {tasks: moveToTop(tasks, ids), count: ids.length, ids};
  if (action === "SET_PROJECT") {
    const {projectId} = request;
    if (projectId === null) return change((t) => applyProjectFields(t, {projectId: null}, projectIds));
    if (typeof projectId !== "string" || !projectIds.includes(projectId)) return {error: "Project not found"};
    return change((t) => applyProjectFields(t, {projectId}, projectIds));
  }
  if (action === "SET_DUE") {
    const date = normalizeSnooze(request.dueDate);
    if (date === undefined) return {error: "dueDate must be a date (YYYY-MM-DD) or empty"};
    return change((t) => ({...t, dueDate: date === null ? "" : date}));
  }
  const date = normalizeSnooze(request.snoozedUntil);
  if (date === undefined) return {error: "snoozedUntil must be a date (YYYY-MM-DD) or empty"};
  return change((t) => {
    const next = {...t};
    if (date === null) delete next.snoozedUntil;
    else next.snoozedUntil = date;
    return next;
  });
}

module.exports = {BATCH_ACTIONS, MAX_BATCH, moveToTop, needsReschedule, applyBatch};

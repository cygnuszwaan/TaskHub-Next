/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {isRunning} = require("./timer");

// Finding duplicate tasks in the queue. Pure: no I/O.
// Two tasks are copies of each other when they have the same title (ignoring case and extra spaces), due date, project and
// repeat rule; priority, estimate and tags are left out so a copy the model altered still counts. Of each group the
// earliest added is kept (a task without `addedAt` predates the field, so it counts as the oldest; ties go to the one
// higher in the queue) and the more recently added copies are removed, except a copy that has been worked on (its timer
// is running or it has tracked time), which is never removed.

function duplicateKey(task) {
  const title = String(task.title || "").trim().replace(/\s+/g, " ").toLowerCase();
  return JSON.stringify([title, task.dueDate || "", task.projectId || "", task.recurrence || null]);
}

function workedOn(task) {
  return isRunning(task) || Number(task.trackedSeconds) > 0;
}

// Oldest first: no addedAt, then by addedAt, then by place in the queue.
function byAge(a, b) {
  const at = (t) => (typeof t.addedAt === "string" && !isNaN(Date.parse(t.addedAt)) ? Date.parse(t.addedAt) : -Infinity);
  if (at(a) !== at(b)) return at(a) < at(b) ? -1 : 1;
  return (a.order || 0) - (b.order || 0);
}

// The tasks to remove, as they are in `tasks`, in queue order.
function findDuplicateTasks(tasks) {
  const groups = new Map();
  for (const task of tasks || []) {
    if (!task || typeof task.title !== "string" || task.title.trim() === "") continue;
    const key = duplicateKey(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const remove = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keeper = group.find(workedOn) || [...group].sort(byAge)[0];
    for (const task of group) if (task !== keeper && !workedOn(task)) remove.push(task);
  }
  return remove.sort((a, b) => (a.order || 0) - (b.order || 0));
}

module.exports = {findDuplicateTasks, duplicateKey};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

const {normalizeJobNumber, lastIssued} = require("./jobNumber");

// Backfill of job numbers onto tasks and completed tasks that predate them. Pure: scripts/backfillJobNumbers.js does the I/O.

// A Firestore Timestamp, Date or ISO string as milliseconds; null when it is none of those.
function toMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// Plans the numbering of every task and completed task that has no usable job number.
//   tasks, completed: arrays of documents ({id, addedAt, completedAt, order, jobNumber, ...}) from `tasks` and `completed_tasks`
//   last:             the counter document's `last` (the last number issued)
// Oldest first, so the numbers follow the order the jobs were created: by `addedAt`, else (a completed task from before
// `addedAt` existed) by `completedAt`, else (a queued task from before it existed) before everything; ties by completion time
// (a queued task after a completed one), queue rank, then id, so the plan is the same on every run. Numbers run on from `last`.
// Returns {assignments: [{collection, id, jobNumber}], last (the counter after the plan), alreadyNumbered, error}; `error`
// is set (and nothing planned) when an existing job number is above the counter, which should never happen.
function planBackfill({tasks = [], completed = [], last = 0} = {}) {
  const start = lastIssued({last});
  const items = [
    ...tasks.map((doc) => ({collection: "tasks", doc})),
    ...completed.map((doc) => ({collection: "completed_tasks", doc})),
  ];
  let alreadyNumbered = 0;
  let highest = 0;
  const todo = [];
  for (const item of items) {
    const n = normalizeJobNumber(item.doc.jobNumber);
    if (n === null) {
      todo.push(item);
    } else {
      alreadyNumbered++;
      highest = Math.max(highest, n);
    }
  }
  if (highest > start) return {assignments: [], last: start, alreadyNumbered, error: `A task already has job number ${highest}, above the counter (${start}); not numbering anything`};
  const keyOf = ({collection, doc}) => {
    const addedMs = toMs(doc.addedAt);
    const completedMs = toMs(doc.completedAt);
    let created = -Infinity;
    if (addedMs !== null) created = addedMs;
    else if (completedMs !== null) created = completedMs;
    return {
      created,
      completed: collection === "completed_tasks" && completedMs !== null ? completedMs : Infinity,
      order: Number.isFinite(doc.order) ? doc.order : 0,
    };
  };
  const keyed = todo.map((item) => ({item, key: keyOf(item)}));
  keyed.sort((a, b) => {
    for (const field of ["created", "completed", "order"]) {
      if (a.key[field] !== b.key[field]) return a.key[field] < b.key[field] ? -1 : 1;
    }
    return String(a.item.doc.id) < String(b.item.doc.id) ? -1 : String(a.item.doc.id) > String(b.item.doc.id) ? 1 : 0;
  });
  const assignments = keyed.map(({item}, i) => ({collection: item.collection, id: item.doc.id, jobNumber: start + i + 1}));
  return {assignments, last: start + assignments.length, alreadyNumbered, error: null};
}

module.exports = {toMs, planBackfill};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {historyBefore, reopenTask} = require("../reopen");

let n = 0;
const makeId = () => `new${++n}`;
const queue = () => [
  {id: "a", title: "A", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 1},
  {id: "b", title: "B", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 4},
];
const row = (extra = {}) => ({
  id: "t1", title: "Fit the vanity", priority: "HIGH", dueDate: "2026-10-30", estimatedMinutes: 60, tags: ["Indoor"], status: "PENDING",
  order: 2, trackedSeconds: 2700, firstStartedAt: "2026-10-20T09:00:00.000Z", addedAt: "2026-10-18T01:00:00.000Z",
  comments: "Use the long screws", materials: [{id: "m1", text: "Screws", checked: true}],
  completedAt: new Date("2026-10-22T03:00:00Z"), completedCount: 3, recentSeconds: [1800, 2400, 2700], ...extra,
});

describe("reopen.js", () => {
  describe("reopenTask", () => {
    it("puts the task back at the end of the queue as PENDING with its own id, order after the last rank, and its fields", () => {
      const r = reopenTask(queue(), row(), {makeId});
      assert.equal(r.tasks.length, 3);
      assert.deepEqual(r.tasks.slice(0, 2), queue());
      const t = r.tasks[2];
      assert.equal(t, r.task);
      assert.equal(t.id, "t1");
      assert.equal(t.status, "PENDING");
      assert.equal(t.order, 5);
      for (const key of ["title", "priority", "dueDate", "estimatedMinutes", "tags", "comments", "materials", "addedAt"]) assert.deepEqual(t[key], row()[key], key);
    });
    it("keeps the accrued time and the first-started time, with the timer stopped and no active mark", () => {
      const t = reopenTask(queue(), row({timerStartedAt: "2026-10-22T02:00:00.000Z", active: true}), {makeId}).task;
      assert.equal(t.trackedSeconds, 2700);
      assert.equal(t.firstStartedAt, "2026-10-20T09:00:00.000Z");
      assert.equal("timerStartedAt" in t, false);
      assert.equal("active" in t, false);
    });
    it("rounds the tracked time and leaves the key out when there was none", () => {
      assert.equal(reopenTask(queue(), row({trackedSeconds: 59.6}), {makeId}).task.trackedSeconds, 60);
      for (const trackedSeconds of [0, undefined, -5, "x"]) assert.equal("trackedSeconds" in reopenTask(queue(), row({trackedSeconds}), {makeId}).task, false, String(trackedSeconds));
    });
    it("drops the completion's own fields and the archive id", () => {
      const t = reopenTask(queue(), row({archiveId: "arch1"}), {makeId}).task;
      for (const key of ["completedAt", "archiveId"]) assert.equal(key in t, false, key);
    });
    it("takes a new id when the row's id is already on the list, or the row has none", () => {
      assert.equal(reopenTask(queue(), row({id: "a"}), {makeId}).task.id.startsWith("new"), true);
      const noId = row();
      delete noId.id;
      assert.equal(reopenTask(queue(), noId, {makeId}).task.id.startsWith("new"), true);
    });
    it("clears the schedule fields of an unpinned task but keeps a pinned task's", () => {
      const scheduled = {googleCalendarEventId: "ev1", scheduledStart: "2026-10-21T09:00:00+13:00", scheduledEnd: "2026-10-21T10:00:00+13:00"};
      const free = reopenTask(queue(), row(scheduled), {makeId}).task;
      for (const key of Object.keys(scheduled)) assert.equal(key in free, false, key);
      const pinned = reopenTask(queue(), row({...scheduled, locked: true}), {makeId}).task;
      assert.deepEqual([pinned.googleCalendarEventId, pinned.scheduledStart, pinned.locked], ["ev1", scheduled.scheduledStart, true]);
    });
    it("does not repeat, and says when it had a repetition", () => {
      const weekly = reopenTask(queue(), row({recurrence: {frequency: "WEEKLY", interval: 1}}), {makeId});
      assert.equal("recurrence" in weekly.task, false);
      assert.equal(weekly.droppedRecurrence, true);
      assert.equal(reopenTask(queue(), row(), {makeId}).droppedRecurrence, false);
    });
    it("leaves a project that no longer exists, and keeps a current one with its order number", () => {
      const gone = reopenTask(queue(), row({projectId: "p9", projectOrder: 2}), {projectIds: ["p1"], makeId}).task;
      assert.deepEqual([gone.projectId, gone.projectOrder], [undefined, undefined]);
      const kept = reopenTask(queue(), row({projectId: "p1", projectOrder: 2}), {projectIds: ["p1"], makeId}).task;
      assert.deepEqual([kept.projectId, kept.projectOrder], ["p1", 2]);
      assert.equal("projectId" in reopenTask(queue(), row({projectId: "p1"}), {makeId}).task, false, "no project list means none are known");
    });
    it("takes the job's history back to what it was before the completion", () => {
      const t = reopenTask(queue(), row(), {makeId}).task;
      assert.equal(t.completedCount, 2);
      assert.deepEqual(t.recentSeconds, [1800, 2400]);
    });
    it("works on a list with no ranks, an empty list and a missing list", () => {
      assert.equal(reopenTask([{id: "x"}], row(), {makeId}).task.order, 1);
      assert.deepEqual(reopenTask([], row(), {makeId}).tasks.map((t) => t.id), ["t1"]);
      assert.equal(reopenTask(undefined, row(), {makeId}).tasks.length, 1);
    });
    it("refuses a row without a title, and anything that is not a row", () => {
      for (const bad of [null, undefined, "x", {}, {title: "  "}, {title: 5}]) assert.match(reopenTask(queue(), bad, {makeId}).error, /no title/, JSON.stringify(bad));
    });
    it("does not modify the list or the row passed in", () => {
      const tasks = queue();
      const source = row({recurrence: {frequency: "DAILY", interval: 1}, googleCalendarEventId: "ev1"});
      const copy = JSON.parse(JSON.stringify(source));
      reopenTask(tasks, source, {makeId});
      assert.deepEqual(tasks, queue());
      assert.deepEqual(JSON.parse(JSON.stringify(source)), copy);
    });
  });

  describe("historyBefore", () => {
    it("takes off one completion and the completion's own time", () => {
      assert.deepEqual(historyBefore(row()), {completedCount: 2, recentSeconds: [1800, 2400]});
    });
    it("leaves the samples alone when the last one is not this completion's time (a corrected row), or the time was zero", () => {
      assert.deepEqual(historyBefore(row({trackedSeconds: 3000})), {completedCount: 2, recentSeconds: [1800, 2400, 2700]});
      assert.deepEqual(historyBefore(row({trackedSeconds: 0})), {completedCount: 2, recentSeconds: [1800, 2400, 2700]});
    });
    it("leaves out what is empty: a first completion has no history before it, and an old row has none to roll back", () => {
      assert.deepEqual(historyBefore({trackedSeconds: 600, completedCount: 1, recentSeconds: [600]}), {});
      assert.deepEqual(historyBefore({trackedSeconds: 600}), {});
      assert.deepEqual(historyBefore(null), {});
    });
  });
});

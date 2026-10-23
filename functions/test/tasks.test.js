/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_INTERVAL, normalizeRecurrence, applyDirectUpdate, completeInList, mergeTaskChanges, applyScheduleResults} = require("../tasks");

function makeIdGenerator() {
  let n = 0;
  return () => `new${++n}`;
}

function existingTasks() {
  return [
    {id: "a", title: "A", priority: "HIGH", dueDate: "", estimatedMinutes: 30, tags: [], status: "PENDING", order: 1, googleCalendarEventId: "ev1", scheduledStart: "s", scheduledEnd: "e", locked: true},
    {id: "b", title: "B", priority: "LOW", dueDate: "", estimatedMinutes: 10, tags: [], status: "PENDING", order: 2},
    {id: "c", title: "C", priority: "LOW", dueDate: "", estimatedMinutes: 10, tags: [], status: "PENDING", order: 3},
  ];
}

describe("tasks.js", () => {
  describe("completeInList", () => {
    const today = "2026-10-23";
    const weekly = {frequency: "WEEKLY", interval: 1};

    it("returns null for an unknown id", () => {
      assert.equal(completeInList(existingTasks(), "zzz", today, makeIdGenerator()), null);
    });
    it("removes a task that does not repeat and spawns nothing", () => {
      const r = completeInList(existingTasks(), "b", today, makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => t.id), ["a", "c"]);
      assert.equal(r.completedTask.id, "b");
      assert.equal(r.spawned, null);
    });
    it("leaves the other tasks exactly as they were", () => {
      const tasks = existingTasks();
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.deepEqual(r.tasks, [tasks[0], tasks[2]]);
    });
    it("creates the next occurrence of a repeating task at the same rank", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, dueDate: "2026-10-26", tags: ["home"], recurrence: weekly} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.deepEqual(r.spawned, {id: "new1", title: "B", priority: "LOW", dueDate: "2026-11-02", estimatedMinutes: 10, tags: ["home"], status: "PENDING", recurrence: weekly, order: 2});
      assert.deepEqual(r.tasks.map((t) => t.id).sort(), ["a", "c", "new1"]);
      assert.equal(r.tasks.find((t) => t.id === "new1"), r.spawned);
      assert.equal(r.completedTask.id, "b");
    });
    it("does not carry over schedule, calendar or lock fields, and does not share the tags array", () => {
      const tasks = existingTasks().map((t) => (t.id === "a" ? {...t, tags: ["x"], recurrence: weekly} : t));
      const r = completeInList(tasks, "a", today, makeIdGenerator());
      for (const key of ["googleCalendarEventId", "scheduledStart", "scheduledEnd", "locked"]) {
        assert.equal(key in r.spawned, false, key);
      }
      r.spawned.tags.push("y");
      assert.deepEqual(tasks[0].tags, ["x"]);
    });
    it("uses today as the base when the task has no due date", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: {frequency: "DAILY", interval: 3}} : t));
      assert.equal(completeInList(tasks, "b", today, makeIdGenerator()).spawned.dueDate, "2026-10-26");
    });
    it("skips missed occurrences when a task is completed late", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, dueDate: "2026-10-02", recurrence: weekly} : t));
      assert.equal(completeInList(tasks, "b", today, makeIdGenerator()).spawned.dueDate, "2026-10-30");
    });
    it("treats an invalid stored recurrence as not repeating", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: {frequency: "HOURLY", interval: 1}} : t));
      assert.equal(completeInList(tasks, "b", today, makeIdGenerator()).spawned, null);
    });
    it("only asks for a new id when it spawns, and does not modify its input", () => {
      let calls = 0;
      const makeId = () => `n${++calls}`;
      const tasks = existingTasks();
      const copy = JSON.stringify(tasks);
      completeInList(tasks, "b", today, makeId);
      assert.equal(calls, 0);
      assert.equal(JSON.stringify(tasks), copy);
    });
    it("gives the next occurrence the same project and order number", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly, projectId: "p1", projectOrder: 2} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.equal(r.spawned.projectId, "p1");
      assert.equal(r.spawned.projectOrder, 2);
    });
    it("gives the next occurrence a project without an order number when the task had none", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly, projectId: "p1"} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.equal(r.spawned.projectId, "p1");
      assert.equal("projectOrder" in r.spawned, false);
    });
    it("leaves project keys off the next occurrence of a task outside any project", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.equal("projectId" in r.spawned, false);
      assert.equal("projectOrder" in r.spawned, false);
    });
  });

  describe("normalizeRecurrence", () => {
    it("accepts each frequency with a whole interval", () => {
      for (const frequency of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]) {
        assert.deepEqual(normalizeRecurrence({frequency, interval: 2}), {frequency, interval: 2});
      }
    });
    it("is case-insensitive about the frequency and ignores extra fields", () => {
      assert.deepEqual(normalizeRecurrence({frequency: " weekly ", interval: 1, extra: true}), {frequency: "WEEKLY", interval: 1});
    });
    it("rounds and clamps the interval, defaulting to 1", () => {
      assert.equal(normalizeRecurrence({frequency: "DAILY", interval: 2.6}).interval, 3);
      assert.equal(normalizeRecurrence({frequency: "DAILY", interval: 0}).interval, 1);
      assert.equal(normalizeRecurrence({frequency: "DAILY", interval: -4}).interval, 1);
      assert.equal(normalizeRecurrence({frequency: "DAILY", interval: 10000}).interval, MAX_INTERVAL);
      for (const interval of [undefined, null, "3", NaN, Infinity]) {
        assert.equal(normalizeRecurrence({frequency: "MONTHLY", interval}).interval, 1);
      }
    });
    it("returns null for null and for frequency NONE, meaning the task does not repeat", () => {
      assert.equal(normalizeRecurrence(null), null);
      assert.equal(normalizeRecurrence({frequency: "NONE", interval: 1}), null);
      assert.equal(normalizeRecurrence({frequency: "none"}), null);
    });
    it("returns undefined, meaning no change, for missing or unusable values", () => {
      for (const value of [undefined, "", "WEEKLY", 5, [], {}, {frequency: "HOURLY", interval: 1}, {frequency: 7}, {interval: 2}]) {
        assert.equal(normalizeRecurrence(value), undefined);
      }
    });
  });

  describe("applyDirectUpdate", () => {
    const base = {id: "a", title: "A", priority: "LOW"};
    const weekly = {frequency: "WEEKLY", interval: 1};

    it("applies the fields and leaves the task alone when recurrence is not mentioned", () => {
      assert.deepEqual(applyDirectUpdate({...base, recurrence: weekly}, {title: "A2"}), {...base, title: "A2", recurrence: weekly});
    });
    it("sets a validated recurrence", () => {
      assert.deepEqual(applyDirectUpdate(base, {recurrence: {frequency: "monthly", interval: 2.2, junk: 1}}).recurrence, {frequency: "MONTHLY", interval: 2});
    });
    it("removes the recurrence for null or NONE, leaving no key behind", () => {
      for (const recurrence of [null, {frequency: "NONE", interval: 1}]) {
        const out = applyDirectUpdate({...base, recurrence: weekly}, {recurrence});
        assert.equal("recurrence" in out, false);
      }
    });
    it("keeps the existing recurrence when the new value is unusable, and adds none to a task without one", () => {
      assert.deepEqual(applyDirectUpdate({...base, recurrence: weekly}, {recurrence: "often"}).recurrence, weekly);
      assert.equal("recurrence" in applyDirectUpdate(base, {recurrence: "often"}), false);
      assert.equal("recurrence" in applyDirectUpdate(base, {recurrence: undefined}), false);
    });
    it("does not modify its input", () => {
      const task = {...base, recurrence: weekly};
      applyDirectUpdate(task, {recurrence: null, title: "x"});
      assert.deepEqual(task, {...base, recurrence: weekly});
    });
    it("joins a project that exists and sets its order number", () => {
      assert.deepEqual(applyDirectUpdate(base, {projectId: "p1", projectOrder: 2}, ["p1"]), {...base, projectId: "p1", projectOrder: 2});
    });
    it("cannot join an unknown project, or any project when no ids are given", () => {
      assert.deepEqual(applyDirectUpdate(base, {projectId: "p9"}, ["p1"]), base);
      assert.deepEqual(applyDirectUpdate(base, {projectId: "p1"}), base);
    });
    it("leaves a project, taking the order number with it, even when no ids are given", () => {
      assert.deepEqual(applyDirectUpdate({...base, projectId: "p1", projectOrder: 2}, {projectId: null}), base);
    });
    it("applies other fields alongside project fields", () => {
      assert.deepEqual(applyDirectUpdate(base, {title: "A2", projectId: "p1"}, ["p1"]), {...base, title: "A2", projectId: "p1"});
    });
    it("never copies unvalidated project keys straight from the fields", () => {
      assert.deepEqual(applyDirectUpdate(base, {projectId: "p9", projectOrder: 3}, ["p1"]), base);
    });
  });

  describe("mergeTaskChanges: recurrence", () => {
    const weekly = {frequency: "WEEKLY", interval: 1};

    it("stores a recurrence on a new task", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "Bins", recurrence: {frequency: "weekly", interval: 2}}], makeIdGenerator());
      assert.deepEqual(r.tasks[3].recurrence, {frequency: "WEEKLY", interval: 2});
    });
    it("gives a new task no recurrence key when none, NONE or an invalid value is given", () => {
      for (const recurrence of [undefined, null, {frequency: "NONE", interval: 1}, {frequency: "HOURLY", interval: 1}]) {
        const r = mergeTaskChanges(existingTasks(), [{title: "T", recurrence}], makeIdGenerator());
        assert.equal("recurrence" in r.tasks[3], false);
      }
    });
    it("sets a recurrence on an existing task", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", recurrence: weekly}], makeIdGenerator());
      assert.deepEqual(r.tasks[1].recurrence, weekly);
    });
    it("keeps an existing recurrence when the change omits it or gives an invalid one", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly} : t));
      for (const change of [{id: "b", title: "B2"}, {id: "b", recurrence: "weekly"}, {id: "b", recurrence: {frequency: "x"}}]) {
        assert.deepEqual(mergeTaskChanges(tasks, [change], makeIdGenerator()).tasks[1].recurrence, weekly);
      }
    });
    it("removes an existing recurrence for frequency NONE, leaving no key behind", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly} : t));
      const r = mergeTaskChanges(tasks, [{id: "b", recurrence: {frequency: "NONE", interval: 1}}], makeIdGenerator());
      assert.equal("recurrence" in r.tasks[1], false);
      assert.equal(r.updated, 1);
    });
  });

  describe("mergeTaskChanges: updates", () => {
    it("keeps project membership and order when the change does not mention them", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, projectId: "p1", projectOrder: 2} : t));
      const r = mergeTaskChanges(tasks, [{id: "b", title: "B2", priority: "LOW", estimatedMinutes: 10, tags: []}], makeIdGenerator(), ["p1"]);
      const b = r.tasks.find((t) => t.id === "b");
      assert.equal(b.title, "B2");
      assert.equal(b.projectId, "p1");
      assert.equal(b.projectOrder, 2);
    });
  });

  describe("mergeTaskChanges: projects", () => {
    const ids = ["p1", "p2"];
    const inProject = (extra = {}) => existingTasks().map((t) => (t.id === "b" ? {...t, projectId: "p1", projectOrder: 2, ...extra} : t));
    const byId = (r, id) => r.tasks.find((t) => t.id === id);

    it("puts a new task into an existing project with an order number", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "N", projectId: "p1", projectOrder: 3}], makeIdGenerator(), ids);
      const n = r.tasks.find((t) => t.title === "N");
      assert.equal(n.projectId, "p1");
      assert.equal(n.projectOrder, 3);
      assert.equal(r.added, 1);
    });
    it("puts a new task into a project without an order number (unordered)", () => {
      const n = mergeTaskChanges(existingTasks(), [{title: "N", projectId: "p1"}], makeIdGenerator(), ids).tasks.find((t) => t.title === "N");
      assert.equal(n.projectId, "p1");
      assert.equal("projectOrder" in n, false);
    });
    it("ignores an unknown project id, and an order number that has no project to belong to", () => {
      const n = mergeTaskChanges(existingTasks(), [{title: "N", projectId: "p9", projectOrder: 1}], makeIdGenerator(), ids).tasks.find((t) => t.title === "N");
      assert.equal("projectId" in n, false);
      assert.equal("projectOrder" in n, false);
    });
    it("ignores every project id when no project ids are given", () => {
      const n = mergeTaskChanges(existingTasks(), [{title: "N", projectId: "p1", projectOrder: 1}], makeIdGenerator()).tasks.find((t) => t.title === "N");
      assert.equal("projectId" in n, false);
    });
    it("still adds the task when its project id is unusable", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "N", projectId: "p9"}], makeIdGenerator(), ids);
      assert.deepEqual([r.added, r.skipped], [1, 0]);
    });
    it("puts an existing task into a project", () => {
      const b = byId(mergeTaskChanges(existingTasks(), [{id: "b", projectId: "p2", projectOrder: 1}], makeIdGenerator(), ids), "b");
      assert.equal(b.projectId, "p2");
      assert.equal(b.projectOrder, 1);
    });
    it("moves a task to another project and drops the old order number unless one is given", () => {
      assert.equal("projectOrder" in byId(mergeTaskChanges(inProject(), [{id: "b", projectId: "p2"}], makeIdGenerator(), ids), "b"), false);
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectId: "p2"}], makeIdGenerator(), ids), "b").projectId, "p2");
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectId: "p2", projectOrder: 5}], makeIdGenerator(), ids), "b").projectOrder, 5);
    });
    it("changes the order number of a task already in a project", () => {
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectOrder: 4}], makeIdGenerator(), ids), "b").projectOrder, 4);
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectId: "p1", projectOrder: 1}], makeIdGenerator(), ids), "b").projectOrder, 1);
    });
    it("rounds and clamps an order number to 1..999", () => {
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectOrder: 2.6}], makeIdGenerator(), ids), "b").projectOrder, 3);
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectOrder: 0}], makeIdGenerator(), ids), "b").projectOrder, 1);
      assert.equal(byId(mergeTaskChanges(inProject(), [{id: "b", projectOrder: 5000}], makeIdGenerator(), ids), "b").projectOrder, 999);
    });
    it("never removes a task from a project or clears its order number", () => {
      for (const change of [{projectId: ""}, {projectId: null}, {projectOrder: null}, {projectId: "", projectOrder: null}, {projectId: "p9"}, {projectOrder: "2"}, {projectOrder: NaN}]) {
        const b = byId(mergeTaskChanges(inProject(), [{id: "b", ...change}], makeIdGenerator(), ids), "b");
        assert.equal(b.projectId, "p1", JSON.stringify(change));
        assert.equal(b.projectOrder, 2, JSON.stringify(change));
      }
    });
    it("gives an order number to a task without a project only when it joins one in the same change", () => {
      assert.equal("projectOrder" in byId(mergeTaskChanges(existingTasks(), [{id: "b", projectOrder: 3}], makeIdGenerator(), ids), "b"), false);
    });
    it("does not let the model touch other server-owned fields along the way", () => {
      const a = byId(mergeTaskChanges(existingTasks(), [{id: "a", projectId: "p1", projectOrder: 1, locked: false, googleCalendarEventId: "x"}], makeIdGenerator(), ids), "a");
      assert.equal(a.locked, true);
      assert.equal(a.googleCalendarEventId, "ev1");
    });
    it("does not modify the stored tasks it is given", () => {
      const tasks = inProject();
      const copy = structuredClone(tasks);
      mergeTaskChanges(tasks, [{id: "b", projectId: "p2", projectOrder: 1}, {title: "N", projectId: "p1"}], makeIdGenerator(), ids);
      assert.deepEqual(tasks, copy);
    });
  });

  describe("mergeTaskChanges: other updates", () => {
    it("updates model-owned fields and preserves server-owned ones", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "a", title: "A2", priority: "MEDIUM", estimatedMinutes: 45, tags: ["x"], dueDate: "2026-11-01"}], makeIdGenerator());
      const a = r.tasks[0];
      assert.equal(a.title, "A2");
      assert.equal(a.priority, "MEDIUM");
      assert.equal(a.estimatedMinutes, 45);
      assert.deepEqual(a.tags, ["x"]);
      assert.equal(a.dueDate, "2026-11-01");
      assert.equal(a.locked, true);
      assert.equal(a.googleCalendarEventId, "ev1");
      assert.equal(a.scheduledStart, "s");
      assert.equal(a.scheduledEnd, "e");
      assert.equal(a.status, "PENDING");
      assert.deepEqual([r.added, r.updated, r.skipped], [0, 1, 0]);
    });
    it("leaves fields the change omits or gives invalid values for", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", title: "", priority: "URGENT", estimatedMinutes: -5, tags: "nope", dueDate: "next week"}], makeIdGenerator());
      assert.deepEqual(r.tasks[1], {...existingTasks()[1], order: 2});
      assert.equal(r.updated, 1);
    });
    it("ignores status, locked, calendar and schedule fields from the model", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", title: "B", status: "COMPLETED", locked: true, googleCalendarEventId: "x", scheduledStart: "y", scheduledEnd: "z", order: undefined}], makeIdGenerator());
      const b = r.tasks[1];
      assert.equal(b.status, "PENDING");
      assert.equal(b.locked, undefined);
      assert.equal(b.googleCalendarEventId, undefined);
      assert.equal(b.scheduledStart, undefined);
    });
    it("keeps the task's place when no rank is given", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", title: "B2"}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => t.id), ["a", "b", "c"]);
    });
    it("moves a task to the requested rank", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "c", title: "C", order: 1}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => `${t.id}${t.order}`), ["c1", "a2", "b3"]);
    });
    it("trims titles and tags and rounds the estimate", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", title: "  New title  ", tags: [" Indoor ", "", 5], estimatedMinutes: 20.6}], makeIdGenerator());
      assert.equal(r.tasks[1].title, "New title");
      assert.deepEqual(r.tasks[1].tags, ["Indoor"]);
      assert.equal(r.tasks[1].estimatedMinutes, 21);
    });
    it("accepts an empty dueDate to clear it", () => {
      const tasks = existingTasks();
      tasks[1].dueDate = "2026-11-01";
      assert.equal(mergeTaskChanges(tasks, [{id: "b", dueDate: ""}], makeIdGenerator()).tasks[1].dueDate, "");
    });
    it("applies several changes to the same task in order", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "b", title: "First"}, {id: "b", priority: "HIGH"}], makeIdGenerator());
      assert.equal(r.tasks[1].title, "First");
      assert.equal(r.tasks[1].priority, "HIGH");
      assert.equal(r.updated, 2);
    });
  });

  describe("mergeTaskChanges: additions", () => {
    it("adds a task with a server id and defaults", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "New"}], makeIdGenerator());
      assert.deepEqual(r.tasks[3], {id: "new1", title: "New", priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 4});
      assert.equal(r.added, 1);
    });
    it("ignores a model-supplied status, calendar and schedule fields on a new task", () => {
      const r = mergeTaskChanges([], [{title: "New", priority: "BAD", status: "COMPLETED", locked: true, scheduledStart: "x", order: 99}], makeIdGenerator());
      assert.equal(r.tasks[0].status, "PENDING");
      assert.equal(r.tasks[0].priority, "MEDIUM");
      assert.equal(r.tasks[0].locked, undefined);
      assert.equal(r.tasks[0].scheduledStart, undefined);
    });
    it("inserts at the requested rank and renumbers the rest", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "N", priority: "HIGH", estimatedMinutes: 20, tags: [], order: 2}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => `${t.id}${t.order}`), ["a1", "new12", "b3", "c4"]);
    });
    it("clamps ranks that are too large or too small", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "Last", order: 99}, {title: "First", order: -3}], makeIdGenerator());
      assert.equal(r.tasks[r.tasks.length - 1].title, "Last");
      assert.equal(r.tasks[0].title, "First");
    });
    it("adds to an empty list", () => {
      const r = mergeTaskChanges([], [{title: "One"}, {title: "Two"}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => [t.id, t.title, t.order]), [["new1", "One", 1], ["new2", "Two", 2]]);
    });
    it("uses a model-supplied id only to find existing tasks, never for a new one", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "", title: "N"}], makeIdGenerator());
      assert.equal(r.tasks[3].id, "new1");
    });
  });

  describe("mergeTaskChanges: skipped changes and purity", () => {
    it("skips a change naming a task that no longer exists", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "gone", title: "Q"}], makeIdGenerator());
      assert.deepEqual([r.added, r.updated, r.skipped], [0, 0, 1]);
      assert.equal(r.tasks.length, 3);
    });
    it("skips untitled new tasks and non-objects", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "  "}, null, "x", {priority: "HIGH"}], makeIdGenerator());
      assert.deepEqual([r.added, r.updated, r.skipped], [0, 0, 4]);
    });
    it("handles no changes", () => {
      const r = mergeTaskChanges(existingTasks(), [], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => t.id), ["a", "b", "c"]);
    });
    it("renumbers ranks 1..n in the stored order, even when the stored ranks have gaps or are out of order", () => {
      const tasks = existingTasks();
      tasks[0].order = 5;
      tasks[1].order = 2;
      tasks[2].order = 9;
      const r = mergeTaskChanges(tasks, [{title: "N", order: 4}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => `${t.id}${t.order}`), ["b1", "a2", "c3", "new14"]);
    });
    it("does not mutate its inputs", () => {
      const tasks = existingTasks();
      const snapshot = JSON.stringify(tasks);
      const changes = [{id: "a", title: "Changed", order: 3}, {title: "New"}];
      const changeSnapshot = JSON.stringify(changes);
      mergeTaskChanges(tasks, changes, makeIdGenerator());
      assert.equal(JSON.stringify(tasks), snapshot);
      assert.equal(JSON.stringify(changes), changeSnapshot);
    });
  });

  describe("applyScheduleResults", () => {
    const none = new Map();

    it("keeps project membership and order on the tasks it rewrites", () => {
      const tasks = [{...existingTasks()[1], projectId: "p1", projectOrder: 3}];
      const scheduled = new Map([["b", {eventId: "eb", start: "1", end: "2"}]]);
      const out = applyScheduleResults({tasks, knownIds: new Set(["b"]), locked: none, scheduled, createdEvents: []});
      assert.equal(out.tasks[0].projectId, "p1");
      assert.equal(out.tasks[0].projectOrder, 3);
    });

    it("records the schedule on known tasks and clears stale fields", () => {
      const tasks = existingTasks();
      const scheduled = new Map([["b", {eventId: "eb", start: "1", end: "2"}]]);
      const out = applyScheduleResults({tasks, knownIds: new Set(["a", "b", "c"]), locked: none, scheduled, createdEvents: [{taskId: "b", eventId: "eb"}]});
      const [a, b, c] = out.tasks;
      assert.equal(a.googleCalendarEventId, undefined);
      assert.equal(a.scheduledStart, undefined);
      assert.equal(a.locked, undefined);
      assert.deepEqual([b.googleCalendarEventId, b.scheduledStart, b.scheduledEnd], ["eb", "1", "2"]);
      assert.equal(c.scheduledStart, undefined);
      assert.deepEqual(out.orphanEventIds, []);
    });
    it("marks locked tasks with the personal event's id and actual times", () => {
      const locked = new Map([["b", {id: "pe", start: {dateTime: "S"}, end: {dateTime: "E"}}]]);
      const out = applyScheduleResults({tasks: [existingTasks()[1]], knownIds: new Set(["b"]), locked, scheduled: none, createdEvents: []});
      assert.deepEqual([out.tasks[0].locked, out.tasks[0].googleCalendarEventId, out.tasks[0].scheduledStart, out.tasks[0].scheduledEnd], [true, "pe", "S", "E"]);
    });
    it("uses an all-day locked event's dates", () => {
      const locked = new Map([["b", {id: "pe", start: {date: "2026-10-22"}, end: {date: "2026-10-23"}}]]);
      const out = applyScheduleResults({tasks: [existingTasks()[1]], knownIds: new Set(["b"]), locked, scheduled: none, createdEvents: []});
      assert.deepEqual([out.tasks[0].scheduledStart, out.tasks[0].scheduledEnd], ["2026-10-22", "2026-10-23"]);
    });
    it("prefers the locked event over a new slot for the same task", () => {
      const locked = new Map([["b", {id: "pe", start: {dateTime: "S"}, end: {dateTime: "E"}}]]);
      const scheduled = new Map([["b", {eventId: "eb", start: "1", end: "2"}]]);
      const out = applyScheduleResults({tasks: [existingTasks()[1]], knownIds: new Set(["b"]), locked, scheduled, createdEvents: []});
      assert.equal(out.tasks[0].googleCalendarEventId, "pe");
    });
    it("leaves tasks added during the run untouched", () => {
      const added = {id: "d", title: "D", order: 4, googleCalendarEventId: "keep"};
      const out = applyScheduleResults({tasks: [...existingTasks(), added], knownIds: new Set(["a", "b", "c"]), locked: none, scheduled: none, createdEvents: []});
      assert.deepEqual(out.tasks[3], added);
    });
    it("keeps edits made to known tasks during the run", () => {
      const tasks = existingTasks();
      tasks[1].title = "Edited while running";
      const out = applyScheduleResults({tasks, knownIds: new Set(["a", "b", "c"]), locked: none, scheduled: none, createdEvents: []});
      assert.equal(out.tasks[1].title, "Edited while running");
    });
    it("reports events created for tasks deleted during the run", () => {
      const tasks = [existingTasks()[0], existingTasks()[2]]; // b is gone
      const scheduled = new Map([["b", {eventId: "eb", start: "1", end: "2"}], ["c", {eventId: "ec", start: "3", end: "4"}]]);
      const out = applyScheduleResults({tasks, knownIds: new Set(["a", "b", "c"]), locked: none, scheduled, createdEvents: [{taskId: "b", eventId: "eb"}, {taskId: "c", eventId: "ec"}]});
      assert.deepEqual(out.orphanEventIds, ["eb"]);
      assert.equal(out.tasks[1].googleCalendarEventId, "ec");
    });
    it("does not mutate its input", () => {
      const tasks = existingTasks();
      const snapshot = JSON.stringify(tasks);
      applyScheduleResults({tasks, knownIds: new Set(["a"]), locked: none, scheduled: none, createdEvents: []});
      assert.equal(JSON.stringify(tasks), snapshot);
    });
  });

  describe("materials", () => {
    const base = () => ({id: "t1", title: "Paint fence", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1});
    const withMaterials = () => ({...base(), materials: [{id: "m1", text: "Paint", checked: true}, {id: "m2", text: "Brush", checked: false}]});
    it("applyDirectUpdate sets a validated list with generated ids for new items", () => {
      const next = applyDirectUpdate(base(), {materials: [{text: " Paint "}, {id: "keep", text: "Brush", checked: true}]}, [], makeIdGenerator());
      assert.deepEqual(next.materials, [{id: "new1", text: "Paint", checked: false}, {id: "keep", text: "Brush", checked: true}]);
    });
    it("applyDirectUpdate removes the list for null or an empty list", () => {
      for (const value of [null, [], [{text: " "}]]) assert.equal("materials" in applyDirectUpdate(withMaterials(), {materials: value}, [], makeIdGenerator()), false);
    });
    it("applyDirectUpdate leaves the list alone for an unusable value or when not sent", () => {
      assert.deepEqual(applyDirectUpdate(withMaterials(), {materials: "paint"}, [], makeIdGenerator()).materials, withMaterials().materials);
      assert.deepEqual(applyDirectUpdate(withMaterials(), {title: "New"}, [], makeIdGenerator()).materials, withMaterials().materials);
    });
    it("applyDirectUpdate does not modify its input", () => {
      const task = withMaterials();
      const snapshot = JSON.stringify(task);
      applyDirectUpdate(task, {materials: null}, [], makeIdGenerator());
      assert.equal(JSON.stringify(task), snapshot);
    });
    it("mergeTaskChanges never lets the model set or change materials", () => {
      const merged = mergeTaskChanges([withMaterials()], [{id: "t1", title: "Paint fence", materials: [{id: "x", text: "Hacked", checked: true}]}, {title: "New task", materials: [{text: "Nope"}]}], makeIdGenerator());
      assert.deepEqual(merged.tasks.find((t) => t.id === "t1").materials, withMaterials().materials);
      assert.equal("materials" in merged.tasks.find((t) => t.title === "New task"), false);
    });
    it("completing a repeating task gives the next occurrence its materials, all unchecked with new ids", () => {
      const task = {...withMaterials(), recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-20"};
      const {spawned} = completeInList([task], "t1", "2026-10-22", makeIdGenerator());
      assert.deepEqual(spawned.materials, [{id: "new2", text: "Paint", checked: false}, {id: "new3", text: "Brush", checked: false}]);
    });
    it("completing a repeating task without materials adds no materials key", () => {
      const task = {...base(), recurrence: {frequency: "WEEKLY", interval: 1}};
      assert.equal("materials" in completeInList([task], "t1", "2026-10-22", makeIdGenerator()).spawned, false);
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {withoutProjectFields, MAX_INTERVAL, normalizeRecurrence, applyDirectUpdate, moveToQueueNumber, completeInList, mergeTaskChanges, applyScheduleResults} = require("../tasks");

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
  describe("job numbers", () => {
    const weekly = {frequency: "WEEKLY", interval: 1};
    it("numbers new tasks one after the other in the order the changes are listed, whatever rank they ask for", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "Late", order: 4}, {title: "Early", order: 1}, {title: "None"}], makeIdGenerator(), [], {jobCounter: 10});
      const byTitle = Object.fromEntries(r.tasks.map((t) => [t.title, t.jobNumber]));
      assert.deepEqual([byTitle.Late, byTitle.Early, byTitle.None], [11, 12, 13]);
      assert.equal(r.jobCounter, 13);
      assert.equal(r.added, 3);
    });
    it("leaves existing tasks, updated ones included, without a number change", () => {
      const list = existingTasks();
      list[1].jobNumber = 5;
      const r = mergeTaskChanges(list, [{id: "b", title: "B2"}, {id: "c", title: "C2"}], makeIdGenerator(), [], {jobCounter: 10});
      assert.equal(r.tasks.find((t) => t.id === "b").jobNumber, 5);
      assert.equal("jobNumber" in r.tasks.find((t) => t.id === "c"), false);
      assert.equal(r.jobCounter, 10);
    });
    it("does not number tasks, or report a counter, without one; a change cannot set its own number", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "N", jobNumber: 99}], makeIdGenerator());
      assert.equal("jobNumber" in r.tasks[3], false);
      assert.equal("jobCounter" in r, false);
      const r2 = mergeTaskChanges(existingTasks(), [{title: "N", jobNumber: 99}], makeIdGenerator(), [], {jobCounter: 0});
      assert.equal(r2.tasks[3].jobNumber, 1);
    });
    it("numbers a manual entry too, and skips an unusable change without using a number", () => {
      const r = mergeTaskChanges(existingTasks(), [null, {title: "  "}, {title: "Real"}], makeIdGenerator(), [], {jobCounter: 7});
      assert.equal(r.tasks.find((t) => t.title === "Real").jobNumber, 8);
      assert.equal(r.jobCounter, 8);
    });
    it("is never changed by an edit", () => {
      const next = applyDirectUpdate({id: "a", title: "A", jobNumber: 3}, {title: "B", jobNumber: 99});
      assert.equal(next.jobNumber, 3);
      assert.equal(next.title, "B");
    });
    it("gives the next occurrence of a repeating task a new number and the completed task keeps its own", () => {
      const list = [{id: "r", title: "Mow", priority: "LOW", dueDate: "2026-10-20", estimatedMinutes: 30, tags: [], status: "PENDING", recurrence: weekly, order: 1, jobNumber: 4}];
      const r = completeInList(list, "r", "2026-10-23", makeIdGenerator(), "2026-10-23T01:00:00.000Z", 20);
      assert.equal(r.completedTask.jobNumber, 4);
      assert.equal(r.spawned.jobNumber, 21);
      assert.equal(r.jobCounter, 21);
    });
    it("uses no number for a task that does not repeat, and reports the counter unchanged", () => {
      const r = completeInList(existingTasks(), "b", "2026-10-23", makeIdGenerator(), "2026-10-23T01:00:00.000Z", 20);
      assert.equal(r.spawned, null);
      assert.equal(r.jobCounter, 20);
    });
    it("numbers nothing and reports no counter when none is given", () => {
      const list = [{id: "r", title: "Mow", priority: "LOW", dueDate: "2026-10-20", estimatedMinutes: 30, tags: [], status: "PENDING", recurrence: weekly, order: 1}];
      const r = completeInList(list, "r", "2026-10-23", makeIdGenerator(), "2026-10-23T01:00:00.000Z");
      assert.equal("jobNumber" in r.spawned, false);
      assert.equal("jobCounter" in r, false);
    });
    it("keeps its number when a completed task is reopened", () => {
      const {reopenTask} = require("../reopen");
      const done = reopenTask([], {id: "x", title: "Fit tap", jobNumber: 12, completedAt: new Date(), completedCount: 1}, {makeId: makeIdGenerator()});
      assert.equal(done.task.jobNumber, 12);
    });
  });

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
    it("stamps the next occurrence with addedAt when given a time, and never copies the old one", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly, addedAt: "2026-01-01T00:00:00.000Z"} : t));
      const stamped = completeInList(tasks, "b", today, makeIdGenerator(), "2026-10-23T08:00:00.000Z");
      assert.equal(stamped.spawned.addedAt, "2026-10-23T08:00:00.000Z");
      assert.equal("addedAt" in completeInList(tasks, "b", today, makeIdGenerator()).spawned, false);
    });
    it("archives the task with its tracked time, stopping a running timer at the given time", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, trackedSeconds: 60, timerStartedAt: "2026-10-23T08:00:00.000Z"} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator(), "2026-10-23T08:02:00.000Z");
      assert.equal(r.completedTask.trackedSeconds, 180);
      assert.equal("timerStartedAt" in r.completedTask, false);
      assert.equal(completeInList(existingTasks(), "c", today, makeIdGenerator(), "2026-10-23T08:02:00.000Z").completedTask.trackedSeconds, 0);
    });
    it("archives the first start time with the task, and leaves it off the next occurrence", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly, trackedSeconds: 60, firstStartedAt: "2026-10-22T20:00:00.000Z", timerStartedAt: "2026-10-23T08:00:00.000Z"} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator(), "2026-10-23T08:02:00.000Z");
      assert.equal(r.completedTask.firstStartedAt, "2026-10-22T20:00:00.000Z");
      assert.equal("firstStartedAt" in r.spawned, false);
      assert.equal("firstStartedAt" in completeInList(existingTasks(), "c", today, makeIdGenerator(), "2026-10-23T08:02:00.000Z").completedTask, false);
    });
    it("gives the next occurrence no tracked time and no running timer", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, recurrence: weekly, trackedSeconds: 600, timerStartedAt: "2026-10-23T08:00:00.000Z"} : t));
      const spawned = completeInList(tasks, "b", today, makeIdGenerator(), "2026-10-23T08:02:00.000Z").spawned;
      assert.equal("trackedSeconds" in spawned, false);
      assert.equal("timerStartedAt" in spawned, false);
    });
    it("leaves the other tasks exactly as they were", () => {
      const tasks = existingTasks();
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.deepEqual(r.tasks, [tasks[0], tasks[2]]);
    });
    it("creates the next occurrence of a repeating task at the same rank", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, dueDate: "2026-10-26", tags: ["home"], recurrence: weekly} : t));
      const r = completeInList(tasks, "b", today, makeIdGenerator());
      assert.deepEqual(r.spawned, {id: "new1", title: "B", priority: "LOW", dueDate: "2026-11-02", estimatedMinutes: 10, tags: ["home"], status: "PENDING", recurrence: weekly, completedCount: 1, order: 2, snoozedUntil: "2026-11-02"});
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
    it("snoozes the next occurrence until its due date, early or late, so it is not scheduled before it is due", () => {
      const early = existingTasks().map((t) => (t.id === "b" ? {...t, dueDate: "2026-10-26", recurrence: weekly} : t));
      const late = existingTasks().map((t) => (t.id === "b" ? {...t, dueDate: "2026-10-02", recurrence: weekly} : t));
      for (const tasks of [early, late]) {
        const {spawned} = completeInList(tasks, "b", today, makeIdGenerator());
        assert.ok(spawned.snoozedUntil > today);
        assert.equal(spawned.snoozedUntil, spawned.dueDate);
      }
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
    it("never stores a newProject name on the task (the endpoint turns it into a projectId)", () => {
      const out = applyDirectUpdate(base, {title: "A2", newProject: "Kitchen reno", projectId: "p9", projectOrder: 2}, ["p9"]);
      assert.equal("newProject" in out, false);
      assert.equal(out.projectId, "p9");
      assert.equal(out.projectOrder, 2);
    });
    it("never changes addedAt through an edit", () => {
      const task = {...base, addedAt: "2026-01-01T00:00:00.000Z"};
      assert.equal(applyDirectUpdate(task, {addedAt: "2030-01-01T00:00:00.000Z", title: "A2"}).addedAt, "2026-01-01T00:00:00.000Z");
      assert.equal("addedAt" in applyDirectUpdate(base, {addedAt: "2030-01-01T00:00:00.000Z"}), false);
    });
    it("never changes the time tracking fields through an edit", () => {
      const task = {...base, trackedSeconds: 50, timerStartedAt: "2026-10-23T08:00:00.000Z"};
      const out = applyDirectUpdate(task, {trackedSeconds: 9999, timerStartedAt: "", title: "A2"});
      assert.equal(out.trackedSeconds, 50);
      assert.equal(out.timerStartedAt, "2026-10-23T08:00:00.000Z");
      assert.equal("trackedSeconds" in applyDirectUpdate(base, {trackedSeconds: 5}), false);
      assert.equal("active" in applyDirectUpdate(base, {active: true}), false);
      assert.equal(applyDirectUpdate({...base, firstStartedAt: "2026-10-23T08:00:00.000Z"}, {firstStartedAt: "2030-01-01T00:00:00.000Z"}).firstStartedAt, "2026-10-23T08:00:00.000Z");
      assert.equal("firstStartedAt" in applyDirectUpdate(base, {firstStartedAt: "2030-01-01T00:00:00.000Z"}), false);
      assert.equal(applyDirectUpdate({...base, active: true}, {active: false}).active, true);
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
    it("never moves an existing task, whatever rank the change gives", () => {
      const r = mergeTaskChanges(existingTasks(), [{id: "c", title: "C2", order: 1}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => `${t.id}${t.order}`), ["a1", "b2", "c3"]);
      assert.equal(r.tasks[2].title, "C2");
    });
    it("inserts several new tasks at their final ranks whatever order the model lists them in", () => {
      const changes = [{title: "Late", order: 4}, {title: "Early", order: 2}];
      const r = mergeTaskChanges(existingTasks(), changes, makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => t.id).filter((id) => ["a", "b", "c"].includes(id)), ["a", "b", "c"]);
      assert.deepEqual(r.tasks.map((t) => t.order), [1, 2, 3, 4, 5]);
      assert.equal(r.tasks[1].title, "Early");
      assert.equal(r.tasks[3].title, "Late");
    });
    it("puts a new task with no usable rank at the end, after the ranked ones", () => {
      const r = mergeTaskChanges(existingTasks(), [{title: "NoRank"}, {title: "First", order: 1}], makeIdGenerator());
      assert.deepEqual(r.tasks.map((t) => t.title).slice(0, 1), ["First"]);
      assert.equal(r.tasks[r.tasks.length - 1].title, "NoRank");
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
    it("stamps a new task with addedAt when given a time, and leaves it off otherwise", () => {
      const now = "2026-10-23T08:00:00.000Z";
      const r = mergeTaskChanges(existingTasks(), [{title: "New", addedAt: "1999-01-01T00:00:00.000Z"}], makeIdGenerator(), [], {now});
      assert.equal(r.tasks[3].addedAt, now);
      assert.equal("addedAt" in mergeTaskChanges([], [{title: "New"}], makeIdGenerator()).tasks[0], false);
    });
    it("never changes the addedAt of an updated task", () => {
      const tasks = existingTasks().map((t) => (t.id === "b" ? {...t, addedAt: "2026-01-01T00:00:00.000Z"} : t));
      const r = mergeTaskChanges(tasks, [{id: "b", title: "B2", addedAt: "2030-01-01T00:00:00.000Z"}], makeIdGenerator(), [], {now: "2026-10-23T08:00:00.000Z"});
      assert.equal(r.tasks.find((t) => t.id === "b").addedAt, "2026-01-01T00:00:00.000Z");
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
      const changes = [{id: "a", title: "Changed", order: 3}, {title: "New", order: 2}];
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
    it("carries a material's cost to the next occurrence of a repeating task", () => {
      const task = {...withMaterials(), recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-20", materials: [{id: "m1", text: "Paint", checked: true, cost: 45.5}, {id: "m2", text: "Brush", checked: true}]};
      const {spawned} = completeInList([task], "t1", "2026-10-22", makeIdGenerator());
      assert.deepEqual(spawned.materials.map((m) => [m.text, m.checked, m.cost]), [["Paint", false, 45.5], ["Brush", false, undefined]]);
      assert.equal("cost" in spawned.materials[1], false);
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

describe("manualTaskChange with every field", () => {
  const {manualTaskChange} = require("../tasks");
  const full = {title: "Paint the fence", priority: "HIGH", dueDate: "2026-11-01", estimatedMinutes: 90, tags: ["Outdoor"], recurrence: {frequency: "MONTHLY", interval: 3}, projectId: "p1", projectOrder: 2, materials: [{id: "", text: " Paint ", checked: false}, {id: "", text: "Brushes", checked: true}, {id: "", text: "  ", checked: false}]};
  it("makes a new task with its recurrence, project, order number and materials", () => {
    const merged = mergeTaskChanges([], [manualTaskChange(full)], makeIdGenerator(), ["p1"], {materials: true});
    assert.equal(merged.added, 1);
    const task = merged.tasks[0];
    assert.deepEqual(task.recurrence, {frequency: "MONTHLY", interval: 3});
    assert.equal(task.projectId, "p1");
    assert.equal(task.projectOrder, 2);
    assert.deepEqual(task.materials.map((m) => [m.text, m.checked]), [["Paint", false], ["Brushes", true]]);
    assert.equal(new Set(task.materials.map((m) => m.id)).size, 2);
  });
  it("ignores an unknown project and its order number, and an unusable recurrence or materials value", () => {
    const merged = mergeTaskChanges([], [manualTaskChange({...full, projectId: "gone", recurrence: {frequency: "HOURLY"}, materials: "paint"})], makeIdGenerator(), ["p1"], {materials: true});
    const task = merged.tasks[0];
    for (const key of ["projectId", "projectOrder", "recurrence", "materials"]) assert.equal(key in task, false, key);
  });
  it("leaves out materials that are all blank", () => {
    const merged = mergeTaskChanges([], [manualTaskChange({...full, materials: [{text: " "}], projectId: undefined, projectOrder: undefined})], makeIdGenerator(), ["p1"], {materials: true});
    assert.equal("materials" in merged.tasks[0], false);
    assert.equal("projectOrder" in merged.tasks[0], false);
  });
  it("takes materials only when told to: the model's changes and updates never set them", () => {
    const change = {title: "New", materials: [{id: "m", text: "Sneaky", checked: false}]};
    assert.equal("materials" in mergeTaskChanges([], [change], makeIdGenerator()).tasks[0], false);
    assert.equal("materials" in mergeTaskChanges([], [change], makeIdGenerator(), [], {materials: false}).tasks[0], false);
    const existing = [{id: "t1", title: "Old", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 1}];
    const updated = mergeTaskChanges(existing, [{id: "t1", title: "Old", materials: change.materials}], makeIdGenerator(), [], {materials: true});
    assert.equal(updated.updated, 1);
    assert.equal("materials" in updated.tasks[0], false);
  });
});

describe("manualTaskChange", () => {
  const {manualTaskChange} = require("../tasks");
  it("passes the entered fields through for a new task", () => {
    const change = manualTaskChange({title: "Mow lawn", priority: "LOW", dueDate: "2026-10-30", estimatedMinutes: 45, tags: ["Outdoor"]});
    assert.deepEqual(change, {title: "Mow lawn", priority: "LOW", dueDate: "2026-10-30", estimatedMinutes: 45, tags: ["Outdoor"]});
    assert.equal("id" in change, false);
  });
  it("needs a title", () => {
    for (const bad of [null, undefined, "x", [], {}, {title: "   "}, {title: 5}]) assert.equal(manualTaskChange(bad), null);
  });
  it("ignores everything else the client sends (id, status, schedule, rank)", () => {
    const change = manualTaskChange({title: "T", id: "existing", status: "COMPLETED", scheduledStart: "x", googleCalendarEventId: "e", locked: true, order: 1});
    assert.deepEqual(Object.keys(change).sort(), ["dueDate", "estimatedMinutes", "priority", "tags", "title"]);
  });
  it("passes on a recurrence, project, order number and materials when the form sends them", () => {
    const sent = {recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 3, materials: [{id: "", text: "Paint", checked: false}]};
    const change = manualTaskChange({title: "T", ...sent});
    for (const key of Object.keys(sent)) assert.deepEqual(change[key], sent[key]);
  });
  it("makes a new task at the end of the list through mergeTaskChanges, with defaults for unusable fields", () => {
    const existing = [{id: "t1", title: "Old", priority: "HIGH", dueDate: "", estimatedMinutes: 20, tags: [], status: "PENDING", order: 1}];
    const merged = mergeTaskChanges(existing, [manualTaskChange({title: "  Mow lawn ", priority: "URGENT", dueDate: "tomorrow", estimatedMinutes: -3, tags: ["Outdoor", "", 7]})], makeIdGenerator());
    assert.equal(merged.added, 1);
    assert.deepEqual(merged.tasks[1], {id: "new1", title: "Mow lawn", priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: ["Outdoor"], status: "PENDING", order: 2});
    assert.equal(merged.tasks[0].id, "t1");
  });
  describe("queueNumber", () => {
    const three = () => existingTasks();
    const place = (queueNumber) => mergeTaskChanges(three(), [manualTaskChange({title: "N", queueNumber})], makeIdGenerator());
    const titles = (merged) => merged.tasks.map((t) => t.title).join("");
    it("becomes the change's rank, and nothing else of the client's rank counts", () => {
      assert.equal(manualTaskChange({title: "T", queueNumber: 2}).order, 2);
      assert.equal(manualTaskChange({title: "T", queueNumber: 2, order: 9}).order, 2);
      assert.equal("order" in manualTaskChange({title: "T", order: 9}), false);
    });
    it("is ignored when it is not a whole number from 1", () => {
      for (const bad of [0, -1, 1.5, "2", null, NaN, Infinity, {}, []]) assert.equal("order" in manualTaskChange({title: "T", queueNumber: bad}), false, String(bad));
    });
    it("places the new task at the top, in the middle, at the end and past the end, renumbering the rest", () => {
      assert.equal(titles(place(1)), "NABC");
      assert.equal(titles(place(2)), "ANBC");
      assert.equal(titles(place(4)), "ABCN");
      assert.equal(titles(place(99)), "ABCN");
      assert.deepEqual(place(1).tasks.map((t) => t.order), [1, 2, 3, 4]);
    });
    it("leaves an entry with no number at the end, as before", () => {
      assert.equal(titles(place(undefined)), "ABCN");
    });
    it("works on an empty list", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "N", queueNumber: 5})], makeIdGenerator());
      assert.deepEqual(merged.tasks.map((t) => [t.title, t.order]), [["N", 1]]);
    });
  });
  it("keeps the entered priority, due date and estimate", () => {
    const merged = mergeTaskChanges([], [manualTaskChange({title: "Pay rates", priority: "HIGH", dueDate: "2026-11-01", estimatedMinutes: 10, tags: []})], makeIdGenerator());
    assert.deepEqual(merged.tasks, [{id: "new1", title: "Pay rates", priority: "HIGH", dueDate: "2026-11-01", estimatedMinutes: 10, tags: [], status: "PENDING", order: 1}]);
  });
});

describe("undoing a delete or completion", () => {
  const {removalRecord, isUndoable, undoInList, completeInList, UNDO_WINDOW_MS} = require("../tasks");
  const task = {id: "t1", title: "Mow lawn", priority: "LOW", dueDate: "", estimatedMinutes: 30, tags: ["Outdoor"], status: "PENDING", order: 2, googleCalendarEventId: "ev1", scheduledStart: "2026-11-02T09:00:00+13:00", scheduledEnd: "2026-11-02T09:30:00+13:00"};
  const other = {id: "t2", title: "Other", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 1};

  describe("removalRecord", () => {
    it("keeps the kind, task, archive id, next occurrence's id and time", () => {
      assert.deepEqual(removalRecord("COMPLETE", task, "a1", {id: "n1"}, 1000), {kind: "COMPLETE", task, archiveId: "a1", spawnedId: "n1", at: 1000});
    });
    it("uses null for a missing archive id or next occurrence", () => {
      const r = removalRecord("DELETE", task, undefined, undefined, 5);
      assert.equal(r.archiveId, null);
      assert.equal(r.spawnedId, null);
    });
  });

  describe("isUndoable", () => {
    const rec = removalRecord("DELETE", task, null, null, 1000000);
    it("is true within the window, including its end", () => {
      assert.equal(isUndoable(rec, 1000000), true);
      assert.equal(isUndoable(rec, 1000000 + UNDO_WINDOW_MS), true);
    });
    it("is false after the window, for a time before the record, or without a usable record", () => {
      assert.equal(isUndoable(rec, 1000000 + UNDO_WINDOW_MS + 1), false);
      assert.equal(isUndoable(rec, 999999), false);
      for (const bad of [null, undefined, {}, {at: 1}, {at: 1, task: {}}, {at: "1", task: {id: "x"}}]) assert.equal(isUndoable(bad, 2), false);
    });
    it("allows ten minutes", () => assert.equal(UNDO_WINDOW_MS, 600000));
  });

  describe("undoInList", () => {
    it("puts a deleted task back with its own id and rank, without its schedule fields", () => {
      const r = undoInList([other], removalRecord("DELETE", task, null, null, 1));
      assert.deepEqual(r.tasks.map((t) => t.id), ["t2", "t1"]);
      assert.equal(r.restored.order, 2);
      for (const key of ["googleCalendarEventId", "scheduledStart", "scheduledEnd"]) assert.equal(key in r.restored, false, key);
      assert.equal(r.restored.title, "Mow lawn");
    });
    it("keeps the schedule fields of a task pinned to a personal-calendar event", () => {
      const locked = {...task, locked: true};
      const r = undoInList([], removalRecord("DELETE", locked, null, null, 1));
      assert.deepEqual(r.restored, locked);
    });
    it("takes off the next occurrence a completion created", () => {
      const recurring = {...task, recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-11-01"};
      const done = completeInList([recurring, other], "t1", "2026-10-24", () => "next1");
      assert.equal(done.spawned.id, "next1");
      const r = undoInList(done.tasks, removalRecord("COMPLETE", done.completedTask, "a1", done.spawned, 1));
      assert.deepEqual(r.tasks.map((t) => t.id).sort(), ["t1", "t2"]);
    });
    it("round-trips a plain completion back to the original list (apart from the dropped schedule)", () => {
      const done = completeInList([task, other], "t1", "2026-10-24", () => "x");
      const r = undoInList(done.tasks, removalRecord("COMPLETE", done.completedTask, "a1", null, 1));
      assert.equal(r.tasks.length, 2);
      assert.equal(r.restored.id, "t1");
    });
    describe("materials", () => {
      const materials = [{id: "m1", text: "Paint", checked: false}, {id: "m2", text: "Brush", checked: true}, {id: "m3", text: "Tape", checked: false}];
      // The record is stored in Firestore and read back, so it goes through a JSON round trip here
      const stored = (record) => JSON.parse(JSON.stringify(record));

      it("brings back the whole materials list, unchecked items included, after completing and undoing", () => {
        const withMaterials = {...task, materials};
        const done = completeInList([withMaterials, other], "t1", "2026-10-24", () => "x");
        assert.equal(done.tasks.some((t) => t.id === "t1"), false);
        const r = undoInList(done.tasks, stored(removalRecord("COMPLETE", done.completedTask, "a1", null, 1)));
        assert.deepEqual(r.restored.materials, materials);
        assert.deepEqual(r.tasks.find((t) => t.id === "t1").materials, materials);
      });
      it("brings back the original materials of a repeating task and drops the next occurrence's fresh ones", () => {
        const recurring = {...task, recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-11-01", materials};
        let n = 0;
        const done = completeInList([recurring, other], "t1", "2026-10-24", () => `new${++n}`);
        assert.equal(done.spawned.materials.length, 3);
        assert.ok(done.spawned.materials.every((m) => m.checked === false));
        const r = undoInList(done.tasks, stored(removalRecord("COMPLETE", done.completedTask, "a1", done.spawned, 1)));
        assert.deepEqual(r.tasks.map((t) => t.id).sort(), ["t1", "t2"]);
        assert.deepEqual(r.restored.materials, materials);
      });
      it("brings back the materials of a deleted task", () => {
        const withMaterials = {...task, materials};
        const r = undoInList([other], stored(removalRecord("DELETE", withMaterials, null, null, 1)));
        assert.deepEqual(r.restored.materials, materials);
      });
    });
    it("does nothing when the task is already on the list, or the record is unusable", () => {
      assert.equal(undoInList([task], removalRecord("DELETE", task, null, null, 1)), null);
      assert.equal(undoInList([other], null), null);
      assert.equal(undoInList([other], {kind: "DELETE"}), null);
      assert.equal(undoInList([other], {task: {title: "no id"}}), null);
    });
    it("does not change the list it was given, or the record's task", () => {
      const list = [other];
      const rec = removalRecord("DELETE", task, null, null, 1);
      undoInList(list, rec);
      assert.deepEqual(list, [other]);
      assert.equal(rec.task.googleCalendarEventId, "ev1");
    });
  });

  describe("undoInList: timers", () => {
    const {undoInList} = require("../tasks");
    it("never restores a task with its timer running", () => {
      const record = {task: {id: "x", title: "X", trackedSeconds: 40, timerStartedAt: "2026-10-23T08:00:00.000Z"}, spawnedId: null};
      const out = undoInList([], record);
      assert.equal(out.restored.trackedSeconds, 40);
      assert.equal("timerStartedAt" in out.restored, false);
    });
    it("never restores a task as the active one", () => {
      const out = undoInList([], {task: {id: "x", title: "X", active: true}, spawnedId: null});
      assert.equal("active" in out.restored, false);
    });
  });
});

describe("tag fill and new ids", () => {
  const {needsTagFill, cleanTags, newTaskIds} = require("../tasks");
  it("asks for tags when a manual entry has none", () => {
    assert.equal(needsTagFill({title: "x"}), true);
    assert.equal(needsTagFill({title: "x", tags: []}), true);
    assert.equal(needsTagFill({title: "x", tags: ["", "  ", 4]}), true);
    assert.equal(needsTagFill({title: "x", tags: ["Outdoor"]}), false);
    assert.equal(needsTagFill(null), true);
  });
  it("cleans the model's tags: strings only, trimmed, no repeats, at most five, none too long", () => {
    assert.deepEqual(cleanTags([" Outdoor ", "outdoor", "Garden", 3, "", "a", "b", "c", "d"]), ["Outdoor", "Garden", "a", "b", "c"]);
    assert.deepEqual(cleanTags(["x".repeat(41), "ok"]), ["ok"]);
    assert.deepEqual(cleanTags("Outdoor"), []);
    assert.deepEqual(cleanTags(undefined), []);
  });
  it("lists the ids that are new, in list order", () => {
    assert.deepEqual(newTaskIds([{id: "a"}, {id: "b"}], [{id: "a"}, {id: "n1"}, {id: "b"}, {id: "n2"}]), ["n1", "n2"]);
    assert.deepEqual(newTaskIds([{id: "a"}], [{id: "a"}]), []);
  });
});

describe("job history", () => {
  const {completeInList, mergeTaskChanges, applyDirectUpdate, manualTaskChange, removalRecord, undoInList} = require("../tasks");
  const weekly = {frequency: "WEEKLY", interval: 1};
  const makeId = () => "new1";
  const job = (extra = {}) => ({id: "t1", title: "Mow lawn", priority: "LOW", dueDate: "2026-10-26", estimatedMinutes: 30, tags: [], status: "PENDING", recurrence: weekly, order: 1, ...extra});

  it("counts a completion and carries the history to the next occurrence", () => {
    const r = completeInList([job({completedCount: 2, recentSeconds: [1200], trackedSeconds: 1800})], "t1", "2026-10-24", makeId, "2026-10-24T08:00:00.000Z");
    assert.deepEqual(r.history, {completedCount: 3, recentSeconds: [1200, 1800]});
    assert.equal(r.spawned.completedCount, 3);
    assert.deepEqual(r.spawned.recentSeconds, [1200, 1800]);
  });
  it("sets the next occurrence's estimate to the rolling average rounded to 5 minutes", () => {
    const r = completeInList([job({completedCount: 1, recentSeconds: [1200], trackedSeconds: 1500})], "t1", "2026-10-24", makeId);
    assert.equal(r.spawned.estimatedMinutes, 25); // (20 + 25) / 2 = 22.5, a half rounds up
    const r2 = completeInList([job({recentSeconds: [], trackedSeconds: 421})], "t1", "2026-10-24", makeId);
    assert.equal(r2.spawned.estimatedMinutes, 5); // 7.0 min
    const r3 = completeInList([job({trackedSeconds: 600})], "t1", "2026-10-24", makeId);
    assert.equal(r3.spawned.estimatedMinutes, 10);
  });
  it("keeps the estimate while no instance has tracked time, but still counts", () => {
    const r = completeInList([job()], "t1", "2026-10-24", makeId);
    assert.equal(r.spawned.estimatedMinutes, 30);
    assert.equal(r.history.completedCount, 1);
    assert.equal("recentSeconds" in r.spawned, false);
  });
  it("returns the history for a task that does not repeat, and leaves the archived task's own fields alone", () => {
    const plain = job({recurrence: undefined, completedCount: 4, trackedSeconds: 300});
    delete plain.recurrence;
    const r = completeInList([plain], "t1", "2026-10-24", makeId);
    assert.equal(r.spawned, null);
    assert.equal(r.history.completedCount, 5);
    assert.equal(r.completedTask.completedCount, 4);
  });
  it("restores the earlier history when a completion is undone", () => {
    const tasks = [job({completedCount: 2, recentSeconds: [600], trackedSeconds: 900})];
    const done = completeInList(tasks, "t1", "2026-10-24", makeId);
    const back = undoInList(done.tasks, removalRecord("COMPLETE", done.completedTask, "arch1", done.spawned, Date.now()));
    assert.equal(back.restored.completedCount, 2);
    assert.deepEqual(back.restored.recentSeconds, [600]);
  });
  it("lets a manual new task take a validated history, and nothing else does", () => {
    const history = {completedCount: 7, recentSeconds: [600, 0, 900]};
    const change = manualTaskChange({title: "Mow lawn", history});
    assert.deepEqual(change.history, history);
    const withIt = mergeTaskChanges([], [change], makeId, [], {history: true});
    assert.equal(withIt.tasks[0].completedCount, 7);
    assert.deepEqual(withIt.tasks[0].recentSeconds, [600, 900]);
    const without = mergeTaskChanges([], [change], makeId, [], {});
    assert.equal("completedCount" in without.tasks[0], false);
    const fromModel = mergeTaskChanges([], [{title: "x", completedCount: 9, recentSeconds: [60]}], makeId, [], {});
    assert.equal("completedCount" in fromModel.tasks[0], false);
    assert.equal("recentSeconds" in fromModel.tasks[0], false);
  });
  it("ignores an unusable history on a manual task", () => {
    const r = mergeTaskChanges([], [manualTaskChange({title: "x", history: {completedCount: -2, recentSeconds: "abc"}})], makeId, [], {history: true});
    assert.equal("completedCount" in r.tasks[0], false);
    assert.equal("recentSeconds" in r.tasks[0], false);
  });
  it("never lets an edit change the history", () => {
    const next = applyDirectUpdate(job({completedCount: 3, recentSeconds: [600]}), {completedCount: 99, recentSeconds: [1], title: "Renamed"});
    assert.equal(next.title, "Renamed");
    assert.equal(next.completedCount, 3);
    assert.deepEqual(next.recentSeconds, [600]);
  });
});

describe("withoutProjectFields", () => {
  it("removes projectId and projectOrder from every change and keeps the other fields", () => {
    const changes = [
      {title: "N", priority: "HIGH", projectId: "p1", projectOrder: 2},
      {id: "b", title: "B2", estimatedMinutes: 30, projectId: "p2", order: 1},
      {title: "M", projectOrder: 3},
    ];
    assert.deepEqual(withoutProjectFields(changes), [
      {title: "N", priority: "HIGH"},
      {id: "b", title: "B2", estimatedMinutes: 30, order: 1},
      {title: "M"},
    ]);
  });
  it("does not modify the changes passed in", () => {
    const changes = [{title: "N", projectId: "p1", projectOrder: 1}];
    withoutProjectFields(changes);
    assert.deepEqual(changes, [{title: "N", projectId: "p1", projectOrder: 1}]);
  });
  it("passes non-objects through for the merge to skip, and gives an empty list for a non-list", () => {
    assert.deepEqual(withoutProjectFields([null, "x", [1]]), [null, "x", [1]]);
    for (const bad of [undefined, null, "x", {title: "N"}]) assert.deepEqual(withoutProjectFields(bad), []);
  });
  it("leaves a new task outside any project and an existing task's project and order unchanged when merged", () => {
    const ids = ["p1", "p2"];
    const list = [{id: "b", title: "B", priority: "LOW", dueDate: "", estimatedMinutes: 10, tags: [], status: "PENDING", order: 1, projectId: "p1", projectOrder: 2}];
    const changes = withoutProjectFields([{title: "N", projectId: "p1", projectOrder: 1}, {id: "b", title: "B", projectId: "p2", projectOrder: 5}]);
    const r = mergeTaskChanges(list, changes, makeIdGenerator(), ids);
    const n = r.tasks.find((t) => t.title === "N");
    assert.equal("projectId" in n, false);
    assert.equal("projectOrder" in n, false);
    const b = r.tasks.find((t) => t.id === "b");
    assert.equal(b.projectId, "p1");
    assert.equal(b.projectOrder, 2);
  });
});

describe("moveToQueueNumber", () => {
  const list = () => [
    {id: "a", order: 1}, {id: "b", order: 2}, {id: "c", order: 4}, {id: "d", order: 7}, // gaps from removed tasks
  ];
  const ids = (tasks) => tasks.map((t) => t.id);

  it("moves a task to the top and renumbers every rank 1..n", () => {
    const out = moveToQueueNumber(list(), "d", 1);
    assert.deepEqual(ids(out), ["d", "a", "b", "c"]);
    assert.deepEqual(out.map((t) => t.order), [1, 2, 3, 4]);
  });

  it("moves a task down, the others closing up", () => {
    assert.deepEqual(ids(moveToQueueNumber(list(), "a", 3)), ["b", "c", "a", "d"]);
  });

  it("clamps the number to 1..n", () => {
    assert.deepEqual(ids(moveToQueueNumber(list(), "b", 99)), ["a", "c", "d", "b"]);
    assert.deepEqual(ids(moveToQueueNumber(list(), "c", 0)), ["c", "a", "b", "d"]);
  });

  it("reads the queue in rank order whatever the list order, and does not modify the input", () => {
    const input = [{id: "x", order: 3}, {id: "y", order: 1}, {id: "z", order: 2}];
    const copy = JSON.parse(JSON.stringify(input));
    assert.deepEqual(ids(moveToQueueNumber(input, "x", 1)), ["x", "y", "z"]);
    assert.deepEqual(input, copy);
  });

  it("returns null for an unknown task or a number that is not whole", () => {
    assert.equal(moveToQueueNumber(list(), "nope", 1), null);
    assert.equal(moveToQueueNumber(list(), "a", 1.5), null);
    assert.equal(moveToQueueNumber(list(), "a", "2"), null);
  });

  it("is never set through an ordinary edit", () => {
    const next = applyDirectUpdate({id: "a", order: 2, title: "A"}, {title: "B", order: 1, queueNumber: 1});
    assert.equal(next.order, 2);
    assert.equal(next.title, "B");
    assert.equal("queueNumber" in next, false);
  });
});

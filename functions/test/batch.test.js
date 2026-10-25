/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_BATCH, moveToTop, needsReschedule, applyBatch} = require("../batch");

function list() {
  return ["a", "b", "c", "d", "e"].map((id, i) => ({id, title: id.toUpperCase(), priority: "LOW", dueDate: "", estimatedMinutes: 10, tags: [], status: "PENDING", order: i + 1}));
}
const orderOf = (tasks) => [...tasks].sort((x, y) => x.order - y.order).map((t) => t.id).join("");

describe("batch.js", () => {
  describe("moveToTop", () => {
    it("puts the selected tasks first, keeping their relative queue order, whatever order the ids come in", () => {
      const r = moveToTop(list(), ["d", "b"]);
      assert.equal(orderOf(r), "bdace");
      assert.deepEqual(r.map((t) => t.order), [1, 2, 3, 4, 5]);
    });
    it("uses queue order, not list order, and renumbers gaps away", () => {
      const tasks = list().reverse().map((t) => ({...t, order: t.order * 3}));
      assert.equal(orderOf(moveToTop(tasks, ["e", "c"])), "ceabd");
      assert.deepEqual(moveToTop(tasks, ["e", "c"]).map((t) => t.order).sort((x, y) => x - y), [1, 2, 3, 4, 5]);
    });
    it("ignores unknown ids, returns null when nothing matches and does not change the input", () => {
      const tasks = list();
      assert.equal(orderOf(moveToTop(tasks, ["zzz", "c"])), "cabde");
      assert.equal(moveToTop(tasks, ["zzz"]), null);
      assert.deepEqual(tasks, list());
    });
    it("is a no-op in effect when the selection is already on top", () => {
      assert.equal(orderOf(moveToTop(list(), ["b", "a"])), "abcde");
    });
  });

  describe("needsReschedule", () => {
    it("is true only for a booked, unpinned task with no open materials", () => {
      assert.equal(needsReschedule({googleCalendarEventId: "ev"}), true);
      assert.equal(needsReschedule({scheduledStart: "2026-10-27"}), true);
      assert.equal(needsReschedule({}), false);
      assert.equal(needsReschedule({googleCalendarEventId: "ev", locked: true}), false);
      assert.equal(needsReschedule({googleCalendarEventId: "ev", materials: [{id: "m", text: "x", checked: false}]}), false);
      assert.equal(needsReschedule({googleCalendarEventId: "ev", materials: [{id: "m", text: "x", checked: true}]}), true);
    });
  });

  describe("applyBatch", () => {
    it("rejects an unknown action, a bad id list and an oversized batch", () => {
      assert.match(applyBatch(list(), {action: "NOPE", taskIds: ["a"]}).error, /action/);
      assert.match(applyBatch(list(), {action: "MOVE_TO_TOP", taskIds: []}).error, /taskIds/);
      assert.match(applyBatch(list(), {action: "MOVE_TO_TOP", taskIds: [1]}).error, /taskIds/);
      assert.match(applyBatch(list(), {action: "MOVE_TO_TOP"}).error, /taskIds/);
      assert.match(applyBatch(list(), {action: "MOVE_TO_TOP", taskIds: Array(MAX_BATCH + 1).fill("a")}).error, /At most/);
    });
    it("reports notFound when no id matches and counts only the ones that do", () => {
      const none = applyBatch(list(), {action: "SET_DUE", taskIds: ["x"], dueDate: "2026-11-01"});
      assert.equal(none.notFound, true);
      const some = applyBatch(list(), {action: "SET_DUE", taskIds: ["x", "d", "b"], dueDate: "2026-11-01"});
      assert.equal(some.count, 2);
      assert.deepEqual(some.ids, ["b", "d"]);
    });
    it("MOVE_TO_TOP moves them and reports the count", () => {
      const r = applyBatch(list(), {action: "MOVE_TO_TOP", taskIds: ["e", "c"]});
      assert.equal(orderOf(r.tasks), "ceabd");
      assert.equal(r.count, 2);
    });
    it("SET_DUE sets the date on the selected tasks only, and clears it with null or empty text", () => {
      const set = applyBatch(list(), {action: "SET_DUE", taskIds: ["a", "c"], dueDate: "2026-11-01"});
      assert.deepEqual(set.tasks.map((t) => t.dueDate), ["2026-11-01", "", "2026-11-01", "", ""]);
      const cleared = applyBatch(set.tasks, {action: "SET_DUE", taskIds: ["a"], dueDate: null});
      assert.equal(cleared.tasks[0].dueDate, "");
      assert.equal(applyBatch(set.tasks, {action: "SET_DUE", taskIds: ["a"], dueDate: ""}).tasks[0].dueDate, "");
      assert.equal(cleared.tasks[2].dueDate, "2026-11-01");
    });
    it("SET_DUE and SNOOZE refuse a value that is not a real date, and one that is missing", () => {
      for (const bad of ["tomorrow", "2026-02-30", 20261101, undefined]) {
        assert.match(applyBatch(list(), {action: "SET_DUE", taskIds: ["a"], dueDate: bad}).error, /dueDate/);
        assert.match(applyBatch(list(), {action: "SNOOZE", taskIds: ["a"], snoozedUntil: bad}).error, /snoozedUntil/);
      }
    });
    it("SNOOZE sets or removes snoozedUntil and leaves the due date alone", () => {
      const tasks = list().map((t) => ({...t, dueDate: "2026-10-30"}));
      const snoozed = applyBatch(tasks, {action: "SNOOZE", taskIds: ["a", "b"], snoozedUntil: "2026-11-02"});
      assert.equal(snoozed.tasks[0].snoozedUntil, "2026-11-02");
      assert.equal(snoozed.tasks[1].snoozedUntil, "2026-11-02");
      assert.equal("snoozedUntil" in snoozed.tasks[2], false);
      assert.equal(snoozed.tasks[0].dueDate, "2026-10-30");
      const back = applyBatch(snoozed.tasks, {action: "SNOOZE", taskIds: ["a"], snoozedUntil: null});
      assert.equal("snoozedUntil" in back.tasks[0], false);
      assert.equal(back.tasks[1].snoozedUntil, "2026-11-02");
    });
    it("SET_PROJECT needs an existing project; a task already in it keeps its order number, others lose theirs", () => {
      const tasks = list();
      tasks[0].projectId = "p1";
      tasks[0].projectOrder = 2;
      tasks[1].projectId = "p2";
      tasks[1].projectOrder = 4;
      assert.match(applyBatch(tasks, {action: "SET_PROJECT", taskIds: ["a"], projectId: "nope"}, ["p1"]).error, /Project not found/);
      assert.match(applyBatch(tasks, {action: "SET_PROJECT", taskIds: ["a"]}, ["p1"]).error, /Project not found/);
      const r = applyBatch(tasks, {action: "SET_PROJECT", taskIds: ["a", "b", "c"], projectId: "p1"}, ["p1", "p2"]);
      assert.deepEqual(r.tasks.slice(0, 3).map((t) => t.projectId), ["p1", "p1", "p1"]);
      assert.equal(r.tasks[0].projectOrder, 2);
      assert.equal("projectOrder" in r.tasks[1], false);
      assert.equal("projectOrder" in r.tasks[2], false);
      assert.equal("projectId" in r.tasks[3], false);
    });
    it("does not change the input", () => {
      const tasks = list();
      applyBatch(tasks, {action: "SNOOZE", taskIds: ["a"], snoozedUntil: "2026-11-02"});
      applyBatch(tasks, {action: "MOVE_TO_TOP", taskIds: ["e"]});
      assert.deepEqual(tasks, list());
    });
  });
});

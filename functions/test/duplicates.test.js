/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {findDuplicateTasks, duplicateKey} = require("../duplicates");

const task = (id, order, extra = {}) => ({id, order, title: "Water plants", priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", ...extra});
const ids = (tasks) => findDuplicateTasks(tasks).map((t) => t.id);

describe("findDuplicateTasks", () => {
  it("finds nothing when every task differs", () => {
    assert.deepEqual(ids([task("a", 1), task("b", 2, {title: "Mow lawn"}), task("c", 3, {dueDate: "2026-11-01"})]), []);
    assert.deepEqual(ids([]), []);
    assert.deepEqual(ids(undefined), []);
  });

  it("removes the most recently added copies and keeps the earliest", () => {
    const tasks = [
      task("new1", 1, {addedAt: "2026-10-25T10:00:00.000Z"}),
      task("old", 2, {addedAt: "2026-10-01T10:00:00.000Z"}),
      task("new2", 3, {addedAt: "2026-10-25T10:00:01.000Z"}),
    ];
    assert.deepEqual(ids(tasks), ["new1", "new2"]);
  });

  it("treats a task without addedAt as the oldest, whatever its place in the queue", () => {
    const tasks = [task("copy", 1, {addedAt: "2026-10-25T10:00:00.000Z"}), task("original", 5)];
    assert.deepEqual(ids(tasks), ["copy"]);
  });

  it("keeps the one higher in the queue when nothing tells the copies apart", () => {
    assert.deepEqual(ids([task("second", 2), task("first", 1)]), ["second"]);
  });

  it("ignores case and extra spaces in the title, and priority, estimate and tags", () => {
    const tasks = [task("a", 1), task("b", 2, {title: "  water   PLANTS ", priority: "HIGH", estimatedMinutes: 30, tags: ["home"]})];
    assert.deepEqual(ids(tasks), ["b"]);
  });

  it("does not mix tasks of different projects, due dates or repeat rules", () => {
    const tasks = [
      task("a", 1, {projectId: "p1"}), task("b", 2, {projectId: "p2"}),
      task("c", 3, {dueDate: "2026-11-01"}), task("d", 4, {dueDate: "2026-11-02"}),
      task("e", 5, {recurrence: {frequency: "WEEKLY", interval: 1}}), task("f", 6, {recurrence: {frequency: "DAILY", interval: 1}}),
    ];
    assert.deepEqual(ids(tasks), []);
  });

  it("never removes a copy that has been worked on, and keeps it in preference", () => {
    const tasks = [task("original", 1), task("started", 2, {trackedSeconds: 120}), task("plain", 3)];
    assert.deepEqual(ids(tasks), ["original", "plain"]);
    const running = [task("a", 1), task("b", 2, {timerStartedAt: "2026-10-25T09:00:00.000Z"})];
    assert.deepEqual(ids(running), ["a"]);
    const both = [task("a", 1, {trackedSeconds: 5}), task("b", 2, {trackedSeconds: 9})];
    assert.deepEqual(ids(both), []);
  });

  it("handles a whole queue duplicated at once", () => {
    const originals = ["A", "B", "C"].map((t, i) => task(`o${i}`, i + 1, {title: t}));
    const copies = ["A", "B", "C"].map((t, i) => task(`c${i}`, i + 4, {title: t, addedAt: "2026-10-25T10:00:00.000Z"}));
    assert.deepEqual(ids([...originals, ...copies]), ["c0", "c1", "c2"]);
  });

  it("skips entries without a usable title and does not change its input", () => {
    const tasks = [task("a", 1, {title: ""}), task("b", 2, {title: "  "}), {id: "c", order: 3}];
    assert.deepEqual(ids(tasks), []);
    const copy = JSON.stringify([task("x", 1), task("y", 2)]);
    const input = JSON.parse(copy);
    findDuplicateTasks(input);
    assert.equal(JSON.stringify(input), copy);
  });

  it("builds the same key for the same task", () => {
    assert.equal(duplicateKey(task("a", 1)), duplicateKey(task("b", 9)));
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {daysUntilDue, isOverdue, annotateDue} = require("../due");

const TODAY = "2026-10-22";

describe("due.js", () => {
  describe("daysUntilDue", () => {
    it("is 0 for today, positive for the future and negative for the past", () => {
      assert.equal(daysUntilDue({dueDate: "2026-10-22"}, TODAY), 0);
      assert.equal(daysUntilDue({dueDate: "2026-10-25"}, TODAY), 3);
      assert.equal(daysUntilDue({dueDate: "2026-10-20"}, TODAY), -2);
    });
    it("counts calendar days across month and daylight-saving boundaries", () => {
      assert.equal(daysUntilDue({dueDate: "2026-11-02"}, "2026-10-30"), 3);
      assert.equal(daysUntilDue({dueDate: "2026-09-28"}, "2026-09-26"), 2);
    });
    it("is null without a valid due date", () => {
      assert.equal(daysUntilDue({dueDate: ""}, TODAY), null);
      assert.equal(daysUntilDue({}, TODAY), null);
      assert.equal(daysUntilDue({dueDate: "tomorrow"}, TODAY), null);
      assert.equal(daysUntilDue({dueDate: "2026-13-45"}, TODAY), null);
      assert.equal(daysUntilDue(null, TODAY), null);
    });
  });

  describe("isOverdue", () => {
    it("is true only when the due date is before today", () => {
      assert.equal(isOverdue({dueDate: "2026-10-21"}, TODAY), true);
      assert.equal(isOverdue({dueDate: "2026-10-22"}, TODAY), false);
      assert.equal(isOverdue({dueDate: "2026-10-23"}, TODAY), false);
      assert.equal(isOverdue({dueDate: ""}, TODAY), false);
    });
  });

  describe("annotateDue", () => {
    const task = (id, dueDate, order) => ({id, title: id, dueDate, order});

    it("adds overdue and daysUntilDue to each task", () => {
      const [a, b, c] = annotateDue([task("a", "2026-10-20", 1), task("b", "2026-10-22", 2), task("c", "", 3)], TODAY);
      assert.deepEqual([a.overdue, a.daysUntilDue], [true, -2]);
      assert.deepEqual([b.overdue, b.daysUntilDue], [false, 0]);
      assert.deepEqual([c.overdue, c.daysUntilDue], [false, null]);
    });
    it("orders most overdue first, then earliest due, then undated", () => {
      const out = annotateDue([
        task("undated", "", 1),
        task("later", "2026-10-30", 2),
        task("late1", "2026-10-21", 3),
        task("late5", "2026-10-17", 4),
        task("today", "2026-10-22", 5),
      ], TODAY);
      assert.deepEqual(out.map((t) => t.id), ["late5", "late1", "today", "later", "undated"]);
    });
    it("keeps rank order, then input order, among ties", () => {
      const out = annotateDue([task("x", "2026-10-25", 3), task("y", "2026-10-25", 1), task("z", "", 2), task("w", "", 2)], TODAY);
      assert.deepEqual(out.map((t) => t.id), ["y", "x", "z", "w"]);
    });
    it("does not modify the input", () => {
      const input = [task("a", "2026-10-20", 1)];
      const copy = JSON.parse(JSON.stringify(input));
      annotateDue(input, TODAY);
      assert.deepEqual(input, copy);
    });
    it("returns an empty list for no tasks", () => {
      assert.deepEqual(annotateDue([], TODAY), []);
    });
  });
});

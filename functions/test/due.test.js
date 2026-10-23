/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {daysUntilDue, isOverdue} = require("../due");

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
});

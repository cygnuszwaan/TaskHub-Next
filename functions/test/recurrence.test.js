/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {addMonths, addRecurrence, nextDueDate} = require("../recurrence");

const rec = (frequency, interval = 1) => ({frequency, interval});

describe("recurrence.js", () => {
  describe("addMonths", () => {
    it("adds whole months", () => {
      assert.equal(addMonths("2026-10-15", 1), "2026-11-15");
      assert.equal(addMonths("2026-10-15", 3), "2027-01-15");
      assert.equal(addMonths("2026-10-15", 24), "2028-10-15");
    });
    it("moves a day past the end of the target month to its last day", () => {
      assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
      assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
      assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
    });
    it("crosses year boundaries and handles December", () => {
      assert.equal(addMonths("2026-12-10", 1), "2027-01-10");
      assert.equal(addMonths("2026-11-30", 14), "2028-01-30");
    });
    it("handles zero and negative months", () => {
      assert.equal(addMonths("2026-10-15", 0), "2026-10-15");
      assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
    });
  });

  describe("addRecurrence", () => {
    it("steps days, weeks, months and years by interval times steps", () => {
      assert.equal(addRecurrence("2026-10-23", rec("DAILY", 3), 2), "2026-10-29");
      assert.equal(addRecurrence("2026-10-23", rec("WEEKLY", 2), 1), "2026-11-06");
      assert.equal(addRecurrence("2026-10-23", rec("MONTHLY", 1), 3), "2027-01-23");
      assert.equal(addRecurrence("2026-10-23", rec("YEARLY", 1), 2), "2028-10-23");
    });
    it("moves 29 Feb to 28 Feb in a non-leap year", () => {
      assert.equal(addRecurrence("2028-02-29", rec("YEARLY"), 1), "2029-02-28");
      assert.equal(addRecurrence("2028-02-29", rec("YEARLY"), 4), "2032-02-29");
    });
    it("throws on an unknown frequency", () => {
      assert.throws(() => addRecurrence("2026-10-23", rec("HOURLY"), 1));
    });
  });

  describe("nextDueDate", () => {
    const today = "2026-10-23"; // Friday

    it("adds one interval to a due date that is today or in the future", () => {
      assert.equal(nextDueDate("2026-10-23", rec("DAILY"), today), "2026-10-24");
      assert.equal(nextDueDate("2026-10-26", rec("WEEKLY"), today), "2026-11-02");
      assert.equal(nextDueDate("2026-10-30", rec("MONTHLY"), today), "2026-11-30");
    });
    it("keeps the rhythm when the task is finished early", () => {
      // due next Monday 26 Oct, done on Friday: the next one is the Monday after
      assert.equal(nextDueDate("2026-10-26", rec("WEEKLY"), today), "2026-11-02");
    });
    it("skips occurrences already missed when finished late", () => {
      // weekly, due 2 Oct (3 weeks ago): 9 and 16 Oct are missed, 23 Oct is not after today, so 30 Oct
      assert.equal(nextDueDate("2026-10-02", rec("WEEKLY"), today), "2026-10-30");
      assert.equal(nextDueDate("2026-10-20", rec("DAILY"), today), "2026-10-24");
      assert.equal(nextDueDate("2026-08-15", rec("MONTHLY"), today), "2026-11-15");
    });
    it("always returns a date after today", () => {
      for (const due of ["2020-01-01", "2026-10-22", "2026-10-23", "2026-10-24", "2027-05-01"]) {
        for (const r of [rec("DAILY"), rec("WEEKLY", 2), rec("MONTHLY", 3), rec("YEARLY")]) {
          assert.ok(nextDueDate(due, r, today) > today, `${due} ${r.frequency}`);
        }
      }
    });
    it("honours the interval", () => {
      assert.equal(nextDueDate("2026-10-23", rec("WEEKLY", 2), today), "2026-11-06");
      assert.equal(nextDueDate("2026-10-23", rec("DAILY", 10), today), "2026-11-02");
    });
    it("counts every step from the original due date, so month ends do not drift", () => {
      assert.equal(nextDueDate("2026-01-31", rec("MONTHLY"), "2026-02-28"), "2026-03-31");
      assert.equal(nextDueDate("2026-01-31", rec("MONTHLY"), "2026-03-31"), "2026-04-30");
    });
    it("counts from today when there is no valid due date", () => {
      for (const due of ["", undefined, null, "soon", "2026-1-5"]) {
        assert.equal(nextDueDate(due, rec("WEEKLY"), today), "2026-10-30");
      }
      assert.equal(nextDueDate("", rec("MONTHLY", 2), today), "2026-12-23");
    });
    it("copes with a due date many years in the past", () => {
      assert.equal(nextDueDate("2000-01-01", rec("DAILY"), today), "2026-10-24");
    });
  });
});

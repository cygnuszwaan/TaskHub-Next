/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {DEFAULT_LIMIT, MAX_LIMIT, clampLimit, toIso, serializeCompleted} = require("../completed");

describe("completed.js", () => {
  describe("clampLimit", () => {
    it("accepts whole numbers, as numbers or strings", () => {
      assert.equal(clampLimit("10"), 10);
      assert.equal(clampLimit(25), 25);
      assert.equal(clampLimit("1"), 1);
    });
    it("caps the limit", () => {
      assert.equal(clampLimit(String(MAX_LIMIT)), MAX_LIMIT);
      assert.equal(clampLimit("100000"), MAX_LIMIT);
    });
    it("falls back to the default for missing, zero, negative and non-numeric values", () => {
      for (const raw of [undefined, null, "", "abc", "0", "-5", NaN, {}]) {
        assert.equal(clampLimit(raw), DEFAULT_LIMIT);
      }
    });
    it("truncates fractions", () => {
      assert.equal(clampLimit("7.9"), 7);
    });
  });

  describe("toIso", () => {
    const iso = "2026-10-22T03:15:00.000Z";

    it("converts Firestore-style timestamps, Dates and ISO strings", () => {
      assert.equal(toIso({toDate: () => new Date(iso)}), iso);
      assert.equal(toIso(new Date(iso)), iso);
      assert.equal(toIso(iso), iso);
    });
    it("returns an empty string for missing or invalid values", () => {
      for (const value of [undefined, null, "", "not a date", {toDate: () => new Date("x")}]) {
        assert.equal(toIso(value), "");
      }
    });
  });

  describe("serializeCompleted", () => {
    it("keeps the task fields and turns completedAt into an ISO string", () => {
      const rows = [{id: "a", title: "Mow lawn", tags: ["home"], completedAt: {toDate: () => new Date("2026-10-22T03:15:00Z")}}];
      assert.deepEqual(serializeCompleted(rows), [{id: "a", title: "Mow lawn", tags: ["home"], completedAt: "2026-10-22T03:15:00.000Z"}]);
    });
    it("gives an empty completedAt when it is missing", () => {
      assert.equal(serializeCompleted([{id: "a"}])[0].completedAt, "");
    });
    it("preserves order, handles an empty list and does not mutate its input", () => {
      assert.deepEqual(serializeCompleted([]), []);
      const stamp = {toDate: () => new Date("2026-10-22T03:15:00Z")};
      const rows = [{id: "a", completedAt: stamp}, {id: "b", completedAt: stamp}];
      const out = serializeCompleted(rows);
      assert.deepEqual(out.map((r) => r.id), ["a", "b"]);
      assert.equal(rows[0].completedAt, stamp);
    });
  });
});

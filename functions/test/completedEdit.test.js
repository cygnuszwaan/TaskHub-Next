/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_TRACKED_SECONDS, MAX_ESTIMATE_MINUTES, MAX_TAGS, isArchiveId, applyCompletedEdit} = require("../completedEdit");

const NZ = "Pacific/Auckland";
const now = new Date("2026-10-24T02:00:00Z"); // Sat 24 Oct 2026, 15:00 NZ
const row = {title: "Mow lawn", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 1800, tags: ["Garden"], projectId: "p1", projectOrder: 2, description: "Front only", completedCount: 4, recentSeconds: [1800], completedAt: new Date("2026-10-20T01:00:00Z")};
const opts = {projectIds: ["p1", "p2"], timeZone: NZ, now};
const edit = (fields, r = row, o = opts) => applyCompletedEdit(r, fields, o);
const without = (r, ...keys) => {
  const copy = {...r};
  for (const key of keys) delete copy[key];
  return copy;
};

describe("completedEdit.js", () => {
  describe("isArchiveId", () => {
    it("accepts a document id and rejects empty, long, slashed or non-string values", () => {
      assert.equal(isArchiveId("aB3dE5"), true);
      for (const bad of ["", "a/b", "x".repeat(201), 5, null, undefined, {}]) assert.equal(isArchiveId(bad), false, String(bad));
    });
  });

  describe("applyCompletedEdit", () => {
    it("has nothing to change for no fields, garbage, or only fields that cannot be edited", () => {
      for (const fields of [undefined, null, "x", [], {}, {title: "New", recurrence: null, completedCount: 99, recentSeconds: [1], status: "PENDING"}]) {
        assert.deepEqual(edit(fields), {error: "Nothing to change"}, JSON.stringify(fields));
      }
    });
    it("sets priority, estimate, time and tags", () => {
      const r = edit({priority: "HIGH", estimatedMinutes: 44.6, trackedSeconds: 3601.4, tags: [" Home ", "home", "", 7, "Paid"]});
      assert.deepEqual(r, {set: {priority: "HIGH", estimatedMinutes: 45, trackedSeconds: 3601, tags: ["Home", "Paid"]}, remove: []});
    });
    it("ignores keys it does not edit when others are valid", () => {
      assert.deepEqual(edit({priority: "MEDIUM", title: "x", completedCount: 1}), {set: {priority: "MEDIUM"}, remove: []});
    });
    it("rejects an unusable priority, estimate, time or tag list", () => {
      assert.match(edit({priority: "URGENT"}).error, /Priority/);
      for (const n of [0, -5, NaN, "30", null, MAX_ESTIMATE_MINUTES + 1]) assert.match(edit({estimatedMinutes: n}).error, /Estimate/, String(n));
      for (const n of [-1, NaN, "60", null, MAX_TRACKED_SECONDS + 1]) assert.match(edit({trackedSeconds: n}).error, /Time/, String(n));
      assert.match(edit({tags: "a,b"}).error, /Tags/);
    });
    it("allows zero tracked time (the estimate then counts) and the largest values", () => {
      assert.deepEqual(edit({trackedSeconds: 0}).set, {trackedSeconds: 0});
      assert.equal(edit({trackedSeconds: MAX_TRACKED_SECONDS}).set.trackedSeconds, MAX_TRACKED_SECONDS);
      assert.equal(edit({estimatedMinutes: MAX_ESTIMATE_MINUTES}).set.estimatedMinutes, MAX_ESTIMATE_MINUTES);
    });
    it("keeps at most MAX_TAGS tags", () => {
      const tags = Array.from({length: MAX_TAGS + 5}, (_, i) => `t${i}`);
      assert.equal(edit({tags}).set.tags.length, MAX_TAGS);
    });
    it("clears the tags with an empty list", () => {
      assert.deepEqual(edit({tags: []}), {set: {tags: []}, remove: []});
    });

    describe("description", () => {
      it("sets trimmed text", () => {
        assert.deepEqual(edit({description: "  Back lawn too  "}), {set: {description: "Back lawn too"}, remove: []});
      });
      it("cuts text to 2000 characters", () => {
        assert.equal(edit({description: "x".repeat(2500)}).set.description.length, 2000);
      });
      it("removes the description for null or empty text, when the row has some", () => {
        for (const value of [null, "", "   "]) assert.deepEqual(edit({description: value}), {set: {}, remove: ["description"]}, String(value));
      });
      it("has nothing to change when removing description the row does not have", () => {
        const bare = without(row, "description");
        assert.deepEqual(edit({description: null}, bare), {error: "Nothing to change"});
      });
      it("rejects anything that is not text", () => {
        for (const value of [5, [], {}, true]) assert.deepEqual(edit({description: value}), {error: "Description must be text"}, JSON.stringify(value));
      });
    });

    describe("materials", () => {
      const ids = () => {
        let n = 0;
        return () => `m${++n}`;
      };
      const mats = (fields, r = row) => edit({materials: fields}, r, {...opts, makeId: ids()});
      it("keeps a cost on an object item, and takes strings and objects together", () => {
        const out = mats([{text: " Tap ", cost: 12.5}, "PTFE tape", {text: "Free", cost: 0}, {text: "Bad", cost: -1}, {cost: 5}, {text: ""}]).set.materials;
        assert.deepEqual(out, [{id: "m1", text: "Tap", checked: true, cost: 12.5}, {id: "m2", text: "PTFE tape", checked: true}, {id: "m3", text: "Free", checked: true, cost: 0}, {id: "m4", text: "Bad", checked: true}]);
      });
      it("stores a plain list of texts as checked items, trimmed", () => {
        assert.deepEqual(mats(["  Tap ", "PTFE tape", ""]), {set: {materials: [{id: "m1", text: "Tap", checked: true}, {id: "m2", text: "PTFE tape", checked: true}]}, remove: []});
      });
      it("cuts long texts and lists, and ignores non-text items", () => {
        const long = mats(["x".repeat(150), 5, null, "ok"]).set.materials;
        assert.deepEqual(long.map((m) => m.text.length), [100, 2]);
        assert.equal(mats(Array.from({length: 40}, (_, i) => `item ${i}`)).set.materials.length, 30);
      });
      it("removes the list with null or an empty one, and has nothing to change when there was none", () => {
        const withList = {...row, materials: [{id: "a", text: "Tap", checked: false}]};
        assert.deepEqual(mats(null, withList), {set: {}, remove: ["materials"]});
        assert.deepEqual(mats([" ", ""], withList), {set: {}, remove: ["materials"]});
        assert.deepEqual(mats([]), {error: "Nothing to change"});
      });
      it("rejects anything that is not a list", () => {
        assert.deepEqual(mats("Tap"), {error: "Materials must be a list"});
        assert.deepEqual(mats({text: "Tap"}), {error: "Materials must be a list"});
      });
    });

    describe("project", () => {
      it("moves the row to another current project and drops the order number, which belonged to the old one", () => {
        assert.deepEqual(edit({projectId: "p2"}), {set: {projectId: "p2"}, remove: ["projectOrder"]});
      });
      it("has nothing to change for the project it already has", () => {
        assert.deepEqual(edit({projectId: "p1"}), {error: "Nothing to change"});
      });
      it("removes the project and its order with null or an empty id", () => {
        for (const id of [null, ""]) assert.deepEqual(edit({projectId: id}), {set: {}, remove: ["projectId", "projectOrder"]});
      });
      it("has nothing to change when removing a project the row does not have", () => {
        const bare = without(row, "projectId", "projectOrder");
        assert.deepEqual(edit({projectId: null}, bare), {error: "Nothing to change"});
      });
      it("puts a row with no project into a project", () => {
        const bare = without(row, "projectId", "projectOrder");
        assert.deepEqual(edit({projectId: "p2"}, bare), {set: {projectId: "p2"}, remove: ["projectOrder"]});
      });
      it("rejects an unknown project, but treats the id a row already has as unchanged even when that project is gone", () => {
        assert.deepEqual(edit({projectId: "nope"}), {error: "Unknown project"});
        assert.deepEqual(edit({projectId: 5}), {error: "Unknown project"});
        assert.deepEqual(edit({projectId: "gone", priority: "HIGH"}, {...row, projectId: "gone"}), {set: {priority: "HIGH"}, remove: []});
      });
    });

    describe("completion time", () => {
      it("reads the date and time as the zone's wall clock", () => {
        const r = edit({completedDate: "2026-10-18", completedTime: "09:30"});
        assert.equal(r.set.completedAt.toISOString(), "2026-10-17T20:30:00.000Z"); // 09:30 at +13:00
        assert.deepEqual(r.remove, []);
      });
      it("uses the offset in force on that day (daylight time ended or began)", () => {
        assert.equal(edit({completedDate: "2026-07-01", completedTime: "12:00"}).set.completedAt.toISOString(), "2026-07-01T00:00:00.000Z"); // +12:00
      });
      it("needs both a valid date and a valid time", () => {
        for (const fields of [{completedDate: "2026-10-18"}, {completedTime: "09:30"}, {completedDate: "18/10/2026", completedTime: "09:30"}, {completedDate: "2026-10-18", completedTime: "9:30"}, {completedDate: "2026-10-18", completedTime: "24:00"}, {completedDate: "2026-10-18", completedTime: 930}]) {
          assert.deepEqual(edit(fields), {error: "The completion needs a date and a time"}, JSON.stringify(fields));
        }
      });
      it("rejects a time the zone skips over (clocks go forward 27 Sep 2026 at 02:00)", () => {
        assert.deepEqual(edit({completedDate: "2026-09-27", completedTime: "02:30"}), {error: "That time does not exist in your time zone"});
      });
      it("rejects a completion in the future, allowing a few minutes of clock slack", () => {
        assert.deepEqual(edit({completedDate: "2026-10-24", completedTime: "16:00"}), {error: "A task cannot be completed in the future"});
        assert.ok(edit({completedDate: "2026-10-24", completedTime: "15:03"}).set.completedAt);
      });
      it("rejects a date before the year 2000", () => {
        assert.deepEqual(edit({completedDate: "1999-12-31", completedTime: "12:00"}), {error: "That date is too far back"});
      });
    });

    it("never changes the history the row carries, or touches the input", () => {
      const copy = JSON.parse(JSON.stringify(row));
      const r = edit({trackedSeconds: 60, completedCount: 1, recentSeconds: []});
      assert.deepEqual(Object.keys(r.set), ["trackedSeconds"]);
      assert.deepEqual(JSON.parse(JSON.stringify(row)), copy);
    });
    it("reports the first unusable value, even when others are fine", () => {
      assert.deepEqual(edit({priority: "HIGH", estimatedMinutes: 0}), {error: `Estimate must be 1 to ${MAX_ESTIMATE_MINUTES} minutes`});
    });
  });
});

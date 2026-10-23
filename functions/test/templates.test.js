/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildTemplates} = require("../templates");

describe("templates.js", () => {
  describe("buildTemplates", () => {
    const rows = [
      {id: "a", title: "Mow lawn", priority: "LOW", dueDate: "2026-10-01", estimatedMinutes: 45, tags: ["Outdoor", " Garden "], status: "PENDING", trackedSeconds: 900, scheduledStart: "2026-10-02T10:00:00+13:00", googleCalendarEventId: "ev1", recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: [{id: "m1", text: " Petrol ", checked: true}, {id: "m2", text: "", checked: false}], comments: "Check the blade", completedAt: "2026-10-20T01:00:00.000Z", order: 3},
      {id: "b", title: "mow LAWN ", priority: "HIGH", estimatedMinutes: 10, tags: [], completedAt: "2026-10-10T01:00:00.000Z"},
      {id: "c", title: "Pay rates", priority: "bogus", estimatedMinutes: -5, tags: "x", completedAt: "2026-10-09T01:00:00.000Z"},
    ];

    it("keeps the newest row of each title, ignoring case and surrounding spaces", () => {
      const out = buildTemplates(rows);
      assert.deepEqual(out.map((t) => t.title), ["Mow lawn", "Pay rates"]);
      assert.equal(out[0].priority, "LOW");
    });
    it("copies the reusable fields and drops everything tied to one instance", () => {
      const [t] = buildTemplates(rows);
      assert.deepEqual(t, {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: ["Outdoor", "Garden"], completedAt: "2026-10-20T01:00:00.000Z", recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: ["Petrol"], comments: "Check the blade"});
    });
    it("falls back to MEDIUM, 15 minutes and no tags for unusable values", () => {
      const t = buildTemplates(rows)[1];
      assert.equal(t.priority, "MEDIUM");
      assert.equal(t.estimatedMinutes, 15);
      assert.deepEqual(t.tags, []);
      for (const key of ["recurrence", "projectId", "projectOrder", "materials", "comments"]) assert.ok(!(key in t), key);
    });
    it("leaves out the order number of a row with no project", () => {
      assert.ok(!("projectOrder" in buildTemplates([{title: "x", projectOrder: 3}])[0]));
    });
    it("skips rows without a usable title and tolerates a non-array", () => {
      assert.deepEqual(buildTemplates([null, {title: "  "}, {title: 4}, "x"]), []);
      assert.deepEqual(buildTemplates(undefined), []);
    });
    it("stops at the limit", () => {
      const many = Array.from({length: 10}, (_, i) => ({title: `Task ${i}`}));
      assert.equal(buildTemplates(many, 3).length, 3);
    });
  });
});

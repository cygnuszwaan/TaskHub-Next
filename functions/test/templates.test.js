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
      assert.deepEqual(t, {title: "Mow lawn", priority: "LOW", estimatedMinutes: 15, tags: ["Outdoor", "Garden"], completedAt: "2026-10-20T01:00:00.000Z", completedCount: 2, recentSeconds: [900], recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: [{text: "Petrol"}], comments: "Check the blade"});
    });
    it("falls back to MEDIUM, 15 minutes and no tags for unusable values", () => {
      const t = buildTemplates(rows)[1];
      assert.equal(t.priority, "MEDIUM");
      assert.equal(t.estimatedMinutes, 15);
      assert.equal(t.completedCount, 1);
      assert.ok(!("recentSeconds" in t));
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

    describe("history", () => {
      const row = (extra) => ({title: "Mow lawn", estimatedMinutes: 45, tags: [], ...extra});
      it("averages the tracked times of the latest rows, rounded to 5 minutes, and counts the rows", () => {
        const out = buildTemplates([row({trackedSeconds: 1500}), row({trackedSeconds: 1200}), row({trackedSeconds: 0}), row({title: "MOW LAWN", trackedSeconds: 900})]);
        assert.equal(out.length, 1);
        assert.equal(out[0].estimatedMinutes, 20); // (25 + 20 + 15) / 3 = 20 min
        assert.equal(out[0].completedCount, 4);
        assert.deepEqual(out[0].recentSeconds, [900, 1200, 1500]); // oldest first
      });
      it("uses only the latest five timed rows", () => {
        const rows = [60, 60, 60, 60, 60, 36000].map((s) => row({trackedSeconds: s}));
        const [t] = buildTemplates(rows);
        assert.deepEqual(t.recentSeconds, [60, 60, 60, 60, 60]);
        assert.equal(t.estimatedMinutes, 5);
        assert.equal(t.completedCount, 6);
      });
      it("prefers the newest row's stored history, and the larger count", () => {
        const [t] = buildTemplates([row({trackedSeconds: 600, completedCount: 12, recentSeconds: [1800, 2400]}), row({trackedSeconds: 60})]);
        assert.deepEqual(t.recentSeconds, [1800, 2400]);
        assert.equal(t.estimatedMinutes, 35); // 35 min
        assert.equal(t.completedCount, 12);
      });
      it("keeps the row's estimate when nothing was timed", () => {
        const [t] = buildTemplates([row({trackedSeconds: 0}), row({})]);
        assert.equal(t.estimatedMinutes, 45);
        assert.equal(t.completedCount, 2);
      });
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");

const NZ = "Pacific/Auckland";
const {DEFAULT_LIMIT, MAX_LIMIT, SUMMARY_WEEKS, clampLimit, toIso, serializeCompleted, weekStartOf, firstSummaryWeek, summaryWindowStart, summarizeCompleted} = require("../completed");

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

  describe("weekStartOf", () => {
    it("returns the Monday on or before the date", () => {
      assert.equal(weekStartOf("2026-10-19"), "2026-10-19"); // Monday
      assert.equal(weekStartOf("2026-10-23"), "2026-10-19"); // Friday
      assert.equal(weekStartOf("2026-10-25"), "2026-10-19"); // Sunday
      assert.equal(weekStartOf("2026-10-26"), "2026-10-26"); // next Monday
    });
    it("crosses month and year boundaries", () => {
      assert.equal(weekStartOf("2026-11-01"), "2026-10-26");
      assert.equal(weekStartOf("2027-01-01"), "2026-12-28");
    });
  });

  describe("summary window", () => {
    // Friday 23 Oct 2026, 10:00 NZDT
    const now = new Date("2026-10-22T21:00:00Z");

    it("opens on the Monday SUMMARY_WEEKS - 1 weeks before the current week", () => {
      assert.equal(SUMMARY_WEEKS, 8);
      assert.equal(firstSummaryWeek(NZ, now), "2026-08-31");
      assert.equal(firstSummaryWeek(NZ, now, 1), "2026-10-19");
    });
    it("uses the NZ date, not the UTC date, to find the current week", () => {
      // Monday 26 Oct 00:30 NZDT is still Sunday 25 Oct in UTC
      assert.equal(firstSummaryWeek(NZ, new Date("2026-10-25T11:30:00Z"), 1), "2026-10-26");
    });
    it("starts at NZ midnight of that Monday", () => {
      assert.equal(summaryWindowStart(NZ, now, 1).toISOString(), "2026-10-18T11:00:00.000Z");
    });
    it("follows the given zone", () => {
      // 21:00 UTC on Thursday 22 Oct is still Thursday 22 Oct (14:00 PDT) in Los Angeles: same week, Monday 19 Oct
      assert.equal(firstSummaryWeek("America/Los_Angeles", now, 1), "2026-10-19");
      assert.equal(summaryWindowStart("America/Los_Angeles", now, 1).toISOString(), "2026-10-19T07:00:00.000Z");
      // 00:30 NZDT Monday 26 Oct is Sunday 25 Oct 04:30 in Los Angeles: still the previous week
      const edge = new Date("2026-10-25T11:30:00Z");
      assert.equal(firstSummaryWeek(NZ, edge, 1), "2026-10-26");
      assert.equal(firstSummaryWeek("America/Los_Angeles", edge, 1), "2026-10-19");
    });
  });

  describe("summarizeCompleted", () => {
    const now = new Date("2026-10-22T21:00:00Z"); // Friday 23 Oct 2026, NZ
    const done = (iso, extra) => ({title: "t", priority: "MEDIUM", estimatedMinutes: 10, tags: [], completedAt: new Date(iso), ...extra});

    it("returns zeroed, complete weeks for no rows", () => {
      const s = summarizeCompleted([], NZ, now);
      assert.equal(s.totalCount, 0);
      assert.equal(s.totalMinutes, 0);
      assert.equal(s.since, "2026-08-31");
      assert.equal(s.weeks.length, 8);
      assert.deepEqual(s.weeks[0], {weekStart: "2026-08-31", count: 0, minutes: 0});
      assert.deepEqual(s.weeks[7], {weekStart: "2026-10-19", count: 0, minutes: 0});
      assert.deepEqual(s.byPriority.map((p) => p.priority), ["HIGH", "MEDIUM", "LOW"]);
      assert.deepEqual(s.byTag, []);
    });
    it("counts completions and minutes per NZ week", () => {
      const rows = [
        done("2026-10-22T21:00:00Z", {estimatedMinutes: 30}), // this week
        done("2026-10-20T01:00:00Z", {estimatedMinutes: 15}), // this week
        done("2026-10-14T01:00:00Z", {estimatedMinutes: 45}), // last week
      ];
      const s = summarizeCompleted(rows, NZ, now);
      assert.deepEqual(s.weeks[7], {weekStart: "2026-10-19", count: 2, minutes: 45});
      assert.deepEqual(s.weeks[6], {weekStart: "2026-10-12", count: 1, minutes: 45});
      assert.equal(s.totalCount, 3);
      assert.equal(s.totalMinutes, 90);
    });
    it("assigns completions to weeks of the given zone", () => {
      // Sunday 18 Oct 23:30 UTC is Monday 19 Oct 12:30 NZ (this week) but Sunday 18 Oct 16:30 in Los Angeles (last week)
      const rows = [done("2026-10-18T23:30:00Z")];
      assert.equal(summarizeCompleted(rows, NZ, now).weeks[7].count, 1);
      const la = summarizeCompleted(rows, "America/Los_Angeles", new Date("2026-10-23T03:00:00Z"));
      assert.equal(la.weeks[7].count, 0);
      assert.equal(la.weeks[6].count, 1);
    });
    it("assigns a completion to the NZ week, not the UTC week", () => {
      // Sunday 18 Oct 23:30 UTC is Monday 19 Oct 12:30 NZ: this week. Sunday 18 Oct 10:00 UTC is Sunday 23:00 NZ: last week.
      const s = summarizeCompleted([done("2026-10-18T23:30:00Z"), done("2026-10-18T10:00:00Z")], NZ, now);
      assert.equal(s.weeks[7].count, 1);
      assert.equal(s.weeks[6].count, 1);
    });
    it("ignores rows outside the window, in the future, or without a valid completedAt", () => {
      const rows = [
        done("2026-08-01T00:00:00Z"),
        done("2026-11-10T00:00:00Z"),
        done("2026-10-22T00:00:00Z", {completedAt: undefined}),
        done("2026-10-22T00:00:00Z", {completedAt: "not a date"}),
        null,
      ];
      assert.equal(summarizeCompleted(rows, NZ, now).totalCount, 0);
    });
    it("accepts Firestore-style timestamps and ISO strings", () => {
      const rows = [
        done("2026-10-20T01:00:00Z", {completedAt: {toDate: () => new Date("2026-10-20T01:00:00Z")}}),
        done("2026-10-20T01:00:00Z", {completedAt: "2026-10-20T01:00:00.000Z"}),
      ];
      assert.equal(summarizeCompleted(rows, NZ, now).weeks[7].count, 2);
    });
    it("totals by priority and skips unknown priorities there but not in the overall total", () => {
      const rows = [
        done("2026-10-20T01:00:00Z", {priority: "HIGH", estimatedMinutes: 20}),
        done("2026-10-20T01:00:00Z", {priority: "HIGH", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {priority: "LOW", estimatedMinutes: 5}),
        done("2026-10-20T01:00:00Z", {priority: "URGENT", estimatedMinutes: 7}),
      ];
      const s = summarizeCompleted(rows, NZ, now);
      assert.deepEqual(s.byPriority, [
        {priority: "HIGH", count: 2, minutes: 30},
        {priority: "MEDIUM", count: 0, minutes: 0},
        {priority: "LOW", count: 1, minutes: 5},
      ]);
      assert.equal(s.totalCount, 4);
      assert.equal(s.totalMinutes, 42);
    });
    it("totals by tag, grouped case-insensitively, counting a repeated tag once per task", () => {
      const rows = [
        done("2026-10-20T01:00:00Z", {tags: ["Home", "home", " Outdoor "], estimatedMinutes: 20}),
        done("2026-10-20T01:00:00Z", {tags: ["HOME"], estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {tags: ["Shopping", "", 5], estimatedMinutes: 40}),
        done("2026-10-20T01:00:00Z", {tags: undefined}),
      ];
      const s = summarizeCompleted(rows, NZ, now);
      assert.deepEqual(s.byTag, [
        {tag: "Home", count: 2, minutes: 30},
        {tag: "Shopping", count: 1, minutes: 40},
        {tag: "Outdoor", count: 1, minutes: 20},
      ]);
    });
    it("orders tags by count, then minutes, then name", () => {
      const rows = [
        done("2026-10-20T01:00:00Z", {tags: ["b"], estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {tags: ["a"], estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {tags: ["c"], estimatedMinutes: 50}),
      ];
      assert.deepEqual(summarizeCompleted(rows, NZ, now).byTag.map((t) => t.tag), ["c", "a", "b"]);
    });
    it("treats missing or invalid estimatedMinutes as 0 and rounds fractions", () => {
      const rows = [
        done("2026-10-20T01:00:00Z", {estimatedMinutes: undefined}),
        done("2026-10-20T01:00:00Z", {estimatedMinutes: -5}),
        done("2026-10-20T01:00:00Z", {estimatedMinutes: "30"}),
        done("2026-10-20T01:00:00Z", {estimatedMinutes: 12.6}),
      ];
      const s = summarizeCompleted(rows, NZ, now);
      assert.equal(s.totalCount, 4);
      assert.equal(s.totalMinutes, 13);
    });
    it("does not mutate its input", () => {
      const rows = [done("2026-10-20T01:00:00Z", {tags: ["x"]})];
      const copy = JSON.stringify(rows);
      summarizeCompleted(rows, NZ, now);
      assert.equal(JSON.stringify(rows), copy);
    });
  });
});

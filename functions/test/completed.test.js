/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");

const NZ = "Pacific/Auckland";
const {DEFAULT_LIMIT, MAX_LIMIT, SUMMARY_WEEKS, clampLimit, toIso, serializeCompleted, weekStartOf, firstSummaryWeek, summaryWindowStart, computeStreaks, summarizeCompleted, summarizeProjectHours} = require("../completed");

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
    it("allows as many as a summary reads, which is what the page loads", () => {
      assert.equal(MAX_LIMIT, 1000);
      assert.equal(clampLimit("1000"), 1000);
      assert.equal(clampLimit("1001"), 1000);
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
      assert.deepEqual(s.byJob, []);
    });
    it("counts tracked time instead of the estimate when a row has any, and the estimate when there is none", () => {
      const s = summarizeCompleted([
        done("2026-10-20T01:00:00Z", {estimatedMinutes: 60, trackedSeconds: 1500, priority: "HIGH", tags: ["Home"]}), // 25 min tracked
        done("2026-10-20T02:00:00Z", {estimatedMinutes: 30, priority: "HIGH", tags: ["Home"]}), // no tracking field: 30 min estimate
        done("2026-10-20T03:00:00Z", {estimatedMinutes: 45, trackedSeconds: 0}), // never timed: its 45 min estimate
      ], NZ, now);
      assert.equal(s.totalMinutes, 100);
      assert.equal(s.weeks[7].minutes, 100);
      assert.equal(s.byPriority[0].minutes, 55);
      assert.deepEqual(s.byTag, [{tag: "Home", count: 2, minutes: 55}]);
    });
    it("sums tracked seconds exactly before rounding to whole minutes", () => {
      const s = summarizeCompleted([
        done("2026-10-20T01:00:00Z", {trackedSeconds: 40}),
        done("2026-10-20T02:00:00Z", {trackedSeconds: 40}),
        done("2026-10-20T03:00:00Z", {trackedSeconds: 40}),
      ], NZ, now);
      assert.equal(s.totalMinutes, 2);
      assert.equal(s.weeks[7].minutes, 2);
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

  describe("computeStreaks", () => {
    const set = (...days) => new Set(days);
    const since = "2026-08-31";
    const today = "2026-10-23";

    it("is all zero with no completions", () => {
      assert.deepEqual(computeStreaks(set(), since, today), {current: 0, longest: 0, currentLimited: false, longestLimited: false});
    });
    it("counts consecutive days ending today", () => {
      const s = computeStreaks(set("2026-10-21", "2026-10-22", "2026-10-23"), since, today);
      assert.equal(s.current, 3);
      assert.equal(s.longest, 3);
    });
    it("keeps the streak alive when only yesterday and earlier have a completion", () => {
      assert.equal(computeStreaks(set("2026-10-21", "2026-10-22"), since, today).current, 2);
    });
    it("is broken once a whole day has passed with nothing", () => {
      const s = computeStreaks(set("2026-10-20", "2026-10-21"), since, today);
      assert.equal(s.current, 0);
      assert.equal(s.longest, 2);
    });
    it("counts a single day today as a streak of 1", () => {
      assert.equal(computeStreaks(set(today), since, today).current, 1);
    });
    it("finds the longest run anywhere, and a gap splits runs", () => {
      const s = computeStreaks(set("2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-15", "2026-10-22", "2026-10-23"), since, today);
      assert.equal(s.longest, 4);
      assert.equal(s.current, 2);
    });
    it("steps across month and year ends", () => {
      const s = computeStreaks(set("2026-12-30", "2026-12-31", "2027-01-01"), "2026-12-01", "2027-01-01");
      assert.equal(s.current, 3);
    });
    it("flags a number that may be larger because its run starts on the first day of the window", () => {
      const s = computeStreaks(set("2026-08-31", "2026-09-01", "2026-09-02"), since, today);
      assert.deepEqual(s, {current: 0, longest: 3, currentLimited: false, longestLimited: true});
      const live = computeStreaks(set("2026-08-31", "2026-09-01", "2026-09-02"), since, "2026-09-02");
      assert.deepEqual(live, {current: 3, longest: 3, currentLimited: true, longestLimited: true});
    });
    it("does not flag the longest when a longer run exists elsewhere", () => {
      const s = computeStreaks(set("2026-08-31", "2026-09-10", "2026-09-11", "2026-09-12"), since, today);
      assert.equal(s.longest, 3);
      assert.equal(s.longestLimited, false);
    });
  });

  describe("summarizeCompleted streak and projects", () => {
    const now = new Date("2026-10-22T21:00:00Z"); // Friday 23 Oct 2026, 10:00 NZ
    const done = (iso, extra) => ({title: "t", priority: "MEDIUM", estimatedMinutes: 10, tags: [], completedAt: new Date(iso), ...extra});

    it("has an empty project list and no streak for no rows", () => {
      const s = summarizeCompleted([], NZ, now);
      assert.deepEqual(s.byProject, []);
      assert.deepEqual(s.streak, {current: 0, longest: 0, currentLimited: false, longestLimited: false});
    });
    it("counts days in the configured zone, not UTC", () => {
      // 21 Oct 23:30 UTC is 22 Oct 12:30 NZ; 22 Oct 10:00 UTC is 22 Oct 23:00 NZ (the same NZ day); 22 Oct 21:00 UTC is 23 Oct NZ
      const s = summarizeCompleted([done("2026-10-21T23:30:00Z"), done("2026-10-22T10:00:00Z"), done("2026-10-22T21:00:00Z")], NZ, now);
      assert.equal(s.streak.current, 2);
      assert.equal(s.streak.longest, 2);
      // In Los Angeles those instants fall on 21 Oct (twice) and 22 Oct, and today is 22 Oct
      const la = summarizeCompleted([done("2026-10-21T23:30:00Z"), done("2026-10-22T10:00:00Z"), done("2026-10-22T21:00:00Z")], "America/Los_Angeles", now);
      assert.equal(la.streak.current, 2);
    });
    it("counts several completions on one day as one day", () => {
      const s = summarizeCompleted([done("2026-10-20T01:00:00Z"), done("2026-10-20T02:00:00Z"), done("2026-10-20T03:00:00Z")], NZ, now);
      assert.equal(s.streak.longest, 1);
    });
    it("ignores completions dated after today and rows outside the window for the streak", () => {
      const s = summarizeCompleted([done("2026-10-24T01:00:00Z"), done("2026-08-01T00:00:00Z")], NZ, now);
      assert.equal(s.streak.longest, 0);
    });
    it("totals by project with its current name, most completed first, leaving out tasks without a project", () => {
      const projects = [{id: "p1", name: "Kitchen reno"}, {id: "p2", name: "Garden"}];
      const rows = [
        done("2026-10-20T01:00:00Z", {projectId: "p1", estimatedMinutes: 20}),
        done("2026-10-20T01:00:00Z", {projectId: "p2", estimatedMinutes: 30}),
        done("2026-10-20T01:00:00Z", {projectId: "p2", estimatedMinutes: 15}),
        done("2026-10-20T01:00:00Z"),
        done("2026-10-20T01:00:00Z", {projectId: ""}),
        done("2026-10-20T01:00:00Z", {projectId: 5}),
      ];
      const s = summarizeCompleted(rows, NZ, now, undefined, projects);
      assert.deepEqual(s.byProject, [
        {projectId: "p2", name: "Garden", count: 2, minutes: 45},
        {projectId: "p1", name: "Kitchen reno", count: 1, minutes: 20},
      ]);
      assert.equal(s.totalCount, 6);
    });
    it("orders projects with equal counts by minutes, then name", () => {
      const projects = [{id: "a", name: "B"}, {id: "b", name: "A"}, {id: "c", name: "C"}];
      const rows = [
        done("2026-10-20T01:00:00Z", {projectId: "a", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {projectId: "b", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {projectId: "c", estimatedMinutes: 50}),
      ];
      assert.deepEqual(summarizeCompleted(rows, NZ, now, undefined, projects).byProject.map((p) => p.name), ["C", "A", "B"]);
    });
    it("groups the tasks of deleted projects into one unnamed entry, last on a tie", () => {
      const projects = [{id: "p1", name: "Garden"}];
      const rows = [
        done("2026-10-20T01:00:00Z", {projectId: "gone1", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {projectId: "gone2", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {projectId: "p1", estimatedMinutes: 10}),
        done("2026-10-20T01:00:00Z", {projectId: "p1", estimatedMinutes: 10}),
      ];
      const s = summarizeCompleted(rows, NZ, now, undefined, projects);
      assert.deepEqual(s.byProject, [
        {projectId: "p1", name: "Garden", count: 2, minutes: 20},
        {projectId: null, name: null, count: 2, minutes: 20},
      ]);
      // More completions put the deleted-projects entry first; with everything equal the named project comes first
      const more = summarizeCompleted(rows.slice(0, 3), NZ, now, undefined, projects);
      assert.equal(more.byProject[0].name, null);
      const tie2 = summarizeCompleted([rows[0], rows[2]], NZ, now, undefined, projects);
      assert.deepEqual(tie2.byProject.map((p) => p.name), ["Garden", null]);
    });
    it("treats every project as deleted when none are given", () => {
      const s = summarizeCompleted([done("2026-10-20T01:00:00Z", {projectId: "p1"})], NZ, now);
      assert.deepEqual(s.byProject, [{projectId: null, name: null, count: 1, minutes: 10}]);
    });
  });

  describe("summarizeCompleted byJob", () => {
    const now = new Date("2026-10-22T21:00:00Z"); // Friday 23 Oct 2026, NZ
    const done = (iso, extra) => ({title: "Mow lawn", priority: "MEDIUM", estimatedMinutes: 40, tags: [], completedAt: new Date(iso), ...extra});

    it("is empty for no rows, and leaves out a task completed only once", () => {
      assert.deepEqual(summarizeCompleted([], NZ, now).byJob, []);
      assert.deepEqual(summarizeCompleted([done("2026-10-20T01:00:00Z")], NZ, now).byJob, []);
    });
    it("groups rows by title ignoring case, using the newest row's title, estimate, count and samples", () => {
      const rows = [
        done("2026-10-06T01:00:00Z", {title: "mow lawn", estimatedMinutes: 30, completedCount: 4, recentSeconds: [1800, 1800, 1800, 1800]}),
        done("2026-10-20T01:00:00Z", {title: " Mow Lawn ", estimatedMinutes: 45, completedCount: 5, recentSeconds: [1800, 1800, 1800, 1800, 3000]}),
        done("2026-10-13T01:00:00Z", {completedCount: 5, recentSeconds: [9999]}),
      ];
      assert.deepEqual(summarizeCompleted(rows, NZ, now).byJob, [{title: "Mow Lawn", count: 3, completedCount: 5, averageMinutes: 35, estimatedMinutes: 45}]);
    });
    it("does not depend on the order of the rows", () => {
      const a = done("2026-10-06T01:00:00Z", {estimatedMinutes: 30, completedCount: 4});
      const b = done("2026-10-20T01:00:00Z", {estimatedMinutes: 45, completedCount: 5});
      assert.deepEqual(summarizeCompleted([a, b], NZ, now).byJob, summarizeCompleted([b, a], NZ, now).byJob);
      assert.equal(summarizeCompleted([a, b], NZ, now).byJob[0].estimatedMinutes, 45);
    });
    it("counts rows archived before history was kept: the count from the rows, the average from their tracked times", () => {
      const rows = [
        done("2026-10-06T01:00:00Z", {trackedSeconds: 600}),
        done("2026-10-13T01:00:00Z", {trackedSeconds: 0}),
        done("2026-10-20T01:00:00Z", {trackedSeconds: 1200}),
      ];
      const [job] = summarizeCompleted(rows, NZ, now).byJob;
      assert.equal(job.count, 3);
      assert.equal(job.completedCount, 3);
      assert.equal(job.averageMinutes, 15); // (10 + 20) / 2, rows with no tracked time left out
    });
    it("takes the stored count when it is larger than the rows in the window, so a job seen once this period still shows", () => {
      const [job] = summarizeCompleted([done("2026-10-20T01:00:00Z", {completedCount: 12})], NZ, now).byJob;
      assert.equal(job.count, 1);
      assert.equal(job.completedCount, 12);
    });
    it("has no average without tracked time, and no estimate when it is unusable", () => {
      const rows = [done("2026-10-13T01:00:00Z"), done("2026-10-20T01:00:00Z", {estimatedMinutes: "x"})];
      const [job] = summarizeCompleted(rows, NZ, now).byJob;
      assert.equal(job.averageMinutes, null);
      assert.equal(job.estimatedMinutes, null);
    });
    it("ignores rows outside the window and rows without a title", () => {
      const rows = [done("2026-08-01T00:00:00Z"), done("2026-10-20T01:00:00Z"), done("2026-10-21T01:00:00Z", {title: "  "}), done("2026-10-22T01:00:00Z", {title: undefined})];
      assert.deepEqual(summarizeCompleted(rows, NZ, now).byJob, []);
    });
    it("orders jobs by completions in the window, then in all, then title", () => {
      const rows = [
        done("2026-10-19T01:00:00Z", {title: "B job"}), done("2026-10-20T01:00:00Z", {title: "B job"}),
        done("2026-10-19T02:00:00Z", {title: "A job"}), done("2026-10-20T02:00:00Z", {title: "A job"}),
        done("2026-10-19T03:00:00Z", {title: "C job", completedCount: 9}), done("2026-10-20T03:00:00Z", {title: "C job", completedCount: 10}),
        done("2026-10-17T03:00:00Z", {title: "D job"}), done("2026-10-18T03:00:00Z", {title: "D job"}), done("2026-10-19T04:00:00Z", {title: "D job"}),
      ];
      assert.deepEqual(summarizeCompleted(rows, NZ, now).byJob.map((j) => j.title), ["D job", "C job", "A job", "B job"]);
    });
    it("does not mutate its input", () => {
      const rows = [done("2026-10-20T01:00:00Z", {trackedSeconds: 60}), done("2026-10-06T01:00:00Z", {trackedSeconds: 120})];
      const copy = JSON.parse(JSON.stringify(rows));
      summarizeCompleted(rows, NZ, now);
      assert.deepEqual(JSON.parse(JSON.stringify(rows)), copy);
    });
  });

  describe("summarizeProjectHours", () => {
    const projects = [{id: "p1", name: "Website"}, {id: "p2", name: "apps"}];
    const row = (projectId, iso, extra) => ({title: "T", projectId, completedAt: new Date(iso), trackedSeconds: 3600, estimatedMinutes: 15, ...extra});

    it("is empty for no rows, no projects or garbage input", () => {
      assert.deepEqual(summarizeProjectHours([], projects, NZ), []);
      assert.deepEqual(summarizeProjectHours([row("p1", "2026-10-20T01:00:00Z")], [], NZ), []);
      assert.deepEqual(summarizeProjectHours(undefined, undefined, NZ), []);
      assert.deepEqual(summarizeProjectHours([null, 5, {}], projects, NZ), []);
    });
    it("sums each project's hours per Monday-to-Sunday week, newest week first, and in total", () => {
      const rows = [
        row("p1", "2026-10-20T01:00:00Z", {trackedSeconds: 3600}), // Tue 20 Oct NZ
        row("p1", "2026-10-22T01:00:00Z", {trackedSeconds: 1800}), // Thu 22 Oct NZ, same week
        row("p1", "2026-10-13T01:00:00Z", {trackedSeconds: 7200}), // the week before
        row("p2", "2026-10-20T01:00:00Z", {trackedSeconds: 600}),
      ];
      assert.deepEqual(summarizeProjectHours(rows, projects, NZ), [
        {projectId: "p2", name: "apps", count: 1, minutes: 10, estimatedMinutes: 0, weeks: [{weekStart: "2026-10-19", count: 1, minutes: 10, estimatedMinutes: 0}]},
        {projectId: "p1", name: "Website", count: 3, minutes: 210, estimatedMinutes: 0, weeks: [
          {weekStart: "2026-10-19", count: 2, minutes: 90, estimatedMinutes: 0},
          {weekStart: "2026-10-12", count: 1, minutes: 120, estimatedMinutes: 0},
        ]},
      ]);
    });
    it("puts Sunday night and Monday morning, in the owner's time zone, in different weeks", () => {
      const rows = [
        row("p1", "2026-10-25T10:30:00Z"), // Sun 25 Oct 23:30 NZ
        row("p1", "2026-10-25T11:30:00Z"), // Mon 26 Oct 00:30 NZ
      ];
      const [entry] = summarizeProjectHours(rows, projects, NZ);
      assert.deepEqual(entry.weeks.map((w) => [w.weekStart, w.count]), [["2026-10-26", 1], ["2026-10-19", 1]]);
    });
    it("counts an estimate for a task that was never timed and reports that part separately", () => {
      const rows = [
        row("p1", "2026-10-20T01:00:00Z", {trackedSeconds: 3600}),
        row("p1", "2026-10-21T01:00:00Z", {trackedSeconds: 0, estimatedMinutes: 30}),
        row("p1", "2026-10-22T01:00:00Z", {trackedSeconds: undefined, estimatedMinutes: 15}),
      ];
      const [entry] = summarizeProjectHours(rows, projects, NZ);
      assert.equal(entry.minutes, 105);
      assert.equal(entry.estimatedMinutes, 45);
      assert.deepEqual(entry.weeks, [{weekStart: "2026-10-19", count: 3, minutes: 105, estimatedMinutes: 45}]);
    });
    it("makes the totals the sums of the rounded weeks, so a timesheet adds up", () => {
      const rows = [
        row("p1", "2026-10-20T01:00:00Z", {trackedSeconds: 90}), // 1.5 min
        row("p1", "2026-10-13T01:00:00Z", {trackedSeconds: 90}),
      ];
      const [entry] = summarizeProjectHours(rows, projects, NZ);
      assert.deepEqual(entry.weeks.map((w) => w.minutes), [2, 2]);
      assert.equal(entry.minutes, 4);
    });
    it("ignores rows without a valid date, with no project or with a project that no longer exists", () => {
      const rows = [
        row("p1", "2026-10-20T01:00:00Z"),
        {...row("p1", "2026-10-20T01:00:00Z"), completedAt: undefined},
        {...row("p1", "2026-10-20T01:00:00Z"), completedAt: "not a date"},
        {...row("p1", "2026-10-20T01:00:00Z"), projectId: undefined},
        row("deleted", "2026-10-20T01:00:00Z"),
      ];
      const entries = summarizeProjectHours(rows, projects, NZ);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].count, 1);
    });
    it("lists only projects with a completion, by name ignoring case, and does not mutate its input", () => {
      const rows = [row("p1", "2026-10-20T01:00:00Z"), row("p2", "2026-10-20T01:00:00Z")];
      const copy = JSON.parse(JSON.stringify(rows));
      assert.deepEqual(summarizeProjectHours(rows, [...projects, {id: "p3", name: "Empty"}], NZ).map((e) => e.name), ["apps", "Website"]);
      assert.deepEqual(JSON.parse(JSON.stringify(rows)), copy);
    });
    it("reads a Firestore-style Timestamp", () => {
      const stamp = {toDate: () => new Date("2026-10-20T01:00:00Z")};
      const [entry] = summarizeProjectHours([{projectId: "p1", completedAt: stamp, trackedSeconds: 600}], projects, NZ);
      assert.equal(entry.weeks[0].weekStart, "2026-10-19");
    });
  });
});

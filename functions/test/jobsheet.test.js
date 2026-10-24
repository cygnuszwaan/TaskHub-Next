/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {JOB_SHEET_MAX_ENTRIES, parseJobSheetRequest, pdfText, fmtMinutes, decimalHours, hoursText, entryTimeText, weekRangeText, buildJobSheet} = require("../jobsheet");
const {summarizeProjectHours} = require("../completed");

const NZ = "Pacific/Auckland";
const now = new Date("2026-10-24T02:00:00Z"); // Sat 24 Oct 2026, 15:00 NZ
const project = {id: "p1", name: "Kitchen reno"};
// 12:30 NZ (UTC+13) on the given day
const at = (day, hour = 12) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+13:00`);
const row = (extra) => ({title: "Fit tap", priority: "HIGH", estimatedMinutes: 30, trackedSeconds: 1500, tags: ["Indoor"], projectId: "p1", completedAt: at("2026-10-20"), ...extra});
const sheet = (request, rows, p = project) => buildJobSheet({request, rows, project: p, timeZone: NZ, now});

describe("jobsheet.js", () => {
  describe("parseJobSheetRequest", () => {
    it("reads a task, a project to date and a project week", () => {
      assert.deepEqual(parseJobSheetRequest({archiveId: "abc"}), {type: "TASK", archiveId: "abc"});
      assert.deepEqual(parseJobSheetRequest({projectId: "p1"}), {type: "PROJECT", projectId: "p1"});
      assert.deepEqual(parseJobSheetRequest({projectId: "p1", weekStart: ""}), {type: "PROJECT", projectId: "p1"});
      assert.deepEqual(parseJobSheetRequest({projectId: "p1", weekStart: "2026-10-19"}), {type: "WEEK", projectId: "p1", weekStart: "2026-10-19"});
    });
    it("snaps any date in the week to its Monday", () => {
      assert.equal(parseJobSheetRequest({projectId: "p1", weekStart: "2026-10-25"}).weekStart, "2026-10-19");
      assert.equal(parseJobSheetRequest({projectId: "p1", weekStart: "2026-10-22"}).weekStart, "2026-10-19");
    });
    it("rejects nothing, both, and unusable values", () => {
      for (const body of [undefined, null, {}, "x", [], {archiveId: "a", projectId: "p"}, {archiveId: "a/b"}, {archiveId: 5}, {projectId: 5}, {projectId: "p1", weekStart: "2026-02-30"}, {projectId: "p1", weekStart: "next week"}, {projectId: "p1", weekStart: 20261019}]) {
        assert.equal(typeof parseJobSheetRequest(body).error, "string", JSON.stringify(body));
      }
    });
  });

  describe("pdfText", () => {
    it("keeps macrons and line breaks, drops emoji and control characters, plain-spaces odd spaces", () => {
      assert.equal(pdfText("Whangaparāoa 🌿 path\u202fedges"), "Whangaparāoa path edges");
      assert.equal(pdfText("a\r\nb\u0000c"), "a\nbc");
      assert.equal(pdfText("  ✅ Done 👍🏽  "), "Done");
      assert.equal(pdfText(undefined), "");
      assert.equal(pdfText(42), "42");
    });
  });

  describe("time text", () => {
    it("formats minutes and hours as the Stats page does", () => {
      assert.equal(fmtMinutes(45), "45m");
      assert.equal(fmtMinutes(65), "1h 5m");
      assert.equal(fmtMinutes(120), "2h");
      assert.equal(decimalHours(200), "3.33");
      assert.equal(hoursText(200), "3h 20m (3.33 h)");
    });
    it("shows tracked time, else the estimate marked est., else a dash", () => {
      assert.equal(entryTimeText({trackedSeconds: 1500}), "25m");
      assert.equal(entryTimeText({trackedSeconds: 45}), "45s");
      assert.equal(entryTimeText({trackedSeconds: 3900}), "1h 5m");
      assert.equal(entryTimeText({trackedSeconds: 0, estimatedMinutes: 30}), "30m est.");
      assert.equal(entryTimeText({estimatedMinutes: 90}), "1h 30m est.");
      assert.equal(entryTimeText({}), "-");
    });
    it("words a week's span, the year at the end", () => {
      assert.equal(weekRangeText("2026-10-19"), "19 Oct \u2013 25 Oct 2026");
      assert.equal(weekRangeText("2026-12-28"), "28 Dec \u2013 3 Jan 2027");
    });
  });

  describe("buildJobSheet", () => {
    it("builds a task sheet with its times, comments, tags and materials, no totals", () => {
      const s = sheet({type: "TASK"}, [row({comments: "Washer replaced", materials: [{id: "m", text: "Tap", checked: true}, {id: "n", text: "PTFE tape", checked: false}]})]);
      assert.equal(s.kind, "TASK");
      assert.equal(s.heading, "Fit tap");
      assert.equal(s.projectName, "Kitchen reno");
      assert.equal(s.totals, null);
      assert.equal(s.period, "");
      assert.equal(s.empty, false);
      assert.equal(s.sections.length, 1);
      assert.equal(s.sections[0].heading, "");
      assert.deepEqual(s.sections[0].entries[0], {title: "Fit tap", completed: "Tue, 20 Oct, 12:00 pm", timeText: "25m", estimated: false, priority: "HIGH", tags: ["Indoor"], materials: ["Tap", "PTFE tape"], comments: "Washer replaced"});
      assert.match(s.generatedText, /24 October 2026/);
      assert.equal(s.timeZone, NZ);
    });
    it("leaves the project line off a task outside any project, and is empty with no row", () => {
      assert.equal(sheet({type: "TASK"}, [row({projectId: undefined})], null).projectName, null);
      const s = sheet({type: "TASK"}, [], null);
      assert.equal(s.empty, true);
      assert.deepEqual(s.sections, []);
    });
    it("marks an entry estimated only when no time was tracked and an estimate counts", () => {
      const entries = (r) => sheet({type: "TASK"}, [r]).sections[0].entries[0];
      assert.equal(entries(row({trackedSeconds: 0})).estimated, true);
      assert.equal(entries(row({trackedSeconds: undefined})).timeText, "30m est.");
      assert.equal(entries(row({trackedSeconds: 0, estimatedMinutes: undefined})).estimated, false);
      assert.equal(entries(row()).estimated, false);
    });
    it("cleans titles and comments for the PDF font and gives an untitled task a name", () => {
      const e = sheet({type: "TASK"}, [row({title: "🌿 Mow   lawn", comments: "Front\r\nback"})]).sections[0].entries[0];
      assert.equal(e.title, "Mow lawn");
      assert.equal(e.comments, "Front\nback");
      assert.equal(sheet({type: "TASK"}, [row({title: undefined})]).sections[0].entries[0].title, "Untitled task");
    });

    it("lists a project to date by week, oldest first, with entries oldest first and the Stats figures", () => {
      const rows = [
        row({title: "B", completedAt: at("2026-10-21"), trackedSeconds: 600}),
        row({title: "A", completedAt: at("2026-10-20"), trackedSeconds: 1800}),
        row({title: "C", completedAt: at("2026-10-13"), trackedSeconds: 0, estimatedMinutes: 20}),
      ];
      const s = sheet({type: "PROJECT"}, rows);
      assert.equal(s.kind, "PROJECT");
      assert.equal(s.heading, "Kitchen reno");
      assert.equal(s.period, "All work to 24 Oct 2026");
      assert.deepEqual(s.sections.map((x) => x.heading), ["12 Oct \u2013 18 Oct 2026", "19 Oct \u2013 25 Oct 2026"]);
      assert.deepEqual(s.sections.map((x) => x.entries.map((e) => e.title)), [["C"], ["A", "B"]]);
      const stats = summarizeProjectHours(rows, [project], NZ)[0];
      assert.deepEqual({count: s.totals.count, minutes: s.totals.minutes, estimatedMinutes: s.totals.estimatedMinutes}, {count: stats.count, minutes: stats.minutes, estimatedMinutes: stats.estimatedMinutes});
      assert.equal(s.totals.text, "1h (1.00 h)");
      assert.deepEqual(s.sections[1].totals, {count: 2, minutes: 40, estimatedMinutes: 0, text: "40m (0.67 h)"});
      assert.deepEqual(s.sections[0].totals, {count: 1, minutes: 20, estimatedMinutes: 20, text: "20m (0.33 h)"});
      assert.equal(s.truncated, false);
      assert.equal(s.empty, false);
    });
    it("puts a completion in the week of the owner's clock, not UTC", () => {
      // Sun 25 Oct 23:30 NZ is still week of 19 Oct; Mon 26 Oct 00:30 NZ (Sun 11:30 UTC) is the next week
      const rows = [row({title: "Late", completedAt: new Date("2026-10-25T23:30:00+13:00")}), row({title: "Early", completedAt: new Date("2026-10-26T00:30:00+13:00")})];
      const s = sheet({type: "PROJECT"}, rows);
      assert.deepEqual(s.sections.map((x) => x.entries.map((e) => e.title)), [["Late"], ["Early"]]);
    });
    it("builds a week sheet from that week's rows only", () => {
      const rows = [row({title: "In", completedAt: at("2026-10-22")}), row({title: "Before", completedAt: at("2026-10-12")}), row({title: "After", completedAt: at("2026-10-27")})];
      const s = sheet({type: "WEEK", weekStart: "2026-10-19"}, rows);
      assert.equal(s.kind, "WEEK");
      assert.equal(s.period, "19 Oct \u2013 25 Oct 2026");
      assert.deepEqual(s.sections.map((x) => x.entries.map((e) => e.title)), [["In"]]);
      assert.equal(s.totals.count, 1);
      assert.equal(s.totals.minutes, 25);
    });
    it("is empty, with zero totals, for a week or project with no completions", () => {
      const week = sheet({type: "WEEK", weekStart: "2026-11-02"}, [row()]);
      assert.equal(week.empty, true);
      assert.deepEqual(week.sections, []);
      assert.equal(week.totals.count, 0);
      assert.equal(week.totals.text, "0m (0.00 h)");
      assert.equal(sheet({type: "PROJECT"}, []).empty, true);
    });
    it("ignores rows with no valid completion time", () => {
      const s = sheet({type: "PROJECT"}, [row({completedAt: undefined}), row({completedAt: "garbage"}), row({title: "Good"})]);
      assert.equal(s.totals.count, 1);
      assert.equal(s.sections[0].entries[0].title, "Good");
    });
    it("lists only the newest entries of a very large project but totals them all", () => {
      const rows = [];
      for (let i = 0; i < JOB_SHEET_MAX_ENTRIES + 5; i++) rows.push(row({title: `T${i}`, completedAt: new Date(Date.parse("2026-01-01T00:00:00Z") + i * 60000), trackedSeconds: 60}));
      const s = sheet({type: "PROJECT"}, rows);
      const listed = s.sections.flatMap((x) => x.entries);
      assert.equal(listed.length, JOB_SHEET_MAX_ENTRIES);
      assert.equal(s.truncated, true);
      assert.equal(s.totals.count, JOB_SHEET_MAX_ENTRIES + 5);
      assert.ok(listed.some((e) => e.title === `T${JOB_SHEET_MAX_ENTRIES + 4}`));
      assert.ok(!listed.some((e) => e.title === "T0"));
    });
    it("does not modify its input", () => {
      const rows = [row({comments: "x", materials: [{id: "m", text: "Tap", checked: true}]})];
      const copy = JSON.parse(JSON.stringify(rows));
      sheet({type: "PROJECT"}, rows);
      sheet({type: "TASK"}, rows);
      assert.deepEqual(JSON.parse(JSON.stringify(rows)), copy);
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {JOB_SHEET_MAX_ENTRIES, parseJobSheetRequest, pdfText, fmtMinutes, decimalHours, hoursText, entryTimeText, weekRangeText, buildJobSheet, JOB_SHEET_MAX_PHOTOS, sheetArchiveIds, gatherPhotos, withPhotos} = require("../jobsheet");
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

  describe("buildJobSheet invoice figures", () => {
    const costed = (extra) => row({materials: [{id: "a", text: "Washer", checked: true, cost: 2.5}, {id: "b", text: "Tape", checked: true}], ...extra});
    const inv = (request, rows, hourlyRate) => buildJobSheet({request, rows, project, timeZone: NZ, now, hourlyRate});
    it("prints no money without a rate or a cost, whatever else is on the sheet", () => {
      for (const hourlyRate of [undefined, null, 0, "85", NaN, -5]) {
        const s = inv({type: "PROJECT"}, [row({})], hourlyRate);
        assert.equal(s.invoice, false);
        assert.equal(s.rateText, "");
        assert.equal(s.totals.money, null);
        assert.equal(s.sections[0].totals.money, null);
        assert.equal(s.sections[0].entries[0].money, null);
      }
    });
    it("bills the tracked minutes at the rate for a task: 25m at $85/h is $35.42", () => {
      const s = inv({type: "TASK"}, [row({})], 85);
      assert.equal(s.invoice, true);
      assert.equal(s.rateText, "$85.00");
      assert.deepEqual(s.sections[0].entries[0].money, {labour: "$35.42", materials: "", travel: "", travelKm: "", total: "$35.42"});
    });
    it("adds materials to the total and lists a costed material with its cost", () => {
      const s = inv({type: "TASK"}, [costed({})], 85);
      const e = s.sections[0].entries[0];
      assert.deepEqual(e.money, {labour: "$35.42", materials: "$2.50", travel: "", travelKm: "", total: "$37.92"});
      assert.deepEqual(e.materials, ["Washer ($2.50)", "Tape"]);
    });
    it("prints materials alone when there is no rate but a cost", () => {
      const s = inv({type: "TASK"}, [costed({})], null);
      assert.equal(s.invoice, true);
      assert.equal(s.rateText, "");
      assert.deepEqual(s.sections[0].entries[0].money, {labour: "", materials: "$2.50", travel: "", travelKm: "", total: "$2.50"});
    });
    it("bills an estimate when no time was tracked and marks it est.", () => {
      const e = inv({type: "TASK"}, [row({trackedSeconds: 0, estimatedMinutes: 30})], 90).sections[0].entries[0];
      assert.deepEqual(e.money, {labour: "$45.00 est.", materials: "", travel: "", travelKm: "", total: "$45.00"});
    });
    it("bills nothing for a task with neither time nor estimate", () => {
      assert.equal(inv({type: "TASK"}, [row({trackedSeconds: 0, estimatedMinutes: undefined})], 90).sections[0].entries[0].money.total, "$0.00");
    });
    it("rounds the time to the minute as the sheet shows it", () => {
      assert.equal(inv({type: "TASK"}, [row({trackedSeconds: 3920})], 60).sections[0].entries[0].money.labour, "$65.00");
      assert.equal(inv({type: "TASK"}, [row({trackedSeconds: 3929})], 60).sections[0].entries[0].money.labour, "$65.00");
      assert.equal(inv({type: "TASK"}, [row({trackedSeconds: 3931})], 60).sections[0].entries[0].money.labour, "$66.00");
    });
    it("totals each week and the project as sums of the tasks' own amounts", () => {
      const rows = [
        costed({title: "A", completedAt: at("2026-10-20"), trackedSeconds: 1500}),
        row({title: "B", completedAt: at("2026-10-21"), trackedSeconds: 600}),
        costed({title: "C", completedAt: at("2026-10-13"), trackedSeconds: 0, estimatedMinutes: 20}),
      ];
      const s = inv({type: "PROJECT"}, rows, 85);
      // A 25m = 35.42, B 10m = 14.17, C 20m = 28.33
      assert.deepEqual(s.sections[1].totals.money, {labour: "$49.59", materials: "$2.50", travel: "", travelKm: "", total: "$52.09"});
      assert.deepEqual(s.sections[0].totals.money, {labour: "$28.33", materials: "$2.50", travel: "", travelKm: "", total: "$30.83"});
      assert.deepEqual(s.totals.money, {labour: "$77.92", materials: "$5.00", travel: "", travelKm: "", total: "$82.92"});
    });
    it("a week sheet totals only its own week", () => {
      const rows = [row({title: "In", completedAt: at("2026-10-20"), trackedSeconds: 3600}), row({title: "Out", completedAt: at("2026-10-13"), trackedSeconds: 3600})];
      const s = inv({type: "WEEK", weekStart: "2026-10-19"}, rows, 100);
      assert.equal(s.totals.money.total, "$100.00");
    });
    it("keeps the totals complete when a very long project lists only its newest entries", () => {
      const rows = Array.from({length: JOB_SHEET_MAX_ENTRIES + 5}, (_, i) => row({title: `T${i}`, trackedSeconds: 3600, completedAt: new Date(Date.parse("2026-01-05T00:00:00Z") + i * 3600e3)}));
      const s = inv({type: "PROJECT"}, rows, 10);
      assert.equal(s.truncated, true);
      assert.equal(s.totals.money.total, new Intl.NumberFormat("en-NZ", {style: "currency", currency: "NZD"}).format((JOB_SHEET_MAX_ENTRIES + 5) * 10));
    });
    it("leaves the time figures as they were", () => {
      const rows = [row({trackedSeconds: 1500}), costed({completedAt: at("2026-10-21"), trackedSeconds: 600})];
      const plain = sheet({type: "PROJECT"}, rows);
      const priced = inv({type: "PROJECT"}, rows, 85);
      assert.equal(priced.totals.text, plain.totals.text);
      assert.deepEqual(priced.sections.map((x) => x.totals.minutes), plain.sections.map((x) => x.totals.minutes));
    });
    describe("travel", () => {
      const inv2 = (request, rows, hourlyRate, travelRate) => buildJobSheet({request, rows, project, timeZone: NZ, now, hourlyRate, travelRate});
      it("bills the km at the travel rate, shows the distance on the entry and the rate on the sheet", () => {
        const s = inv2({type: "TASK"}, [row({travelKm: 12.5})], 85, 1.2);
        const e = s.sections[0].entries[0];
        assert.equal(s.invoice, true);
        assert.equal(s.travelRateText, "$1.20");
        assert.equal(e.travelText, "12.5 km");
        assert.deepEqual(e.money, {labour: "$35.42", materials: "", travel: "$15.00", travelKm: "12.5 km", total: "$50.42"});
      });
      it("is an invoice sheet on travel alone, with no hourly rate and no costs", () => {
        const s = inv2({type: "TASK"}, [row({travelKm: 10})], null, 1.2);
        assert.equal(s.invoice, true);
        assert.equal(s.rateText, "");
        assert.deepEqual(s.sections[0].entries[0].money, {labour: "", materials: "", travel: "$12.00", travelKm: "10 km", total: "$12.00"});
      });
      it("shows the distance but prints no money without a travel rate or a distance", () => {
        for (const rate of [undefined, null, 0]) {
          const s = inv2({type: "TASK"}, [row({travelKm: 10})], null, rate);
          assert.equal(s.invoice, false);
          assert.equal(s.travelRateText, "");
          assert.equal(s.sections[0].entries[0].money, null);
          assert.equal(s.sections[0].entries[0].travelText, "10 km");
        }
        const none = inv2({type: "TASK"}, [row({})], 85, 1.2);
        assert.equal(none.travelRateText, "");
        assert.equal(none.sections[0].entries[0].money.travel, "");
        assert.equal(none.sections[0].entries[0].travelText, "");
      });
      it("totals travel and distance for each week and the project", () => {
        const rows = [
          row({title: "A", completedAt: at("2026-10-20"), trackedSeconds: 1500, travelKm: 12.5}),
          row({title: "B", completedAt: at("2026-10-21"), trackedSeconds: 600, travelKm: 7.5}),
          row({title: "C", completedAt: at("2026-10-13"), trackedSeconds: 0, estimatedMinutes: 20, travelKm: 30}),
        ];
        const s = inv2({type: "PROJECT"}, rows, 85, 1.2);
        assert.deepEqual(s.sections[1].totals.money, {labour: "$49.59", materials: "", travel: "$24.00", travelKm: "20 km", total: "$73.59"});
        assert.deepEqual(s.sections[0].totals.money, {labour: "$28.33", materials: "", travel: "$36.00", travelKm: "30 km", total: "$64.33"});
        assert.deepEqual(s.totals.money, {labour: "$77.92", materials: "", travel: "$60.00", travelKm: "50 km", total: "$137.92"});
      });
      it("a week sheet totals only its own week's travel", () => {
        const rows = [row({title: "In", completedAt: at("2026-10-20"), travelKm: 10}), row({title: "Out", completedAt: at("2026-10-13"), travelKm: 100})];
        assert.equal(inv2({type: "WEEK", weekStart: "2026-10-19"}, rows, null, 1).totals.money.travel, "$10.00");
      });
    });
    it("works for an empty sheet", () => {
      const s = inv({type: "PROJECT"}, [], 85);
      assert.equal(s.empty, true);
      assert.deepEqual(s.totals.money, {labour: "$0.00", materials: "", travel: "", travelKm: "", total: "$0.00"});
    });
  });

  describe("buildJobSheet", () => {
    it("builds a task sheet with its times, comments and materials, no totals, priority or tags", () => {
      const s = sheet({type: "TASK"}, [row({comments: "Washer replaced", materials: [{id: "m", text: "Tap", checked: true}, {id: "n", text: "PTFE tape", checked: false}]})]);
      assert.equal(s.kind, "TASK");
      assert.equal(s.heading, "Fit tap");
      assert.equal(s.projectName, "Kitchen reno");
      assert.equal(s.totals, null);
      assert.equal(s.period, "");
      assert.equal(s.empty, false);
      assert.equal(s.sections.length, 1);
      assert.equal(s.sections[0].heading, "");
      assert.deepEqual(s.sections[0].entries[0], {archiveId: "", jobNumber: "", title: "Fit tap", started: "", completed: "Tue, 20 Oct, 12:00 pm", timeText: "25m", travelText: "", estimated: false, money: null, materials: ["Tap", "PTFE tape"], comments: "Washer replaced"});
      assert.match(s.generatedText, /24 October 2026/);
      assert.equal(s.timeZone, NZ);
    });
    it("gives each entry its job number as plain digits, and nothing for a task that has none or an unusable one", () => {
      const s = sheet({type: "PROJECT"}, [row({jobNumber: 42, completedAt: at("2026-10-20")}), row({jobNumber: 1234567, completedAt: at("2026-10-21")}), row({completedAt: at("2026-10-22")}), row({jobNumber: "7", completedAt: at("2026-10-23")})]);
      assert.deepEqual(s.sections.flatMap((x) => x.entries).map((e) => e.jobNumber), ["42", "1234567", "", ""]);
    });
    it("gives the time the timer was first started on the owner's clock, and nothing for a bad value", () => {
      const entry = (extra) => sheet({type: "TASK"}, [row(extra)]).sections[0].entries[0];
      assert.equal(entry({firstStartedAt: "2026-10-19T20:05:00.000Z"}).started, "Tue, 20 Oct, 9:05 am");
      assert.equal(entry({firstStartedAt: "junk"}).started, "");
      assert.equal("priority" in entry({}), false);
      assert.equal("tags" in entry({}), false);
    });
    it("carries the contractor information, cleaned for the PDF font, on every kind of sheet", () => {
      const info = "A Builder Ltd \u{1F528}\nPh 021 000 000";
      assert.equal(buildJobSheet({request: {type: "TASK"}, rows: [row()], project: null, timeZone: NZ, now, contractorInfo: info}).contractorInfo, "A Builder Ltd\nPh 021 000 000");
      assert.equal(buildJobSheet({request: {type: "PROJECT"}, rows: [row()], project: {id: "p1", name: "Kitchen reno"}, timeZone: NZ, now, contractorInfo: info}).contractorInfo, "A Builder Ltd\nPh 021 000 000");
      assert.equal(buildJobSheet({request: {type: "WEEK", weekStart: "2026-10-19"}, rows: [], project: {id: "p1", name: "Kitchen reno"}, timeZone: NZ, now, contractorInfo: info}).contractorInfo, "A Builder Ltd\nPh 021 000 000");
    });
    it("has no contractor information when none is given or it is not text", () => {
      for (const contractorInfo of [undefined, null, "", "   ", 5]) {
        assert.equal(buildJobSheet({request: {type: "TASK"}, rows: [row()], project: null, timeZone: NZ, now, contractorInfo}).contractorInfo, "", String(contractorInfo));
      }
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
      assert.deepEqual(s.sections[1].totals, {count: 2, minutes: 40, estimatedMinutes: 0, text: "40m (0.67 h)", money: null});
      assert.deepEqual(s.sections[0].totals, {count: 1, minutes: 20, estimatedMinutes: 20, text: "20m (0.33 h)", money: null});
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
  describe("photos", () => {
    const rowsWithIds = (n) => Array.from({length: n}, (_, i) => row({archiveId: `a${i}`, title: `Job ${i}`, completedAt: at("2026-10-20", 8 + i)}));
    const photo = (archiveId, id, minute = 0) => ({archiveId, id, data: `data-${id}`, addedAt: `2026-10-21T00:${String(minute).padStart(2, "0")}:00.000Z`});
    const fakes = (all) => {
      const calls = {fetch: [], count: []};
      return {
        calls,
        fetchChunk: async (ids) => {
          calls.fetch.push(ids);
          return all.filter((p) => ids.includes(p.archiveId));
        },
        countChunk: async (ids) => {
          calls.count.push(ids);
          return all.filter((p) => ids.includes(p.archiveId)).length;
        },
      };
    };

    it("puts each entry's archive id on the sheet and lists them in sheet order", () => {
      const s = sheet({type: "PROJECT"}, rowsWithIds(3).reverse());
      assert.deepEqual(sheetArchiveIds(s), ["a0", "a1", "a2"]);
      assert.deepEqual(sheetArchiveIds(sheet({type: "PROJECT"}, [row()])), []);
      assert.deepEqual(sheetArchiveIds(null), []);
    });
    it("reads the photos of every entry, oldest first, when they are under the cap", async () => {
      const f = fakes([photo("a0", "p2", 5), photo("a0", "p1", 1), photo("a2", "p3")]);
      const {byId, omitted} = await gatherPhotos(["a0", "a1", "a2"], f);
      assert.deepEqual(byId.get("a0").map((p) => p.id), ["p1", "p2"]);
      assert.equal(byId.has("a1"), false);
      assert.deepEqual(byId.get("a2").map((p) => p.id), ["p3"]);
      assert.equal(omitted, 0);
      assert.equal(f.calls.count.length, 0);
    });
    it("stops at the cap in sheet order and counts the rest", async () => {
      const all = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) all.push(photo(`a${i}`, `p${i}${j}`, j));
      const {byId, omitted} = await gatherPhotos(["a0", "a1", "a2", "a3", "a4"], {...fakes(all), cap: 7, chunkSize: 5});
      assert.equal([...byId.values()].flat().length, 7);
      assert.deepEqual(byId.get("a2").map((p) => p.id), ["p20"]);
      assert.equal(byId.has("a3"), false);
      assert.equal(omitted, 8);
    });
    it("only counts, never reads, the chunks after the cap is reached", async () => {
      const all = ["a0", "a1", "a2", "a3"].flatMap((id) => [photo(id, `${id}x`), photo(id, `${id}y`, 1)]);
      const f = fakes(all);
      const {byId, omitted} = await gatherPhotos(["a0", "a1", "a2", "a3"], {...f, cap: 2, chunkSize: 1});
      assert.deepEqual([...byId.keys()], ["a0"]);
      assert.equal(omitted, 6);
      assert.deepEqual(f.calls.fetch, [["a0"]]);
      assert.equal(f.calls.count.length, 3);
    });
    it("has a cap of 60 and no photos for no entries", async () => {
      assert.equal(JOB_SHEET_MAX_PHOTOS, 60);
      const f = fakes([]);
      assert.deepEqual(await gatherPhotos([], f), {byId: new Map(), omitted: 0});
      assert.equal(f.calls.fetch.length, 0);
    });
    it("adds the photos to the entries without changing the sheet", () => {
      const s = sheet({type: "PROJECT"}, rowsWithIds(2));
      const byId = new Map([["a1", [photo("a1", "p1")]]]);
      const out = withPhotos(s, byId, 4);
      const entries = out.sections.flatMap((x) => x.entries);
      assert.deepEqual(entries.map((e) => e.photos), [[], ["data-p1"]]);
      assert.equal(out.photosOmitted, 4);
      assert.equal(s.sections[0].entries[0].photos, undefined);
      assert.equal(withPhotos(s, new Map(), undefined).photosOmitted, 0);
    });
  });

  describe("client hourly rate", () => {
    const labour = (c, hourlyRate, request = {type: "PROJECT"}) => buildJobSheet({request, rows: [row({trackedSeconds: 3600})], project, client: c, timeZone: NZ, now, hourlyRate}).totals;
    it("bills at the client's rate instead of the global one", () => {
      assert.equal(labour({name: "Jo", hourlyRate: 100}, 85).money.labour, "$100.00");
    });
    it("falls back to the global rate when the client has none", () => {
      assert.equal(labour({name: "Jo"}, 85).money.labour, "$85.00");
      assert.equal(labour(null, 85).money.labour, "$85.00");
    });
    it("bills a client with a rate even when there is no global rate", () => {
      const s = buildJobSheet({request: {type: "PROJECT"}, rows: [row({trackedSeconds: 3600})], project, client: {name: "Jo", hourlyRate: 100}, timeZone: NZ, now});
      assert.equal(s.invoice, true);
      assert.equal(s.rateText, "$100.00");
      assert.equal(s.totals.money.total, "$100.00");
    });
    it("shows the rate used in the header and on task and week sheets", () => {
      const c = {name: "Jo", hourlyRate: 100};
      for (const request of [{type: "PROJECT"}, {type: "WEEK", weekStart: "2026-10-19"}, {type: "TASK"}]) {
        const s = buildJobSheet({request, rows: [row({trackedSeconds: 3600})], project, client: c, timeZone: NZ, now, hourlyRate: 85});
        assert.equal(s.rateText, "$100.00", request.type);
        assert.equal(s.sections[0].entries[0].money.labour, "$100.00", request.type);
      }
    });
    it("leaves a sheet with no rate anywhere without money", () => {
      assert.equal(buildJobSheet({request: {type: "PROJECT"}, rows: [row()], project, client: {name: "Jo"}, timeZone: NZ, now}).invoice, false);
    });
  });

  describe("client details", () => {
    const client = {id: "c1", name: "Jo Smith", address: "1 Beach Rd\nWhangaparāoa", phone: "021 000 000", email: "jo@example.co.nz"};
    const withClient = (request, c) => buildJobSheet({request, rows: [row()], project, client: c, timeZone: NZ, now});
    it("carries the client's lines on project, week and task sheets", () => {
      for (const request of [{type: "PROJECT"}, {type: "WEEK", weekStart: "2026-10-19"}, {type: "TASK"}]) {
        assert.deepEqual(withClient(request, client).clientLines, ["Jo Smith", "1 Beach Rd", "Whangaparāoa", "021 000 000", "jo@example.co.nz"]);
      }
    });
    it("cleans the lines for the PDF font", () => {
      assert.deepEqual(withClient({type: "PROJECT"}, {name: "Jo 🌿 Smith"}).clientLines, ["Jo Smith"]);
    });
    it("has no lines without a client", () => {
      assert.deepEqual(withClient({type: "PROJECT"}, null).clientLines, []);
      assert.deepEqual(buildJobSheet({request: {type: "PROJECT"}, rows: [row()], project, timeZone: NZ, now}).clientLines, []);
    });
  });
});

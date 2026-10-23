/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildSchedulePrompt, buildTaskPrompt} = require("../prompts");
const {mergeSettings} = require("../settings");

// 21 Oct 2026 20:00 UTC: 09:00 on the 22nd in Auckland (NZDT, +13:00), 13:00 on the 21st in Los Angeles (PDT, -07:00).
const NOW = new Date("2026-10-21T20:00:00Z");
const BUSY = [{start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"}];
const TASKS = [
  {id: "later", title: "Task without a date", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], order: 1},
  {id: "late", title: "Task that is overdue", priority: "HIGH", dueDate: "2026-10-20", estimatedMinutes: 30, tags: [], order: 2},
];

const AUCKLAND = mergeSettings(undefined);
const LA = mergeSettings({location: {name: "Los Angeles, CA", latitude: 34.05, longitude: -118.24}, timeZone: "America/Los_Angeles"});

const build = (settings, extra = {}) => buildSchedulePrompt({tasks: TASKS, busySlots: BUSY, now: NOW, weather: "Slight rain, 14.2°C", settings, ...extra});

describe("prompts.js", () => {
  describe("buildSchedulePrompt", () => {
    it("limits the rain rule to the first three local days", () => {
      const auckland = build(AUCKLAND); // 22 October local
      assert.match(auckland, /only known for the first 3 days, 2026-10-22 to 2026-10-24/);
      assert.match(auckland, /Never schedule them from 2026-10-25 onwards: leave them out/);
      const la = build(LA); // 21 October local
      assert.match(la, /2026-10-21 to 2026-10-23/);
      assert.match(la, /from 2026-10-24 onwards/);
    });
    describe("daily forecast", () => {
      const fc = (date, rainy, extra = {}) => ({date, conditions: rainy ? "Slight rain" : "Clear sky", minTemp: 10, maxTemp: 17, precipitationMm: rainy ? 4 : 0, rainChance: rainy ? 80 : 5, rainy, ...extra});
      const FORECAST = [fc("2026-10-22", false), fc("2026-10-23", true), fc("2026-10-24", false)];
      it("lists each day with its own rain outlook", () => {
        const prompt = build(AUCKLAND, {forecast: FORECAST});
        assert.match(prompt, /Daily weather forecast, only for 2026-10-22 to 2026-10-24/);
        assert.match(prompt, /"date": "2026-10-23",[^}]*"rainy": true/s);
        assert.match(prompt, /"date": "2026-10-22",[^}]*"rainy": false/s);
      });
      it("bases the rain rule on the forecast's rainy flag and ignores weather on unlisted days", () => {
        const prompt = build(AUCKLAND, {forecast: FORECAST});
        assert.match(prompt, /never on a day the daily forecast above marks "rainy": true/);
        assert.match(prompt, /Tasks tagged Outdoor or Garden depend on the weather, which is only known for 2026-10-22 to 2026-10-24/);
        assert.match(prompt, /Never schedule them from 2026-10-25 onwards: leave them out of the schedule\. Other tasks ignore the weather/);
        assert.doesNotMatch(prompt, /The weather above is the current conditions/);
      });
      it("keeps only forecast days inside the first three local days", () => {
        const prompt = build(AUCKLAND, {forecast: [fc("2026-10-21", true), ...FORECAST, fc("2026-10-25", true)]});
        assert.doesNotMatch(prompt, /"date": "2026-10-21"/);
        assert.doesNotMatch(prompt, /"date": "2026-10-25"/);
      });
      it("falls back to the current-weather rule when there is no usable forecast", () => {
        for (const forecast of [undefined, [], [fc("2026-11-30", true)]]) {
          const prompt = build(AUCKLAND, {forecast});
          assert.doesNotMatch(prompt, /Daily weather forecast/);
          assert.match(prompt, /not at all if the current conditions above are rainy/);
          assert.match(prompt, /Never schedule them from 2026-10-25 onwards/);
        }
      });
      it("still shows the current weather line", () => {
        assert.match(build(AUCKLAND, {forecast: FORECAST}), /Whangaparāoa, Auckland Weather: Slight rain, 14\.2°C/);
      });
    });
    it("rolls the weather window over a month end", () => {
      const prompt = buildSchedulePrompt({tasks: TASKS, busySlots: [], now: new Date("2026-10-30T20:00:00Z"), weather: "Clear", settings: AUCKLAND});
      assert.match(prompt, /2026-10-31 to 2026-11-02/);
      assert.match(prompt, /from 2026-11-03 onwards/);
    });
    it("states the configured number of days", () => {
      assert.match(build(AUCKLAND), /across the next 7 days/);
      assert.match(build({...AUCKLAND, scheduleDays: 28}), /across the next 28 days/);
    });
    it("adds the previous answer's problems only on a retry", () => {
      assert.doesNotMatch(build(AUCKLAND), /previous answer had problems/);
      const prompt = build(AUCKLAND, {feedback: ["task x: outside 8:00-19:00 local time"]});
      assert.match(prompt, /previous answer had problems/);
      assert.match(prompt, /- task x: outside 8:00-19:00 local time/);
    });
    it("names the configured place, zone, local time, offset and date", () => {
      const prompt = build(LA);
      assert.match(prompt, /AI calendar scheduler in Los Angeles, CA\./);
      assert.match(prompt, /America\/Los_Angeles, UTC offset -07:00/);
      assert.match(prompt, /21 October 2026/);
      assert.match(prompt, /Today \(America\/Los_Angeles\): 2026-10-21/);
      assert.match(prompt, /Los Angeles, CA Weather: Slight rain, 14\.2°C/);
      assert.match(prompt, /currently -07:00/);
    });
    it("follows the settings: the same instant reads differently in Auckland", () => {
      const prompt = build(AUCKLAND);
      assert.match(prompt, /Pacific\/Auckland, UTC offset \+13:00/);
      assert.match(prompt, /Today \(Pacific\/Auckland\): 2026-10-22/);
      assert.match(prompt, /Whangaparāoa, Auckland Weather: /);
    });
    it("mentions no other place or zone than the configured one", () => {
      const prompt = build(LA);
      for (const stale of [/Whangapar/, /New Zealand/, /\bNZ\b/, /Auckland/]) assert.doesNotMatch(prompt, stale);
      assert.doesNotMatch(build(AUCKLAND), /Los Angeles/);
    });
    it("bases overdue annotations on the local date in the zone", () => {
      // The task due 2026-10-21 is due today in Los Angeles but overdue by a day in Auckland (already the 22nd there)
      const due = [{id: "t", title: "Due on the 21st", priority: "HIGH", dueDate: "2026-10-21", estimatedMinutes: 10, tags: [], order: 1}];
      assert.match(build(LA, {tasks: due}), /"overdue": false,\s+"daysUntilDue": 0/);
      assert.match(build(AUCKLAND, {tasks: due}), /"overdue": true,\s+"daysUntilDue": -1/);
    });
    it("lists the busy windows and the tasks, most urgent first", () => {
      const prompt = build(AUCKLAND);
      assert.ok(prompt.includes("2026-10-22T10:00:00+13:00"));
      assert.ok(prompt.indexOf("Task that is overdue") < prompt.indexOf("Task without a date"));
    });
    it("states the daily window in the configured zone (9:00 AM to 5:00 PM by default)", () => {
      assert.match(build(LA), /between 9:00 AM and 5:00 PM local time in America\/Los_Angeles/);
      assert.match(build(LA), /within one day's 9:00 AM-5:00 PM window/);
      assert.match(build(LA), /in local time in America\/Los_Angeles using the UTC offset/);
    });
    it("states the window set in the settings", () => {
      const prompt = build(mergeSettings({day: {start: "07:30", end: "20:00"}}));
      assert.match(prompt, /between 7:30 AM and 8:00 PM local time/);
      assert.match(build(mergeSettings({day: {start: "00:00", end: "12:00"}})), /between 12:00 AM and 12:00 PM local time/);
    });
    it("falls back to 9:00 AM-5:00 PM for settings without a window", () => {
      assert.match(build({...AUCKLAND, day: undefined}), /between 9:00 AM and 5:00 PM local time/);
    });
    it("keeps a typed place name on one line", () => {
      const settings = mergeSettings({location: {name: "Perth,\n  WA"}});
      const prompt = build(settings);
      assert.match(prompt, /scheduler in Perth, WA\./);
    });
    it("does not modify the tasks it is given", () => {
      const copy = structuredClone(TASKS);
      build(AUCKLAND);
      assert.deepEqual(TASKS, copy);
    });
    describe("project order", () => {
      const PROJECTS = [{id: "p1", name: "Kitchen\n reno"}];
      const members = [
        {id: "m1", title: "Demolition", priority: "HIGH", dueDate: "", estimatedMinutes: 60, tags: [], order: 1, projectId: "p1", projectOrder: 1},
        {id: "m2", title: "Tiling", priority: "LOW", dueDate: "2026-10-20", estimatedMinutes: 60, tags: [], order: 2, projectId: "p1", projectOrder: 2},
        {id: "m3", title: "No project", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: [], order: 3},
      ];

      it("states the order rule and that it overrides due dates", () => {
        assert.match(build(AUCKLAND), /Project order, which overrides due dates and priority/);
        assert.match(build(AUCKLAND), /lower projectOrder must end before any task of that project with a higher projectOrder starts/);
      });
      it("adds the project name to member tasks only, keeping projectId and projectOrder", () => {
        const prompt = build(AUCKLAND, {tasks: members, projects: PROJECTS});
        assert.equal((prompt.match(/"project": "Kitchen reno"/g) || []).length, 2);
        assert.match(prompt, /"projectOrder": 2/);
        assert.match(prompt, /"projectId": "p1"/);
      });
      it("leaves out a project name for an unknown project", () => {
        assert.doesNotMatch(build(AUCKLAND, {tasks: members, projects: []}), /"project":/);
      });
      it("lists the members placed outside the run with project, order number and window", () => {
        const fixed = [{taskId: "f1", start: "2026-10-22T14:00:00+13:00", end: "2026-10-22T15:00:00+13:00"}, {taskId: "f2", start: "2026-10-22T16:00:00+13:00", end: "2026-10-22T17:00:00+13:00"}];
        const allTasks = [...members, {id: "f1", projectId: "p1", projectOrder: 3}, {id: "f2"}];
        const prompt = build(AUCKLAND, {tasks: members, projects: PROJECTS, fixed, allTasks});
        assert.match(prompt, /"project": "Kitchen reno",\s+"projectOrder": 3,\s+"start": "2026-10-22T14:00:00\+13:00"/);
        assert.ok(!prompt.includes("2026-10-22T16:00:00+13:00"));
      });
      it("renders an empty list of placed members when there are none", () => {
        assert.match(build(AUCKLAND), /already placed outside this run[^\n]*\n\s*\[\]/);
      });
    });
  });
  describe("buildTaskPrompt", () => {
    const tasks = [
      {id: "t1", title: "Demolition", priority: "HIGH", dueDate: "", estimatedMinutes: 60, tags: [], order: 1, projectId: "p1", projectOrder: 1, status: "PENDING", googleCalendarEventId: "ev9", scheduledStart: "2026-10-22T10:00:00+13:00", locked: true},
      {id: "t2", title: "Mow lawn", priority: "LOW", dueDate: "", estimatedMinutes: 45, tags: ["Outdoor"], order: 2, status: "PENDING"},
    ];
    const projects = [{id: "p1", name: "Kitchen\n  reno"}, {id: "p2", name: "Garden"}];
    const prompt = (extra = {}) => buildTaskPrompt({tasks, projects, input: "tile the splashback, step 2 of Kitchen reno", today: "2026-10-22", ...extra});

    it("names today's date and quotes the input", () => {
      assert.match(prompt(), /Today's date is: 2026-10-22\./);
      assert.match(prompt(), /New Input: "tile the splashback, step 2 of Kitchen reno"/);
    });
    it("lists the projects with their ids, one line each", () => {
      const p = prompt();
      assert.match(p, /Existing Projects[^\n]*\n\s*\[\s*\{\s*"id": "p1",\s*"name": "Kitchen reno"\s*\},\s*\{\s*"id": "p2",\s*"name": "Garden"/);
    });
    it("shows each task's project and order number, and only the fields the model may change", () => {
      const p = prompt();
      assert.match(p, /"projectId": "p1",\s+"projectOrder": 1/);
      for (const hidden of ["googleCalendarEventId", "scheduledStart", "locked", "ev9", "PENDING"]) assert.ok(!p.includes(hidden), hidden);
    });
    it("tells the model to use listed ids only, and that it cannot create, rename, delete or remove", () => {
      const p = prompt();
      assert.match(p, /set projectId to that project's id, copied exactly from the list/);
      assert.match(p, /Never invent a project or an id/);
      assert.match(p, /set projectOrder to a whole number from 1/);
      assert.match(p, /cannot create, rename or delete projects, or take a task out of one/);
    });
    it("copes with no projects", () => {
      assert.match(prompt({projects: []}), /Existing Projects[^\n]*\n\s*\[\]/);
    });
    it("keeps the earlier instructions: ranks, ids for changes and recurrence", () => {
      const p = prompt();
      assert.match(p, /Return ONLY the tasks that are new or that the input changes\./);
      assert.match(p, /Set order to the rank \(from 1\)/);
      assert.match(p, /return frequency NONE/);
    });
    it("does not modify the tasks or projects it is given", () => {
      const t = structuredClone(tasks);
      const pr = structuredClone(projects);
      prompt();
      assert.deepEqual(tasks, t);
      assert.deepEqual(projects, pr);
    });
  });
});

describe("prompts.js: gap between tasks", () => {
  it("asks for the gap when one is set", () => {
    const prompt = build(mergeSettings({gapMinutes: 15}));
    assert.match(prompt, /Leave at least 15 minutes free between any two scheduled task slots/);
    assert.match(prompt, /The same gap applies before and after every busy window/);
  });
  it("says nothing about a gap by default", () => {
    assert.doesNotMatch(build(AUCKLAND), /minutes free between/);
    assert.doesNotMatch(build({...AUCKLAND, gapMinutes: undefined}), /minutes free between/);
  });
});

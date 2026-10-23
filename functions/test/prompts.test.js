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
    it("states the 8:00-19:00 window in the configured zone", () => {
      assert.match(build(LA), /between 8:00 AM and 7:00 PM local time in America\/Los_Angeles/);
      assert.match(build(LA), /in local time in America\/Los_Angeles using the UTC offset/);
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

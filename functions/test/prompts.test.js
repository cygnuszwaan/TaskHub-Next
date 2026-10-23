/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildSchedulePrompt} = require("../prompts");
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
  });
});

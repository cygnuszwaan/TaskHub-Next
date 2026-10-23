/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {normalizeSnooze, snoozeDate, isSnoozed} = require("../snooze");
const {planSchedule} = require("../planner");
const {validateSchedule, repairSchedule} = require("../schedule");
const {applyDirectUpdate, mergeTaskChanges, completeInList} = require("../tasks");
const {computeFingerprint} = require("../fingerprint");
const {buildSchedulePrompt} = require("../prompts");
const {mergeSettings} = require("../settings");

const NZ = "Pacific/Auckland";
// "now" is 07:00 NZDT on Thursday 22 Oct 2026; the horizon is seven days later. A wide 8:00-19:00 day.
const WIDE = {dayStartMin: 480, dayEndMin: 1140};
const NOW = new Date("2026-10-21T18:00:00Z");
const HORIZON = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const task = (id, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 30, tags: ["Indoor"], status: "PENDING", order: 1, ...extra});

function plan(tasks, extra = {}) {
  const args = {tasks, busy: [], now: NOW, horizon: HORIZON, timeZone: NZ, ...WIDE, ...extra};
  const result = planSchedule(args);
  const checked = validateSchedule({items: result.items, tasks, busy: args.busy, now: NOW, horizon: HORIZON, timeZone: NZ, ...WIDE, weather: args.weather, allTasks: args.allTasks || tasks});
  assert.deepEqual(checked.errors, [], "the planner's own output must pass validation");
  return result;
}
const startOf = (result, id) => (result.items.find((i) => i.taskId === id) || {}).startISO;

describe("snooze", () => {
  describe("normalizeSnooze", () => {
    it("accepts a real calendar date", () => {
      assert.equal(normalizeSnooze("2026-10-24"), "2026-10-24");
      assert.equal(normalizeSnooze("2028-02-29"), "2028-02-29");
    });
    it("clears on null or an empty string", () => {
      assert.equal(normalizeSnooze(null), null);
      assert.equal(normalizeSnooze(""), null);
    });
    it("calls everything else unusable", () => {
      for (const v of ["2026-02-30", "2027-02-29", "24/10/2026", "2026-10-24T09:00:00Z", " 2026-10-24", 20261024, true, {}, [], undefined]) {
        assert.equal(normalizeSnooze(v), undefined, JSON.stringify(v));
      }
    });
  });

  describe("snoozeDate and isSnoozed", () => {
    it("reads the date of a snoozed task and nothing else", () => {
      assert.equal(snoozeDate({snoozedUntil: "2026-10-24"}), "2026-10-24");
      for (const t of [{}, {snoozedUntil: ""}, {snoozedUntil: "soon"}, {snoozedUntil: 5}, null, undefined]) assert.equal(snoozeDate(t), null);
    });
    it("is snoozed only while the date is after today", () => {
      assert.equal(isSnoozed({snoozedUntil: "2026-10-23"}, "2026-10-22"), true);
      assert.equal(isSnoozed({snoozedUntil: "2026-10-22"}, "2026-10-22"), false);
      assert.equal(isSnoozed({snoozedUntil: "2026-10-21"}, "2026-10-22"), false);
      assert.equal(isSnoozed({}, "2026-10-22"), false);
    });
  });

  describe("direct edits", () => {
    it("sets, replaces and clears snoozedUntil", () => {
      const set = applyDirectUpdate(task("a"), {snoozedUntil: "2026-10-24"});
      assert.equal(set.snoozedUntil, "2026-10-24");
      assert.equal(applyDirectUpdate(set, {snoozedUntil: "2026-10-26"}).snoozedUntil, "2026-10-26");
      assert.equal("snoozedUntil" in applyDirectUpdate(set, {snoozedUntil: null}), false);
      assert.equal("snoozedUntil" in applyDirectUpdate(set, {snoozedUntil: ""}), false);
    });
    it("ignores an unusable value and leaves the field alone when it is not sent", () => {
      const set = task("a", {snoozedUntil: "2026-10-24"});
      assert.equal(applyDirectUpdate(set, {snoozedUntil: "2026-02-30"}).snoozedUntil, "2026-10-24");
      assert.equal(applyDirectUpdate(set, {snoozedUntil: 7}).snoozedUntil, "2026-10-24");
      assert.equal(applyDirectUpdate(set, {title: "Renamed"}).snoozedUntil, "2026-10-24");
      assert.equal("snoozedUntil" in applyDirectUpdate(task("a"), {snoozedUntil: "nonsense"}), false);
    });
    it("keeps the due date when snoozing", () => {
      assert.equal(applyDirectUpdate(task("a", {dueDate: "2026-10-23"}), {snoozedUntil: "2026-10-25"}).dueDate, "2026-10-23");
    });
  });

  it("is never set or changed by the model's changes", () => {
    const merged = mergeTaskChanges([task("t1", {snoozedUntil: "2026-10-24"})], [{id: "t1", title: "New title", snoozedUntil: "2026-12-01"}, {title: "Brand new", snoozedUntil: "2026-12-01"}], () => "new1");
    assert.equal(merged.tasks.find((t) => t.id === "t1").snoozedUntil, "2026-10-24");
    assert.equal("snoozedUntil" in merged.tasks.find((t) => t.title === "Brand new"), false);
  });

  it("is not carried to the next occurrence of a repeating task", () => {
    const repeating = task("t1", {snoozedUntil: "2026-10-24", recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-22"});
    const {spawned} = completeInList([repeating], "t1", "2026-10-22", () => "new1");
    assert.ok(spawned);
    assert.equal("snoozedUntil" in spawned, false);
  });

  describe("planner", () => {
    it("places a snoozed task on its snooze date and others on earlier days", () => {
      const result = plan([task("snoozed", {snoozedUntil: "2026-10-24"}), task("other", {order: 2})]);
      assert.equal(startOf(result, "snoozed"), "2026-10-24T08:00:00+13:00");
      assert.equal(startOf(result, "other"), "2026-10-22T08:00:00+13:00");
    });
    it("is not held back by a snooze date that has passed or is today", () => {
      assert.equal(startOf(plan([task("a", {snoozedUntil: "2026-10-22"})]), "a"), "2026-10-22T08:00:00+13:00");
      assert.equal(startOf(plan([task("a", {snoozedUntil: "2026-10-01"})]), "a"), "2026-10-22T08:00:00+13:00");
    });
    it("keeps the snooze when the first day it could use is full", () => {
      const busy = [{start: "2026-10-24T00:00:00+13:00", end: "2026-10-24T19:00:00+13:00"}];
      assert.equal(startOf(plan([task("a", {snoozedUntil: "2026-10-24"})], {busy}), "a"), "2026-10-25T08:00:00+13:00");
    });
    it("places an all-day task on its snooze date or later", () => {
      assert.equal(startOf(plan([task("big", {estimatedMinutes: 900, snoozedUntil: "2026-10-25"})]), "big"), "2026-10-25");
    });
    it("leaves a task whose snooze date is beyond the horizon unplaced, and says why", () => {
      const result = plan([task("a", {snoozedUntil: "2026-11-05"}), task("b", {order: 2})]);
      assert.deepEqual(result.items.map((i) => i.taskId), ["b"]);
      assert.match(result.unplaced[0].reason, /snoozed until 2026-11-05/);
    });
    it("combines with the weather rule", () => {
      const weather = {lastDate: "2026-10-24", rainyDates: ["2026-10-23"]};
      assert.equal(startOf(plan([task("a", {tags: ["Outdoor"], snoozedUntil: "2026-10-23"})], {weather}), "a"), "2026-10-24T08:00:00+13:00");
      const none = plan([task("a", {tags: ["Outdoor"], snoozedUntil: "2026-10-25"})], {weather});
      assert.deepEqual(none.items, []);
    });
    it("puts a later project step after a snoozed earlier one", () => {
      const tasks = [task("one", {projectId: "p", projectOrder: 1, snoozedUntil: "2026-10-24"}), task("two", {projectId: "p", projectOrder: 2, order: 2})];
      const result = plan(tasks);
      assert.equal(startOf(result, "one"), "2026-10-24T08:00:00+13:00");
      assert.equal(startOf(result, "two"), "2026-10-24T08:30:00+13:00");
    });
    it("does not move a task that was never snoozed", () => {
      assert.equal(startOf(plan([task("a")]), "a"), "2026-10-22T08:00:00+13:00");
    });
  });

  describe("slot validation", () => {
    const tasks = [task("a", {snoozedUntil: "2026-10-24"}), task("b", {order: 2})];
    const check = (items, fn = validateSchedule) => fn({items, tasks, busy: [], now: NOW, horizon: HORIZON, timeZone: NZ, ...WIDE});
    const slot = (taskId, startISO, endISO, extra) => ({taskId, startISO, endISO, transparency: "opaque", isAllDay: false, ...extra});

    it("rejects a timed slot before the snooze date and accepts one on or after it", () => {
      assert.match(check([slot("a", "2026-10-23T09:00:00+13:00", "2026-10-23T09:30:00+13:00")]).errors[0], /snoozed until 2026-10-24, but placed on 2026-10-23/);
      assert.deepEqual(check([slot("a", "2026-10-24T09:00:00+13:00", "2026-10-24T09:30:00+13:00")]).errors, []);
      assert.deepEqual(check([slot("a", "2026-10-27T09:00:00+13:00", "2026-10-27T09:30:00+13:00")]).errors, []);
    });
    it("applies the same rule to an all-day slot", () => {
      assert.match(check([slot("a", "2026-10-23", "2026-10-24", {isAllDay: true, transparency: "transparent"})]).errors[0], /snoozed until 2026-10-24/);
      assert.deepEqual(check([slot("a", "2026-10-24", "2026-10-25", {isAllDay: true, transparency: "transparent"})]).errors, []);
    });
    it("does not restrict other tasks, and repair drops only the early slot", () => {
      const repaired = check([slot("a", "2026-10-23T09:00:00+13:00", "2026-10-23T09:30:00+13:00"), slot("b", "2026-10-23T10:00:00+13:00", "2026-10-23T10:30:00+13:00")], repairSchedule);
      assert.deepEqual(repaired.slots.map((s) => s.taskId), ["b"]);
      assert.deepEqual(repaired.dropped.map((d) => d.taskId), ["a"]);
    });
    it("ignores a snooze date that has passed", () => {
      const old = [task("a", {snoozedUntil: "2026-10-01"})];
      const out = validateSchedule({items: [slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00")], tasks: old, busy: [], now: NOW, horizon: HORIZON, timeZone: NZ, ...WIDE});
      assert.deepEqual(out.errors, []);
    });
  });

  describe("fingerprint", () => {
    const settings = mergeSettings(undefined);
    const fp = (t) => computeFingerprint({tasks: [t], busySlots: [], weatherKey: "DRY", settings, now: new Date("2026-10-22T09:00:00+13:00"), horizon: new Date("2026-10-29T09:00:00+13:00")});
    it("changes when a task is snoozed, moved or unsnoozed", () => {
      const base = fp(task("a"));
      const snoozed = fp(task("a", {snoozedUntil: "2026-10-24"}));
      assert.notEqual(snoozed, base);
      assert.notEqual(fp(task("a", {snoozedUntil: "2026-10-25"})), snoozed);
    });
    it("ignores an unusable snooze value", () => {
      assert.equal(fp(task("a", {snoozedUntil: "soon"})), fp(task("a")));
    });
  });

  describe("scheduling prompt", () => {
    const settings = mergeSettings(undefined);
    const build = (tasks) => buildSchedulePrompt({tasks, busySlots: [], now: new Date("2026-10-21T20:00:00Z"), weather: "Clear", settings});
    it("shows the snooze date of a snoozed task and states the rule", () => {
      const prompt = build([task("a", {snoozedUntil: "2026-10-24"})]);
      assert.match(prompt, /"snoozedUntil": "2026-10-24"/);
      assert.match(prompt, /must not be scheduled on any local date before it/);
    });
    it("leaves out a snooze date that has passed and tasks that were never snoozed", () => {
      assert.doesNotMatch(build([task("a", {snoozedUntil: "2026-10-22"})]), /"snoozedUntil": "/);
      assert.doesNotMatch(build([task("a")]), /"snoozedUntil": "/);
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {FINGERPRINT_VERSION, normalizeBusy, hasEndedSlot, computeFingerprint, shouldSkipRun} = require("../fingerprint");
const {mergeSettings} = require("../settings");

const settings = mergeSettings(undefined);
const now = new Date("2026-10-22T09:00:00+13:00");
const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const task = (id, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 30, tags: ["Indoor"], status: "PENDING", order: 1, ...extra});
const busy = [{start: "2026-10-22T13:00:00+13:00", end: "2026-10-22T14:00:00+13:00"}];
const inputs = (extra = {}) => ({tasks: [task("a"), task("b", {order: 2})], busySlots: busy, weatherKey: "DRY", settings, now, horizon, ...extra});
const fp = (extra) => computeFingerprint(inputs(extra));

describe("fingerprint.js", () => {
  describe("computeFingerprint", () => {
    it("is a stable hex digest for the same inputs", () => {
      assert.match(fp(), /^[0-9a-f]{64}$/);
      assert.equal(fp(), fp());
    });
    it("ignores task order in the list and the order of tags", () => {
      assert.equal(fp(), fp({tasks: [task("b", {order: 2}), task("a")]}));
      assert.equal(fp({tasks: [task("a", {tags: ["X", "Y"]})]}), fp({tasks: [task("a", {tags: ["Y", "X"]})]}));
    });
    it("ignores calendar and schedule fields, which the run itself rewrites", () => {
      const scheduled = task("a", {googleCalendarEventId: "ev1", scheduledStart: "2026-10-22T10:00:00+13:00", scheduledEnd: "2026-10-22T10:30:00+13:00", locked: false, status: "PENDING"});
      assert.equal(fp({tasks: [scheduled, task("b", {order: 2})]}), fp());
    });
    it("changes with any scheduling-relevant task field", () => {
      const base = fp();
      const changes = [{title: "Other"}, {priority: "HIGH"}, {dueDate: "2026-10-25"}, {estimatedMinutes: 45}, {tags: ["Outdoor"]}, {recurrence: {frequency: "WEEKLY", interval: 1}}, {order: 5}, {projectId: "p1"}, {projectId: "p1", projectOrder: 2}];
      for (const change of changes) {
        assert.notEqual(fp({tasks: [task("a", change), task("b", {order: 2})]}), base, JSON.stringify(change));
      }
    });
    it("changes with the project order number and the project, and ignores an absent one", () => {
      const withProject = (extra) => fp({tasks: [task("a", {projectId: "p1", projectOrder: 1, ...extra})]});
      assert.notEqual(withProject(), withProject({projectOrder: 2}));
      assert.notEqual(withProject(), withProject({projectId: "p2"}));
      assert.equal(fp({tasks: [task("a", {projectId: "", projectOrder: undefined})]}), fp({tasks: [task("a")]}));
    });
    it("changes when a task is added or removed", () => {
      assert.notEqual(fp({tasks: [task("a")]}), fp());
      assert.notEqual(fp({tasks: [...inputs().tasks, task("c", {order: 3})]}), fp());
    });
    it("treats a missing and an empty due date alike", () => {
      const noDue = task("a");
      delete noDue.dueDate;
      assert.equal(fp({tasks: [noDue]}), fp({tasks: [task("a", {dueDate: ""})]}));
    });
    it("changes with the number of days scheduled, even when no busy window differs", () => {
      assert.notEqual(fp({settings: {...settings, scheduleDays: 28}}), fp());
      assert.equal(fp({settings: {...settings, scheduleDays: 7}}), fp());
    });
    it("changes with the busy windows", () => {
      assert.notEqual(fp({busySlots: []}), fp());
      assert.notEqual(fp({busySlots: [{start: "2026-10-22T13:00:00+13:00", end: "2026-10-22T14:30:00+13:00"}]}), fp());
    });
    it("changes with the local date, the weather, the time zone and the location", () => {
      const base = fp();
      assert.notEqual(fp({now: new Date("2026-10-23T09:00:00+13:00"), horizon: new Date("2026-10-30T09:00:00+13:00")}), base);
      assert.notEqual(fp({weatherKey: "WET"}), base);
      assert.notEqual(fp({settings: {...settings, timeZone: "Australia/Sydney"}}), base);
      assert.notEqual(fp({settings: {...settings, location: {...settings.location, latitude: -36.9}}}), base);
    });
    it("is the same later on the same local day when nothing else moved", () => {
      assert.equal(fp({now: new Date("2026-10-22T11:30:00+13:00"), horizon: new Date("2026-10-29T11:30:00+13:00")}), fp());
    });
    it("is not affected by the settings' schedule or run state", () => {
      assert.equal(fp({settings: {...settings, schedule: {...settings.schedule, time: "06:00"}, lastAutoRunAt: "2026-10-22T07:00:00.000Z", lastRunFingerprint: "x"}}), fp());
    });
    it("changes with the scheduler that places the tasks", () => {
      const base = fp({scheduler: "deterministic"});
      assert.notEqual(fp({scheduler: "gemini"}), base);
      assert.equal(fp({scheduler: "deterministic"}), base);
      assert.notEqual(fp(), base);
    });
    it("exposes a version in the hash", () => {
      assert.equal(typeof FINGERPRINT_VERSION, "number");
    });
  });

  describe("normalizeBusy", () => {
    it("marks a window clipped to now as starting 'now' whatever the clipped instant is", () => {
      const a = normalizeBusy([{start: now.toISOString(), end: "2026-10-22T10:00:00+13:00"}], now, horizon);
      const later = new Date(now.getTime() + 15 * 60 * 1000);
      const b = normalizeBusy([{start: later.toISOString(), end: "2026-10-22T10:00:00+13:00"}], later, new Date(later.getTime() + 7 * 24 * 3600 * 1000));
      assert.deepEqual(a, b);
      assert.equal(a[0].start, "now");
    });
    it("marks a window running past the horizon as ending at the horizon", () => {
      const out = normalizeBusy([{start: "2026-10-28T20:00:00+13:00", end: horizon.toISOString()}], now, horizon);
      assert.deepEqual(out, [{start: "2026-10-28T20:00:00+13:00", end: "horizon"}]);
    });
    it("treats an event that began earlier as already under way", () => {
      assert.equal(normalizeBusy([{start: "2026-10-22T08:00:00+13:00", end: "2026-10-22T10:00:00+13:00"}], now, horizon)[0].start, "now");
    });
    it("leaves windows inside the range as they are and does not modify the input", () => {
      const input = structuredClone(busy);
      assert.deepEqual(normalizeBusy(input, now, horizon), busy);
      assert.deepEqual(input, busy);
    });
  });

  describe("hasEndedSlot", () => {
    const tz = "Pacific/Auckland";
    it("is true when a timed slot has finished", () => {
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22T08:30:00+13:00"})], tz, now), true);
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22T09:00:00+13:00"})], tz, now), true);
    });
    it("is false for a slot still to come or under way", () => {
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22T09:30:00+13:00"})], tz, now), false);
    });
    it("handles all-day slots with an exclusive end date", () => {
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22"})], tz, now), true);
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-23"})], tz, now), false);
    });
    it("uses the local date for all-day slots", () => {
      const lateUtc = new Date("2026-10-21T12:00:00Z"); // 01:00 on 22 Oct in Auckland
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22"})], tz, lateUtc), true);
      assert.equal(hasEndedSlot([task("a", {scheduledEnd: "2026-10-22"})], "Pacific/Pago_Pago", lateUtc), false);
    });
    it("ignores tasks without a usable schedule", () => {
      assert.equal(hasEndedSlot([task("a"), task("b", {scheduledEnd: ""}), task("c", {scheduledEnd: "junk"}), task("d", {scheduledEnd: null})], tz, now), false);
      assert.equal(hasEndedSlot([], tz, now), false);
    });
  });

  describe("shouldSkipRun", () => {
    const base = {skipIfUnchanged: true, fingerprint: "abc", lastRunFingerprint: "abc", endedSlot: false};
    it("skips when allowed and the fingerprint matches", () => {
      assert.equal(shouldSkipRun(base), true);
    });
    it("never skips a run that did not ask for it (manual runs)", () => {
      assert.equal(shouldSkipRun({...base, skipIfUnchanged: false}), false);
      assert.equal(shouldSkipRun({...base, skipIfUnchanged: undefined}), false);
    });
    it("does not skip when the fingerprint differs or none is stored", () => {
      assert.equal(shouldSkipRun({...base, lastRunFingerprint: "xyz"}), false);
      assert.equal(shouldSkipRun({...base, lastRunFingerprint: null}), false);
      assert.equal(shouldSkipRun({...base, lastRunFingerprint: undefined}), false);
    });
    it("does not skip while a scheduled slot has ended without its task being completed", () => {
      assert.equal(shouldSkipRun({...base, endedSlot: true}), false);
    });
  });
});

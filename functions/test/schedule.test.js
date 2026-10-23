/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {validateSchedule, matchLockedEvents, DAY_START_MIN, DAY_END_MIN} = require("../schedule");

// "now" is 07:00 NZDT on Thursday 22 Oct 2026; the horizon is seven days later.
const NOW = new Date("2026-10-21T18:00:00Z");
const HORIZON = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
const TASKS = [{id: "a"}, {id: "b"}, {id: "c"}];

function slot(taskId, startISO, endISO, extra) {
  return {taskId, startISO, endISO, transparency: "opaque", isAllDay: false, ...extra};
}

function run(items, busy = [], zone = "Pacific/Auckland") {
  return validateSchedule({items, tasks: TASKS, busy, now: NOW, horizon: HORIZON, timeZone: zone});
}

describe("schedule.js", () => {
  it("schedules within 8:00-19:00", () => {
    assert.equal(DAY_START_MIN, 480);
    assert.equal(DAY_END_MIN, 1140);
  });

  describe("validateSchedule: timed slots", () => {
    it("accepts a valid slot", () => {
      const item = slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T09:45:00+13:00");
      const {slots, errors} = run([item]);
      assert.deepEqual(errors, []);
      assert.equal(slots.length, 1);
      assert.equal(slots[0].taskId, "a");
      assert.equal(slots[0].allDay, false);
      assert.equal(slots[0].endMs - slots[0].startMs, 45 * 60 * 1000);
      assert.equal(slots[0].item, item);
    });
    it("accepts an empty list", () => {
      assert.deepEqual(run([]), {slots: [], errors: []});
    });
    it("accepts slots exactly at 8:00 and 19:00", () => {
      assert.deepEqual(run([slot("a", "2026-10-22T08:00:00+13:00", "2026-10-22T19:00:00+13:00")]).errors, []);
    });
    it("accepts UTC (Z) times that fall inside the window", () => {
      assert.deepEqual(run([slot("a", "2026-10-21T20:00:00Z", "2026-10-21T21:00:00Z")]).errors, []); // 09:00-10:00 NZDT
    });
    it("rejects an item that is not an object", () => {
      assert.equal(run([null]).errors.length, 1);
      assert.match(run(["x"]).errors[0], /not an object/);
    });
    it("rejects an unknown task id", () => {
      assert.match(run([slot("zzz", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")]).errors[0], /unknown task id/);
    });
    it("rejects scheduling a task twice", () => {
      const errors = run([
        slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
        slot("a", "2026-10-22T11:00:00+13:00", "2026-10-22T12:00:00+13:00"),
      ]).errors;
      assert.equal(errors.length, 1);
      assert.match(errors[0], /more than once/);
    });
    it("rejects times without a UTC offset or in the wrong format", () => {
      assert.match(run([slot("a", "2026-10-22T09:00:00", "2026-10-22T10:00:00")]).errors[0], /UTC offset/);
      assert.match(run([slot("a", "9am", "10am")]).errors[0], /UTC offset/);
      assert.match(run([slot("a", undefined, undefined)]).errors[0], /UTC offset/);
    });
    it("rejects unparseable times", () => {
      assert.match(run([slot("a", "2026-13-45T09:00:00+13:00", "2026-10-22T10:00:00+13:00")]).errors[0], /unparseable/);
    });
    it("rejects an end that is not after the start", () => {
      assert.match(run([slot("a", "2026-10-22T10:00:00+13:00", "2026-10-22T10:00:00+13:00")]).errors[0], /not after start/);
      assert.match(run([slot("a", "2026-10-22T10:00:00+13:00", "2026-10-22T09:00:00+13:00")]).errors[0], /not after start/);
    });
    it("rejects a start in the past", () => {
      assert.match(run([slot("a", "2026-10-22T06:00:00+13:00", "2026-10-22T09:00:00+13:00")]).errors[0], /past/);
    });
    it("rejects an end after the horizon", () => {
      // Horizon is 07:00 NZDT on 29 Oct
      assert.match(run([slot("a", "2026-10-29T06:30:00+13:00", "2026-10-29T07:30:00+13:00")]).errors[0], /horizon/);
    });
    it("rejects a slot spanning two NZ days", () => {
      assert.match(run([slot("a", "2026-10-22T18:00:00+13:00", "2026-10-23T09:00:00+13:00")]).errors[0], /more than one local day/);
    });
    it("rejects slots outside 8:00-19:00", () => {
      assert.match(run([slot("a", "2026-10-22T07:30:00+13:00", "2026-10-22T09:00:00+13:00")]).errors[0], /outside 8:00-19:00/);
      assert.match(run([slot("a", "2026-10-22T18:00:00+13:00", "2026-10-22T19:30:00+13:00")]).errors[0], /outside 8:00-19:00/);
    });
    it("judges days and the window in the given zone", () => {
      // NOW is 21 Oct 18:00 UTC. 17:00-18:00 UTC on the 22nd is 10:00-11:00 PDT on the 22nd (valid in Los Angeles)
      // but 06:00-07:00 NZDT on the 23rd (outside the window in Auckland).
      const items = [slot("a", "2026-10-22T17:00:00Z", "2026-10-22T18:00:00Z")];
      assert.deepEqual(run(items, [], "America/Los_Angeles").errors, []);
      assert.match(run(items, [], "Pacific/Auckland").errors[0], /outside 8:00-19:00 local time/);
    });
    it("rejects a slot spanning two local days in the given zone", () => {
      // 06:00-08:00 UTC is 23:00 to 01:00 the next day in Los Angeles (PDT)
      const items = [slot("a", "2026-10-23T06:00:00Z", "2026-10-23T08:00:00Z")];
      assert.match(run(items, [], "America/Los_Angeles").errors[0], /more than one local day/);
    });
    it("judges the window in NZ time whatever offset the slot is written in", () => {
      // 19:30 UTC on the 21st is 08:30 NZDT on the 22nd: valid. 07:00 UTC is 20:00 NZDT: outside the window.
      assert.deepEqual(run([slot("a", "2026-10-21T19:30:00Z", "2026-10-21T20:00:00Z")]).errors, []);
      assert.match(run([slot("a", "2026-10-22T07:00:00Z", "2026-10-22T07:30:00Z")]).errors[0], /outside 8:00-19:00/);
    });
    it("rejects overlap with a busy window", () => {
      const busy = [{start: "2026-10-22T09:30:00+13:00", end: "2026-10-22T10:30:00+13:00"}];
      assert.match(run([slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")], busy).errors[0], /busy window/);
      assert.match(run([slot("a", "2026-10-22T09:45:00+13:00", "2026-10-22T10:00:00+13:00")], busy).errors[0], /busy window/);
    });
    it("allows a slot that only touches a busy window", () => {
      const busy = [{start: "2026-10-22T09:30:00+13:00", end: "2026-10-22T10:30:00+13:00"}];
      assert.deepEqual(run([
        slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"),
        slot("b", "2026-10-22T10:30:00+13:00", "2026-10-22T11:00:00+13:00"),
      ], busy).errors, []);
    });
    it("ignores busy windows it cannot parse", () => {
      const busy = [{start: "garbage", end: "garbage"}];
      assert.deepEqual(run([slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")], busy).errors, []);
    });
    it("rejects two slots that overlap each other", () => {
      const errors = run([
        slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
        slot("b", "2026-10-22T09:30:00+13:00", "2026-10-22T10:30:00+13:00"),
      ]).errors;
      assert.equal(errors.length, 1);
      assert.match(errors[0], /overlap each other/);
    });
    it("detects overlap whatever order the slots are listed in", () => {
      const errors = run([
        slot("b", "2026-10-22T09:30:00+13:00", "2026-10-22T10:30:00+13:00"),
        slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      ]).errors;
      assert.equal(errors.length, 1);
    });
    it("allows back-to-back slots and slots on different days", () => {
      assert.deepEqual(run([
        slot("a", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
        slot("b", "2026-10-22T10:00:00+13:00", "2026-10-22T11:00:00+13:00"),
        slot("c", "2026-10-23T09:00:00+13:00", "2026-10-23T10:00:00+13:00"),
      ]).errors, []);
    });
    it("reports every failing slot", () => {
      const errors = run([
        slot("zzz", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
        slot("a", "2026-10-22T06:00:00+13:00", "2026-10-22T09:00:00+13:00"),
      ]).errors;
      assert.equal(errors.length, 2);
    });
  });

  describe("validateSchedule: all-day slots", () => {
    function allDay(taskId, startISO) {
      return {taskId, startISO, endISO: startISO, transparency: "transparent", isAllDay: true};
    }

    it("accepts a date from today to the horizon date and sets an exclusive end date", () => {
      const {slots, errors} = run([allDay("a", "2026-10-22")]);
      assert.deepEqual(errors, []);
      assert.equal(slots[0].allDay, true);
      assert.equal(slots[0].date, "2026-10-22");
      assert.equal(slots[0].endDate, "2026-10-23");
    });
    it("takes the date from a full ISO timestamp", () => {
      assert.equal(run([allDay("a", "2026-10-24T00:00:00+13:00")]).slots[0].date, "2026-10-24");
    });
    it("accepts the first and last allowed dates", () => {
      assert.deepEqual(run([allDay("a", "2026-10-22"), allDay("b", "2026-10-29")]).errors, []);
    });
    it("rejects dates before today or after the horizon date", () => {
      assert.match(run([allDay("a", "2026-10-21")]).errors[0], /outside 2026-10-22\.\.2026-10-29/);
      assert.match(run([allDay("a", "2026-10-30")]).errors[0], /outside/);
    });
    it("rejects malformed and impossible dates", () => {
      assert.match(run([allDay("a", "tomorrow")]).errors[0], /invalid all-day date/);
      assert.match(run([allDay("a", "2026-02-30")]).errors[0], /invalid all-day date/);
      assert.match(run([allDay("a", undefined)]).errors[0], /invalid all-day date/);
    });
    it("skips busy and overlap checks", () => {
      const busy = [{start: "2026-10-22T00:00:00+13:00", end: "2026-10-23T00:00:00+13:00"}];
      assert.deepEqual(run([allDay("a", "2026-10-22"), allDay("b", "2026-10-22")], busy).errors, []);
    });
    it("still rejects an unknown or repeated task", () => {
      assert.match(run([allDay("zzz", "2026-10-22")]).errors[0], /unknown task id/);
      assert.match(run([allDay("a", "2026-10-22"), allDay("a", "2026-10-23")]).errors[0], /more than once/);
    });
    it("does not count all-day slots when checking timed slots for overlap", () => {
      assert.deepEqual(run([
        allDay("a", "2026-10-22"),
        slot("b", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      ]).errors, []);
    });
  });

  describe("matchLockedEvents", () => {
    const ev = (id, extra) => ({id, ...extra});

    it("matches by stored event id first", () => {
      const events = [ev("e1", {summary: "Other"}), ev("e2", {summary: "Write report"})];
      const tasks = [{id: "t1", title: "Write report", googleCalendarEventId: "e1"}];
      assert.equal(matchLockedEvents(events, tasks).get("t1"), events[0]);
    });
    it("matches by the private taskId tag when there is no stored id", () => {
      const events = [ev("e1", {summary: "Whatever", extendedProperties: {private: {taskId: "t1"}}})];
      assert.equal(matchLockedEvents(events, [{id: "t1", title: "Something else"}]).get("t1"), events[0]);
    });
    it("falls back to the title, trimmed and case-insensitive", () => {
      const events = [ev("e1", {summary: "  write REPORT "})];
      assert.equal(matchLockedEvents(events, [{id: "t1", title: "Write report"}]).get("t1"), events[0]);
    });
    it("prefers an id match over a tag match over a title match", () => {
      const byTitle = ev("e1", {summary: "Write report"});
      const byTag = ev("e2", {summary: "x", extendedProperties: {private: {taskId: "t1"}}});
      const byId = ev("e3", {summary: "y"});
      const task = {id: "t1", title: "Write report", googleCalendarEventId: "e3"};
      assert.equal(matchLockedEvents([byTitle, byTag, byId], [task]).get("t1"), byId);
      assert.equal(matchLockedEvents([byTitle, byTag], [{id: "t1", title: "Write report"}]).get("t1"), byTag);
    });
    it("gives each event to at most one task", () => {
      const events = [ev("e1", {summary: "Same title"})];
      const tasks = [{id: "t1", title: "Same title"}, {id: "t2", title: "Same title"}];
      const result = matchLockedEvents(events, tasks);
      assert.equal(result.size, 1);
      assert.equal(result.get("t1"), events[0]);
      assert.equal(result.has("t2"), false);
    });
    it("lets a title match go to the next task when an earlier pass already claimed the event", () => {
      const events = [ev("e1", {summary: "Same title"}), ev("e2", {summary: "Same title"})];
      const tasks = [{id: "t1", title: "Same title", googleCalendarEventId: "e2"}, {id: "t2", title: "Same title"}];
      const result = matchLockedEvents(events, tasks);
      assert.equal(result.get("t1"), events[1]);
      assert.equal(result.get("t2"), events[0]);
    });
    it("does not match an empty title or an empty stored id", () => {
      const events = [ev("e1", {summary: ""}), ev("", {summary: "x"})];
      const tasks = [{id: "t1", title: "  ", googleCalendarEventId: ""}];
      assert.equal(matchLockedEvents(events, tasks).size, 0);
    });
    it("returns an empty map when nothing matches", () => {
      assert.equal(matchLockedEvents([ev("e1", {summary: "Lunch"})], [{id: "t1", title: "Dentist"}]).size, 0);
      assert.equal(matchLockedEvents([], [{id: "t1", title: "Dentist"}]).size, 0);
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {validateSchedule, repairSchedule, parseScheduleResponse, checkProjectOrder, buildFixedSlots, matchLockedEvents, DAY_START_MIN, DAY_END_MIN} = require("../schedule");

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
  describe("project order", () => {
    const ZONE = "Pacific/Auckland";
    const member = (id, projectOrder, extra = {}) => ({id, projectId: "p1", ...(projectOrder === undefined ? {} : {projectOrder}), ...extra});
    const tasks = [member("a", 1), member("b", 2), member("c", 2), member("d", 3), {id: "x"}, member("u"), {id: "o", projectId: "p2", projectOrder: 1}];
    const check = (items, fixed = [], list = tasks) => {
      const {slots, errors} = validateSchedule({items, tasks: list.filter((t) => !fixed.some((f) => f.taskId === t.id)), busy: [], now: NOW, horizon: HORIZON, timeZone: ZONE, allTasks: list, fixed});
      assert.deepEqual(errors.filter((e) => !e.startsWith("Project order")), []);
      return checkProjectOrder({slots, tasks: list, fixed, timeZone: ZONE});
    };
    const at = (id, start, end) => slot(id, `2026-10-22T${start}:00+13:00`, `2026-10-22T${end}:00+13:00`);
    const day = (id, date) => ({taskId: id, startISO: date, endISO: date, transparency: "transparent", isAllDay: true});

    it("accepts tiers in order, including back to back", () => {
      assert.deepEqual(check([at("a", "09:00", "10:00"), at("b", "10:00", "11:00"), at("c", "11:00", "12:00"), at("d", "12:00", "13:00")]), []);
    });
    it("rejects a higher tier that starts before a lower tier ends", () => {
      const errors = check([at("a", "10:00", "11:00"), at("b", "09:00", "09:30")]);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /Project order: task b \(order 2\) and task a \(order 1\)/);
    });
    it("rejects a higher tier scheduled earlier on an earlier day", () => {
      assert.equal(check([at("a", "09:00", "10:00"), slot("b", "2026-10-21T22:00:00Z", "2026-10-21T22:30:00Z")]).length, 0); // 11:00 NZDT
      assert.equal(check([slot("a", "2026-10-23T09:00:00+13:00", "2026-10-23T10:00:00+13:00"), at("b", "09:00", "10:00")]).length, 1);
    });
    it("checks every lower tier, not only the one below", () => {
      assert.equal(check([at("a", "11:00", "12:00"), at("b", "09:00", "10:00"), at("d", "10:00", "10:30")], [], [member("a", 1), member("b", 2), member("d", 3)]).length, 2);
    });
    it("lets tasks of one tier go in any order or overlap-free arrangement", () => {
      assert.deepEqual(check([at("a", "09:00", "10:00"), at("c", "10:00", "11:00"), at("b", "11:00", "12:00")]), []);
    });
    it("leaves unordered members, tasks outside projects and other projects unconstrained", () => {
      assert.deepEqual(check([at("u", "08:00", "09:00"), at("x", "09:00", "10:00"), at("o", "10:00", "11:00"), at("a", "11:00", "12:00")]), []);
    });
    it("leaves a task unscheduled when a lower-tier member has no slot", () => {
      const errors = check([at("b", "09:00", "10:00")]);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /the earlier one has no slot/);
      assert.deepEqual(check([at("a", "09:00", "10:00")]), []); // the lower tier alone is fine
      assert.deepEqual(check([]), []);
    });
    it("compares an all-day slot by its whole date", () => {
      assert.deepEqual(check([day("a", "2026-10-22"), at("b", "09:00", "10:00")]).length, 1); // same date: still occupied
      assert.deepEqual(check([day("a", "2026-10-22"), slot("b", "2026-10-23T09:00:00+13:00", "2026-10-23T10:00:00+13:00")]), []);
      assert.equal(check([at("a", "09:00", "10:00"), day("b", "2026-10-22")]).length, 1); // an all-day task covers from midnight
      assert.deepEqual(check([at("a", "09:00", "10:00"), day("b", "2026-10-23")]), []);
      assert.deepEqual(check([day("a", "2026-10-22"), day("b", "2026-10-23")]), []);
      assert.equal(check([day("a", "2026-10-23"), day("b", "2026-10-23")]).length, 1);
    });
    it("treats a fixed lower-tier task as a fixed slot the run must follow", () => {
      const fixed = [{taskId: "a", start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"}];
      assert.deepEqual(check([at("b", "11:00", "12:00")], fixed), []);
      assert.equal(check([at("b", "10:30", "11:30")], fixed).length, 1);
    });
    it("treats a fixed higher-tier task as a deadline for the run's lower tier", () => {
      const fixed = [{taskId: "b", start: "2026-10-22T14:00:00+13:00", end: "2026-10-22T15:00:00+13:00"}];
      assert.deepEqual(check([at("a", "09:00", "10:00")], fixed), []);
      assert.equal(check([at("a", "13:30", "14:30")], fixed).length, 1);
    });
    it("does not require a slot for a fixed higher tier, nor check two fixed tasks", () => {
      const fixed = [{taskId: "b", start: "2026-10-22T14:00:00+13:00", end: "2026-10-22T15:00:00+13:00"}];
      assert.deepEqual(check([], fixed), []);
      const both = [{taskId: "a", start: "2026-10-22T14:00:00+13:00", end: "2026-10-22T15:00:00+13:00"}, ...fixed.map((f) => ({...f, start: "2026-10-22T09:00:00+13:00", end: "2026-10-22T10:00:00+13:00"}))];
      assert.deepEqual(check([], both), []);
    });
    it("fails validateSchedule, so the run aborts", () => {
      const {errors} = validateSchedule({items: [at("a", "10:00", "11:00"), at("b", "09:00", "09:30")], tasks: [member("a", 1), member("b", 2)], busy: [], now: NOW, horizon: HORIZON, timeZone: ZONE});
      assert.equal(errors.length, 1);
    });
    it("ignores project fields when no task has an order number", () => {
      const plain = [{id: "a"}, {id: "b", projectId: "p1"}];
      assert.deepEqual(validateSchedule({items: [at("b", "09:00", "10:00")], tasks: plain, busy: [], now: NOW, horizon: HORIZON, timeZone: ZONE}).errors, []);
    });
  });

  describe("buildFixedSlots", () => {
    const ZONE = "Pacific/Auckland";
    const member = (id, projectOrder, extra = {}) => ({id, projectId: "p1", projectOrder, ...extra});
    const locked = new Map([["l", {start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"}], ["n", {start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"}]]);
    const tasks = [member("l", 1), member("m", 2, {scheduledStart: "2026-10-22T13:00:00+13:00", scheduledEnd: "2026-10-22T14:00:00+13:00"}), member("d", 3, {scheduledStart: "2026-10-23", scheduledEnd: "2026-10-24"}), member("s", 4), {id: "n"}, {id: "z", scheduledStart: "2026-10-22T13:00:00+13:00", scheduledEnd: "2026-10-22T14:00:00+13:00"}];

    it("returns only locked tasks in a full run", () => {
      assert.deepEqual(buildFixedSlots({tasks, inScopeIds: null, lockedWindows: locked, timeZone: ZONE}), [{taskId: "l", start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"}]);
    });
    it("adds the scheduled tasks outside a subset run, as instants", () => {
      const out = buildFixedSlots({tasks, inScopeIds: new Set(["s"]), lockedWindows: locked, timeZone: ZONE});
      assert.deepEqual(out.map((f) => f.taskId), ["l", "m", "d"]);
      assert.equal(out[1].start, "2026-10-22T00:00:00.000Z"); // 13:00 NZDT
      assert.equal(out[2].start, "2026-10-22T11:00:00.000Z"); // 23 Oct 00:00 NZDT
      assert.equal(out[2].end, "2026-10-23T11:00:00.000Z"); // exclusive end date
    });
    it("leaves out tasks in scope, unscheduled tasks and tasks without an order number", () => {
      const out = buildFixedSlots({tasks, inScopeIds: new Set(["m", "d"]), lockedWindows: new Map(), timeZone: ZONE});
      assert.deepEqual(out, []);
    });
    it("skips unusable stored times", () => {
      const bad = [member("m", 2, {scheduledStart: "soon", scheduledEnd: "2026-10-22T14:00:00+13:00"})];
      assert.deepEqual(buildFixedSlots({tasks: bad, inScopeIds: new Set(), lockedWindows: new Map(), timeZone: ZONE}), []);
    });
  });
});

describe("repairSchedule", () => {
  const P = [
    {id: "p1", projectId: "k", projectOrder: 1},
    {id: "p2", projectId: "k", projectOrder: 2},
    {id: "p3", projectId: "k", projectOrder: 3},
    {id: "free"},
  ];
  const repair = (items, extra = {}) => repairSchedule({items, tasks: P, busy: [], now: NOW, horizon: HORIZON, timeZone: "Pacific/Auckland", ...extra});
  const ids = (r) => r.slots.map((s) => s.taskId).sort();

  it("keeps a clean schedule untouched", () => {
    const r = repair([
      slot("p1", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("p2", "2026-10-22T10:00:00+13:00", "2026-10-22T11:00:00+13:00"),
    ]);
    assert.deepEqual(ids(r), ["p1", "p2"]);
    assert.deepEqual(r.dropped, []);
    assert.deepEqual(r.errors, []);
  });
  it("drops a later tier whose earlier tier has no slot, and the tiers above it", () => {
    const r = repair([
      slot("p1", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("p3", "2026-10-22T12:00:00+13:00", "2026-10-22T13:00:00+13:00"),
      slot("free", "2026-10-22T14:00:00+13:00", "2026-10-22T15:00:00+13:00"),
    ]);
    assert.deepEqual(ids(r), ["free", "p1"]);
    assert.deepEqual(r.dropped.map((d) => d.taskId), ["p3"]);
    assert.deepEqual(r.errors, []);
  });
  it("drops a later tier that starts before an earlier one ends, cascading upward", () => {
    const r = repair([
      slot("p1", "2026-10-22T11:00:00+13:00", "2026-10-22T12:00:00+13:00"),
      slot("p2", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("p3", "2026-10-22T13:00:00+13:00", "2026-10-22T14:00:00+13:00"),
    ]);
    assert.deepEqual(ids(r), ["p1"]);
    assert.deepEqual(r.dropped.map((d) => d.taskId).sort(), ["p2", "p3"]);
    assert.deepEqual(r.errors, []);
  });
  it("drops only the invalid slot and keeps the rest", () => {
    const r = repair([
      slot("p1", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("free", "2026-10-23T06:00:00+13:00", "2026-10-23T07:00:00+13:00"),
    ]);
    assert.deepEqual(ids(r), ["p1"]);
    assert.equal(r.dropped[0].taskId, "free");
    assert.match(r.dropped[0].reason, /8:00-19:00/);
  });
  it("keeps the earlier of two overlapping slots", () => {
    const r = repair([
      slot("p1", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("free", "2026-10-22T09:30:00+13:00", "2026-10-22T10:30:00+13:00"),
    ]);
    assert.deepEqual(ids(r), ["p1"]);
    assert.equal(r.dropped[0].taskId, "free");
  });
  it("keeps the first slot of a repeated task without reporting a loss", () => {
    const r = repair([
      slot("free", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"),
      slot("free", "2026-10-22T11:00:00+13:00", "2026-10-22T12:00:00+13:00"),
    ]);
    assert.equal(r.slots.length, 1);
    assert.deepEqual(r.dropped, []);
  });
  it("ignores unknown ids and non-object items", () => {
    const r = repair([null, "x", slot("nope", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")]);
    assert.deepEqual(r.slots, []);
    assert.deepEqual(r.dropped, []);
  });
  it("tolerates a non-array result", () => {
    assert.deepEqual(repair(undefined).slots, []);
  });
  it("drops the run's earlier tier when a fixed later tier would start before it ends", () => {
    const fixed = [{taskId: "p2", start: "2026-10-21T21:00:00Z", end: "2026-10-21T22:00:00Z"}]; // 10:00-11:00 on the 22nd, NZDT
    const r = repair([slot("p1", "2026-10-22T10:30:00+13:00", "2026-10-22T11:30:00+13:00")], {fixed});
    assert.deepEqual(r.slots, []);
    assert.equal(r.dropped[0].taskId, "p1");
  });
});

describe("parseScheduleResponse", () => {
  it("parses the scheduledTasks list", () => {
    assert.deepEqual(parseScheduleResponse("{\"scheduledTasks\":[{\"taskId\":\"a\"}]}"), [{taskId: "a"}]);
  });
  it("accepts an empty list", () => {
    assert.deepEqual(parseScheduleResponse("{\"scheduledTasks\":[]}"), []);
  });
  it("strips a Markdown code fence", () => {
    assert.deepEqual(parseScheduleResponse("```json\n{\"scheduledTasks\":[]}\n```"), []);
  });
  it("accepts a bare array", () => {
    assert.deepEqual(parseScheduleResponse("[{\"taskId\":\"a\"}]"), [{taskId: "a"}]);
  });
  it("explains an empty, truncated or shapeless answer", () => {
    assert.throws(() => parseScheduleResponse(undefined), /empty response/);
    assert.throws(() => parseScheduleResponse("   "), /empty response/);
    assert.throws(() => parseScheduleResponse("{\"scheduledTasks\":[{\"taskId\":"), /malformed JSON/);
    assert.throws(() => parseScheduleResponse("{\"other\":1}"), /no scheduledTasks/);
  });
});

describe("weather rule for Outdoor and Garden tasks", () => {
  // NOW is 2026-10-22 07:00 NZDT; the window ends 2026-10-24 and the 23rd is rainy.
  const WEATHER = {lastDate: "2026-10-24", rainyDates: ["2026-10-23"]};
  const T = [{id: "out", tags: ["Outdoor"]}, {id: "gar", tags: ["garden"]}, {id: "in", tags: ["Indoor"]}];
  const check = (items, weather) => repairSchedule({items, tasks: T, busy: [], now: NOW, horizon: HORIZON, timeZone: "Pacific/Auckland", weather: weather === undefined ? WEATHER : weather});
  const ids = (r) => r.slots.map((s) => s.taskId).sort();

  it("allows a weather-dependent task on a dry day inside the window, including the last day", () => {
    const r = check([slot("out", "2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"), slot("gar", "2026-10-24T09:00:00+13:00", "2026-10-24T10:00:00+13:00")]);
    assert.deepEqual(ids(r), ["gar", "out"]);
    assert.deepEqual(r.dropped, []);
  });
  it("drops a timed slot on a rainy day", () => {
    const r = check([slot("out", "2026-10-23T09:00:00+13:00", "2026-10-23T10:00:00+13:00")]);
    assert.deepEqual(r.slots, []);
    assert.match(r.dropped[0].reason, /rainy day 2026-10-23/);
  });
  it("drops a timed slot after the window", () => {
    const r = check([slot("gar", "2026-10-25T09:00:00+13:00", "2026-10-25T10:00:00+13:00")]);
    assert.deepEqual(r.slots, []);
    assert.match(r.dropped[0].reason, /after the forecast window ending 2026-10-24/);
  });
  it("applies the rule to all-day slots", () => {
    const r = check([slot("out", "2026-10-25", "2026-10-26", {isAllDay: true}), slot("gar", "2026-10-23", "2026-10-24", {isAllDay: true}), slot("out2", "2026-10-22", "2026-10-23", {isAllDay: true})]);
    assert.deepEqual(r.slots, []);
    assert.deepEqual(r.dropped.map((d) => d.taskId).sort(), ["gar", "out"]);
  });
  it("judges a slot by its local date, not its UTC date", () => {
    // 2026-10-24 08:00 NZDT is 2026-10-23 19:00 UTC (the rainy date in UTC), but the local day is dry and in the window
    const r = check([slot("out", "2026-10-24T08:00:00+13:00", "2026-10-24T09:00:00+13:00")]);
    assert.deepEqual(ids(r), ["out"]);
  });
  it("leaves other tasks unrestricted, rain or not and inside or beyond the window", () => {
    const r = check([slot("in", "2026-10-23T09:00:00+13:00", "2026-10-23T10:00:00+13:00"), slot("in", "2026-10-27T09:00:00+13:00", "2026-10-27T10:00:00+13:00")]);
    assert.deepEqual(ids(r), ["in"]);
  });
  it("restricts nothing when no weather rules are given", () => {
    const r = check([slot("out", "2026-10-27T09:00:00+13:00", "2026-10-27T10:00:00+13:00")], null);
    assert.deepEqual(ids(r), ["out"]);
  });
  it("keeps the rest of the schedule when one weather-dependent slot is dropped", () => {
    const r = check([slot("out", "2026-10-26T09:00:00+13:00", "2026-10-26T10:00:00+13:00"), slot("in", "2026-10-26T11:00:00+13:00", "2026-10-26T12:00:00+13:00")]);
    assert.deepEqual(ids(r), ["in"]);
    assert.deepEqual(r.errors, []);
  });
  it("is reported by validateSchedule too", () => {
    const {errors} = validateSchedule({items: [slot("out", "2026-10-26T09:00:00+13:00", "2026-10-26T10:00:00+13:00")], tasks: T, busy: [], now: NOW, horizon: HORIZON, timeZone: "Pacific/Auckland", weather: WEATHER});
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Outdoor\/Garden/);
  });
});

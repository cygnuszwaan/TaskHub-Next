/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {planSchedule, sortByUrgency, SNAP_MINUTES, QUICK_MINUTES, DEFAULT_MINUTES} = require("../planner");
const {validateSchedule, repairSchedule} = require("../schedule");
const {weatherWindow} = require("../weather");

const NZ = "Pacific/Auckland";
// "now" is 07:00 NZDT on Thursday 22 Oct 2026, before the working day; the horizon is seven days later (07:00 on the 29th).
const NOW = new Date("2026-10-21T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const horizonFor = (now, days = 7) => new Date(now.getTime() + days * DAY_MS);

const task = (id, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 30, tags: ["Indoor"], status: "PENDING", order: 1, ...extra});
const win = (start, end) => ({start, end});

// Plan, and check the result against the engine's own rules (validateSchedule, which repairSchedule is built on)
function plan(tasks, extra = {}) {
  const now = extra.now || NOW;
  const args = {tasks, busy: [], now, horizon: extra.horizon || horizonFor(now), timeZone: NZ, ...extra};
  const result = planSchedule(args);
  const checked = validateSchedule({items: result.items, tasks, busy: args.busy, now, horizon: args.horizon, timeZone: args.timeZone, weather: args.weather, allTasks: args.allTasks || tasks, fixed: args.fixed || []});
  assert.deepEqual(checked.errors, [], "the planner's own output must pass validation");
  const repaired = repairSchedule({items: result.items, tasks, busy: args.busy, now, horizon: args.horizon, timeZone: args.timeZone, weather: args.weather, allTasks: args.allTasks || tasks, fixed: args.fixed || []});
  assert.deepEqual(repaired.dropped, [], "repairSchedule must have nothing to drop");
  return result;
}

const slotOf = (result, id) => result.items.find((i) => i.taskId === id);
const times = (result, id) => {
  const s = slotOf(result, id);
  return s ? [s.startISO, s.endISO] : null;
};

describe("planner.js", () => {
  describe("placing tasks", () => {
    it("puts a task at the start of the working day", () => {
      const result = plan([task("a", {estimatedMinutes: 45})]);
      assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:45:00+13:00"]);
      assert.deepEqual(result.unplaced, []);
      assert.equal(slotOf(result, "a").isAllDay, false);
      assert.equal(slotOf(result, "a").title, "Task a");
    });
    it("returns nothing for no tasks", () => {
      assert.deepEqual(plan([]), {items: [], unplaced: []});
    });
    it("starts no earlier than now, rounded up to the next five minutes", () => {
      assert.equal(SNAP_MINUTES, 5);
      const now = new Date("2026-10-22T10:07:00+13:00");
      assert.equal(times(plan([task("a")], {now}), "a")[0], "2026-10-22T10:10:00+13:00");
      const exact = new Date("2026-10-22T10:10:00+13:00");
      assert.equal(times(plan([task("a")], {now: exact}), "a")[0], "2026-10-22T10:10:00+13:00");
    });
    it("moves to the next morning once today's window is over", () => {
      const now = new Date("2026-10-22T21:54:00+13:00");
      assert.deepEqual(times(plan([task("a")], {now}), "a"), ["2026-10-23T08:00:00+13:00", "2026-10-23T08:30:00+13:00"]);
    });
    it("packs tasks back to back with no gaps", () => {
      const result = plan([task("a", {order: 1}), task("b", {order: 2}), task("c", {order: 3})]);
      assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
      assert.deepEqual(times(result, "b"), ["2026-10-22T08:30:00+13:00", "2026-10-22T09:00:00+13:00"]);
      assert.deepEqual(times(result, "c"), ["2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
    });
    it("fills each working day to 19:00 before starting the next", () => {
      // 11 hours a day: three 3-hour tasks fit before 17:00, the fourth waits for tomorrow
      const tasks = ["a", "b", "c", "d"].map((id, i) => task(id, {estimatedMinutes: 180, order: i + 1}));
      const result = plan(tasks);
      assert.deepEqual(times(result, "c"), ["2026-10-22T14:00:00+13:00", "2026-10-22T17:00:00+13:00"]);
      assert.deepEqual(times(result, "d"), ["2026-10-23T08:00:00+13:00", "2026-10-23T11:00:00+13:00"]);
    });
    it("lets a shorter task fill a gap that a longer, more urgent one did not fit", () => {
      const tasks = [
        ...["a", "b", "c", "d"].map((id, i) => task(id, {estimatedMinutes: 180, dueDate: "2026-10-22", order: i + 1})),
        task("e", {estimatedMinutes: 60, priority: "LOW", order: 5}),
      ];
      const result = plan(tasks);
      assert.deepEqual(times(result, "d")[0], "2026-10-23T08:00:00+13:00");
      assert.deepEqual(times(result, "e"), ["2026-10-22T17:00:00+13:00", "2026-10-22T18:00:00+13:00"]);
    });
    it("uses every gap of the week when the tasks need it, rather than stopping short", () => {
      // 7 days from 07:00: 7 working days of 11 hours (the last one cut off by the horizon at 07:00 on the 29th, so 6 full days from the 22nd to the 28th plus none)
      const tasks = Array.from({length: 44}, (_, i) => task(`t${i}`, {estimatedMinutes: 90, order: i + 1}));
      const result = plan(tasks);
      // 22nd..28th is seven working days of 660 minutes = 4620 minutes = 51 tasks of 90 minutes at most; 7 per day fit (630), so 49
      assert.equal(result.items.length, 44);
      assert.deepEqual(result.unplaced, []);
      const perDay = new Map();
      for (const i of result.items) perDay.set(i.startISO.slice(0, 10), (perDay.get(i.startISO.slice(0, 10)) || 0) + 1);
      assert.deepEqual([...perDay.values()].slice(0, 6), [7, 7, 7, 7, 7, 7]);
    });
    it("reports tasks that do not fit before the horizon, with a reason", () => {
      const tasks = Array.from({length: 60}, (_, i) => task(`t${i}`, {estimatedMinutes: 90, order: i + 1}));
      const result = plan(tasks);
      assert.equal(result.items.length + result.unplaced.length, 60);
      assert.equal(result.items.length, 49); // 7 days x 7 slots of 90 minutes in an 11-hour day
      assert.match(result.unplaced[0].reason, /no gap of 90 minutes left before the horizon/);
      // the most urgent (first in the list) are the ones placed
      assert.ok(slotOf(result, "t0"));
      assert.equal(result.unplaced.some((u) => u.taskId === "t0"), false);
    });
    it("never lets a slot run past the horizon", () => {
      const horizon = new Date("2026-10-22T10:00:00+13:00");
      const result = plan([task("a", {estimatedMinutes: 90}), task("b", {estimatedMinutes: 30, order: 2})], {horizon});
      assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
      assert.deepEqual(times(result, "b"), ["2026-10-22T09:30:00+13:00", "2026-10-22T10:00:00+13:00"]);
      const tight = plan([task("a", {estimatedMinutes: 150})], {horizon});
      assert.equal(tight.items.length, 0);
      assert.equal(tight.unplaced.length, 1);
    });
    it("uses 15 minutes for a task without a usable estimate and rounds fractions up", () => {
      assert.equal(DEFAULT_MINUTES, 15);
      const result = plan([task("a", {estimatedMinutes: undefined}), task("b", {estimatedMinutes: 0, order: 2}), task("c", {estimatedMinutes: 10.2, order: 3})]);
      assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:15:00+13:00"]);
      assert.deepEqual(times(result, "b"), ["2026-10-22T08:15:00+13:00", "2026-10-22T08:30:00+13:00"]);
      assert.deepEqual(times(result, "c"), ["2026-10-22T08:30:00+13:00", "2026-10-22T08:41:00+13:00"]);
    });
    it("does not modify its inputs", () => {
      const tasks = [task("a"), task("b", {dueDate: "2026-10-21", order: 2})];
      const busy = [win("2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")];
      const copy = structuredClone({tasks, busy});
      plan(tasks, {busy});
      assert.deepEqual({tasks, busy}, copy);
    });
  });

  describe("busy time", () => {
    it("works around a busy window", () => {
      const busy = [win("2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00")];
      const result = plan([task("a", {estimatedMinutes: 45}), task("b", {estimatedMinutes: 30, order: 2})], {busy});
      assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:45:00+13:00"]);
      assert.deepEqual(times(result, "b"), ["2026-10-22T10:00:00+13:00", "2026-10-22T10:30:00+13:00"]);
    });
    it("skips a gap that is too short and uses a later one", () => {
      const busy = [win("2026-10-22T08:30:00+13:00", "2026-10-22T09:00:00+13:00"), win("2026-10-22T10:00:00+13:00", "2026-10-22T11:00:00+13:00")];
      const result = plan([task("a", {estimatedMinutes: 75})], {busy}); // the gaps are 30 minutes (8:00) and 60 minutes (9:00)
      assert.deepEqual(times(result, "a"), ["2026-10-22T11:00:00+13:00", "2026-10-22T12:15:00+13:00"]);
    });
    it("fits a task exactly into a gap", () => {
      const busy = [win("2026-10-22T08:00:00+13:00", "2026-10-22T09:00:00+13:00"), win("2026-10-22T10:00:00+13:00", "2026-10-22T19:00:00+13:00")];
      assert.deepEqual(times(plan([task("a", {estimatedMinutes: 60})], {busy}), "a"), ["2026-10-22T09:00:00+13:00", "2026-10-22T10:00:00+13:00"]);
    });
    it("snaps a start up when a busy window ends between five-minute marks", () => {
      const busy = [win("2026-10-22T08:00:00+13:00", "2026-10-22T09:03:00+13:00")];
      assert.equal(times(plan([task("a")], {busy}), "a")[0], "2026-10-22T09:05:00+13:00");
    });
    it("skips whole days that are fully booked", () => {
      const busy = [win("2026-10-22T00:00:00+13:00", "2026-10-24T00:00:00+13:00")];
      assert.equal(times(plan([task("a")], {busy}), "a")[0], "2026-10-24T08:00:00+13:00");
    });
    it("copes with unsorted, overlapping and unusable busy windows", () => {
      const busy = [
        win("2026-10-22T10:00:00+13:00", "2026-10-22T12:00:00+13:00"),
        win("2026-10-22T08:00:00+13:00", "2026-10-22T10:30:00+13:00"),
        win("junk", "2026-10-22T13:00:00+13:00"),
        win("2026-10-22T13:00:00+13:00", "2026-10-22T13:00:00+13:00"),
      ];
      assert.equal(times(plan([task("a")], {busy}), "a")[0], "2026-10-22T12:00:00+13:00");
    });
    it("places nothing and says why when all time is taken", () => {
      const busy = [win("2026-10-22T00:00:00+13:00", "2026-10-30T00:00:00+13:00")];
      const result = plan([task("a")], {busy});
      assert.deepEqual(result.items, []);
      assert.equal(result.unplaced[0].taskId, "a");
    });
  });

  describe("order of placement", () => {
    it("places overdue tasks first, then the nearest due dates, then undated tasks by priority", () => {
      const tasks = [
        task("undatedLow", {priority: "LOW", order: 1}),
        task("undatedHigh", {priority: "HIGH", order: 2}),
        task("dueLater", {dueDate: "2026-10-27", order: 3}),
        task("dueSoon", {dueDate: "2026-10-23", order: 4}),
        task("overdue", {dueDate: "2026-10-18", order: 5}),
      ];
      const result = plan(tasks);
      const byStart = [...result.items].sort((a, b) => (a.startISO < b.startISO ? -1 : 1)).map((i) => i.taskId);
      assert.deepEqual(byStart, ["overdue", "dueSoon", "dueLater", "undatedHigh", "undatedLow"]);
    });
    it("breaks ties between the same due date by priority, then list rank", () => {
      const sorted = sortByUrgency([
        task("lowFirst", {dueDate: "2026-10-25", priority: "LOW", order: 1}),
        task("highSecond", {dueDate: "2026-10-25", priority: "HIGH", order: 2}),
        task("highFirst", {dueDate: "2026-10-25", priority: "HIGH", order: 1}),
      ], "2026-10-22");
      assert.deepEqual(sorted.map((t) => t.id), ["highFirst", "highSecond", "lowFirst"]);
    });
    it("treats an unknown priority as lower than LOW and a missing rank as first", () => {
      const sorted = sortByUrgency([task("odd", {priority: "URGENT", order: 1}), task("low", {priority: "LOW", order: 2})], "2026-10-22");
      assert.deepEqual(sorted.map((t) => t.id), ["low", "odd"]);
    });
    it("does not modify the list it sorts", () => {
      const list = [task("b", {order: 2}), task("a", {order: 1})];
      sortByUrgency(list, "2026-10-22");
      assert.deepEqual(list.map((t) => t.id), ["b", "a"]);
    });
    it("keeps a task due today ahead of undated ones, and an overdue one ahead of both", () => {
      const result = plan([task("none", {order: 1}), task("today", {dueDate: "2026-10-22", order: 2}), task("late", {dueDate: "2026-10-01", order: 3})]);
      assert.deepEqual(times(result, "late"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
      assert.deepEqual(times(result, "today"), ["2026-10-22T08:30:00+13:00", "2026-10-22T09:00:00+13:00"]);
      assert.deepEqual(times(result, "none"), ["2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
    });
    it("still places an overdue task, whatever its due date was", () => {
      assert.ok(slotOf(plan([task("a", {dueDate: "2020-01-01"})]), "a"));
    });
    it("explains each slot in a short reason", () => {
      const result = plan([task("late", {dueDate: "2026-10-01"}), task("soon", {dueDate: "2026-10-25", order: 2}), task("none", {order: 3})]);
      assert.match(slotOf(result, "late").reasoning, /Overdue \(due 2026-10-01\)/);
      assert.match(slotOf(result, "soon").reasoning, /Due 2026-10-25/);
      assert.match(slotOf(result, "none").reasoning, /by priority/);
    });
  });

  describe("transparency", () => {
    it("shows quick chores as free time and longer tasks as busy", () => {
      assert.equal(QUICK_MINUTES, 15);
      const result = plan([task("quick", {estimatedMinutes: 15}), task("longer", {estimatedMinutes: 16, order: 2}), task("focus", {estimatedMinutes: 90, order: 3})]);
      assert.equal(slotOf(result, "quick").transparency, "transparent");
      assert.equal(slotOf(result, "longer").transparency, "opaque");
      assert.equal(slotOf(result, "focus").transparency, "opaque");
    });
  });

  describe("tasks longer than the working day", () => {
    it("becomes an all-day reminder on the first day with time left", () => {
      const result = plan([task("big", {estimatedMinutes: 900})]);
      const s = slotOf(result, "big");
      assert.equal(s.isAllDay, true);
      assert.equal(s.startISO, "2026-10-22");
      assert.equal(s.endISO, "2026-10-23");
      assert.equal(s.transparency, "transparent");
    });
    it("does not take time from the timed tasks", () => {
      const result = plan([task("big", {estimatedMinutes: 900}), task("a", {order: 2})]);
      assert.deepEqual(times(result, "a")[0], "2026-10-22T08:00:00+13:00");
    });
    it("leaves today alone once its window has passed", () => {
      const now = new Date("2026-10-22T20:00:00+13:00");
      assert.equal(slotOf(plan([task("big", {estimatedMinutes: 700})], {now}), "big").startISO, "2026-10-23");
    });
    it("fits a task of exactly the working day into a timed slot", () => {
      const s = slotOf(plan([task("full", {estimatedMinutes: 660})]), "full");
      assert.equal(s.isAllDay, false);
      assert.deepEqual([s.startISO, s.endISO], ["2026-10-22T08:00:00+13:00", "2026-10-22T19:00:00+13:00"]);
    });
  });

  describe("weather", () => {
    const outdoor = (id, extra = {}) => task(id, {tags: ["Outdoor"], ...extra});
    const window = (rainyDates, lastDate = "2026-10-24") => ({lastDate, rainyDates});

    it("keeps Outdoor and Garden tasks off rainy days", () => {
      const result = plan([outdoor("a"), task("g", {tags: ["garden"], order: 2})], {weather: window(["2026-10-22"])});
      assert.equal(times(result, "a")[0], "2026-10-23T08:00:00+13:00");
      assert.equal(times(result, "g")[0], "2026-10-23T08:30:00+13:00");
    });
    it("lets other tasks use the rainy day", () => {
      const result = plan([outdoor("a"), task("b", {order: 2})], {weather: window(["2026-10-22"])});
      assert.equal(times(result, "b")[0], "2026-10-22T08:00:00+13:00");
    });
    it("keeps weather-dependent tasks inside the forecast window", () => {
      const rainyAll = window(["2026-10-22", "2026-10-23", "2026-10-24"]);
      const result = plan([outdoor("a")], {weather: rainyAll});
      assert.deepEqual(result.items, []);
      assert.match(result.unplaced[0].reason, /dry day inside the forecast window/);
    });
    it("puts a weather-dependent task on the last dry day of the window even when other days are full", () => {
      const busy = [win("2026-10-22T00:00:00+13:00", "2026-10-24T00:00:00+13:00")];
      assert.equal(times(plan([outdoor("a")], {busy, weather: window([])}), "a")[0], "2026-10-24T08:00:00+13:00");
    });
    it("does not place a weather-dependent task after the window, even with free days", () => {
      const busy = [win("2026-10-22T00:00:00+13:00", "2026-10-25T00:00:00+13:00")];
      assert.deepEqual(plan([outdoor("a")], {busy, weather: window([])}).items, []);
    });
    it("applies the same rules to an all-day weather-dependent task", () => {
      const result = plan([outdoor("big", {estimatedMinutes: 900})], {weather: window(["2026-10-22"])});
      assert.equal(slotOf(result, "big").startISO, "2026-10-23");
      assert.deepEqual(plan([outdoor("big", {estimatedMinutes: 900})], {weather: window(["2026-10-22", "2026-10-23", "2026-10-24"])}).items, []);
    });
    it("restricts nothing without a weather window", () => {
      const result = plan([outdoor("a")], {weather: null});
      assert.equal(times(result, "a")[0], "2026-10-22T08:00:00+13:00");
    });
    it("works with weatherWindow's output, including its stand-in for a missing forecast", () => {
      const weather = weatherWindow({today: "2026-10-22", forecast: [], current: "WET"});
      assert.deepEqual(plan([outdoor("a")], {weather}).items, []);
      const dry = weatherWindow({today: "2026-10-22", forecast: [{date: "2026-10-22", rainy: true}, {date: "2026-10-23", rainy: false}], current: "DRY"});
      assert.equal(times(plan([outdoor("a")], {weather: dry}), "a")[0], "2026-10-23T08:00:00+13:00");
    });
  });

  describe("project order", () => {
    const member = (id, projectOrder, extra = {}) => task(id, {projectId: "p1", projectOrder, ...extra});

    it("runs a later step after an earlier one even when the later one is more urgent", () => {
      const tasks = [member("second", 2, {dueDate: "2026-10-22", order: 1}), member("first", 1, {order: 2})];
      const result = plan(tasks);
      assert.deepEqual(times(result, "first"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
      assert.deepEqual(times(result, "second"), ["2026-10-22T08:30:00+13:00", "2026-10-22T09:00:00+13:00"]);
    });
    it("orders three steps, and places tasks outside the project into the earlier gaps in urgency order", () => {
      const tasks = [member("c", 3, {order: 1}), member("b", 2, {order: 2}), member("a", 1, {order: 3}), task("free", {dueDate: "2026-10-30", order: 4})];
      const result = plan(tasks);
      const byStart = [...result.items].sort((x, y) => (x.startISO < y.startISO ? -1 : 1)).map((i) => i.taskId);
      assert.deepEqual(byStart.filter((id) => id !== "free"), ["a", "b", "c"]);
    });
    it("lets tasks that share a number go in any order and ignores members without a number", () => {
      const tasks = [member("x", 1, {order: 1}), member("y", 1, {order: 2}), member("loose", undefined, {order: 3, dueDate: "2026-10-22"})];
      assert.equal(plan(tasks).items.length, 3);
    });
    it("starts a later tier after the end of every task of a lower tier", () => {
      const tasks = [member("a1", 1, {estimatedMinutes: 60, order: 1}), member("a2", 1, {estimatedMinutes: 120, order: 2}), member("b", 2, {order: 3})];
      const result = plan(tasks);
      assert.deepEqual(times(result, "b")[0], "2026-10-22T11:00:00+13:00");
    });
    it("leaves out a task whose earlier step could not be placed, and every later step after it", () => {
      const busy = [win("2026-10-22T00:00:00+13:00", "2026-10-29T00:00:00+13:00")];
      const tasks = [member("a", 1, {estimatedMinutes: 600, order: 1}), member("b", 2, {order: 2}), member("c", 3, {order: 3})];
      const result = plan(tasks, {busy});
      assert.deepEqual(result.items, []);
      assert.deepEqual(result.unplaced.map((u) => u.taskId), ["a", "b", "c"]);
      assert.match(result.unplaced[1].reason, /an earlier step in its project \("Task a"\) has no slot/);
    });
    it("places a later step on a later day when the earlier one is an all-day reminder", () => {
      const tasks = [member("big", 1, {estimatedMinutes: 900, order: 1}), member("next", 2, {order: 2})];
      const result = plan(tasks);
      assert.equal(slotOf(result, "big").startISO, "2026-10-22");
      assert.equal(times(result, "next")[0], "2026-10-23T08:00:00+13:00");
    });
    it("keeps a later all-day step on a later date than a timed earlier step", () => {
      const tasks = [member("a", 1, {order: 1}), member("big", 2, {estimatedMinutes: 900, order: 2})];
      const result = plan(tasks);
      assert.equal(slotOf(result, "big").startISO, "2026-10-23");
    });
    it("does not mix up two projects", () => {
      const tasks = [member("a2", 2, {order: 1}), task("b1", {projectId: "p2", projectOrder: 1, order: 2}), task("b2", {projectId: "p2", projectOrder: 2, order: 3}), member("a1", 1, {order: 4})];
      const result = plan(tasks);
      const start = (id) => times(result, id)[0];
      assert.ok(start("a1") < start("a2"));
      assert.ok(start("b1") < start("b2"));
    });

    describe("members outside the run", () => {
      const lockedLower = {taskId: "lock", start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"};
      const busyForLock = [win(lockedLower.start, lockedLower.end)];

      it("starts after a fixed earlier step", () => {
        const all = [member("lock", 1), member("next", 2)];
        const result = plan([all[1]], {allTasks: all, fixed: [lockedLower], busy: busyForLock});
        assert.deepEqual(times(result, "next")[0], "2026-10-22T11:00:00+13:00");
      });
      it("ends before a fixed later step", () => {
        const fixedHigher = {taskId: "lock", start: "2026-10-22T10:00:00+13:00", end: "2026-10-22T11:00:00+13:00"};
        const all = [member("early", 1, {estimatedMinutes: 90}), member("lock", 2)];
        const result = plan([all[0]], {allTasks: all, fixed: [fixedHigher], busy: [win(fixedHigher.start, fixedHigher.end)]});
        assert.deepEqual(times(result, "early"), ["2026-10-22T08:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
      });
      it("leaves the task out when it cannot end before a fixed later step", () => {
        const fixedHigher = {taskId: "lock", start: "2026-10-22T08:30:00+13:00", end: "2026-10-22T09:30:00+13:00"};
        const all = [member("early", 1, {estimatedMinutes: 90}), member("lock", 2)];
        const result = plan([all[0]], {allTasks: all, fixed: [fixedHigher], busy: [win(fixedHigher.start, fixedHigher.end)]});
        assert.deepEqual(result.items, []);
        assert.equal(result.unplaced[0].taskId, "early");
      });
      it("leaves a task out when an earlier step outside the run has no slot at all", () => {
        const all = [member("elsewhere", 1), member("mine", 2)];
        const result = plan([all[1]], {allTasks: all, fixed: []});
        assert.deepEqual(result.items, []);
        assert.match(result.unplaced[0].reason, /earlier step in its project/);
      });
      it("ignores a fixed slot that is unusable or whose task is not in a project", () => {
        const all = [member("mine", 1), task("other")];
        const result = plan([all[0]], {allTasks: all, fixed: [{taskId: "other", start: "2026-10-22T08:00:00+13:00", end: "2026-10-22T09:00:00+13:00"}, {taskId: "ghost", start: "x", end: "y"}, null]});
        assert.deepEqual(times(result, "mine")[0], "2026-10-22T08:00:00+13:00");
      });
    });
  });

  describe("time zones and daylight saving", () => {
    it("handles the day clocks go forward in New Zealand (27 September 2026)", () => {
      const now = new Date("2026-09-26T20:00:00+12:00"); // Saturday evening, still NZST
      const result = plan([task("a"), task("b", {order: 2, estimatedMinutes: 600})], {now});
      // The 27th starts at +12:00 and moves to +13:00 at 02:00; the working day is on NZDT
      assert.deepEqual(times(result, "a"), ["2026-09-27T08:00:00+13:00", "2026-09-27T08:30:00+13:00"]);
      assert.equal(times(result, "b")[0], "2026-09-27T08:30:00+13:00");
    });
    it("handles the day clocks go back in New Zealand (5 April 2026)", () => {
      const now = new Date("2026-04-04T20:00:00+13:00");
      const result = plan([task("a")], {now});
      assert.deepEqual(times(result, "a"), ["2026-04-05T08:00:00+12:00", "2026-04-05T08:30:00+12:00"]);
    });
    it("uses the zone's working hours, not the server's", () => {
      const now = new Date("2026-10-22T08:00:00Z"); // 01:00 in Los Angeles
      const zone = "America/Los_Angeles";
      const result = planSchedule({tasks: [task("a")], busy: [], now, horizon: horizonFor(now), timeZone: zone});
      assert.deepEqual([result.items[0].startISO, result.items[0].endISO], ["2026-10-22T08:00:00-07:00", "2026-10-22T08:30:00-07:00"]);
      assert.deepEqual(validateSchedule({items: result.items, tasks: [task("a")], busy: [], now, horizon: horizonFor(now), timeZone: zone}).errors, []);
    });
    it("handles a zone with a half-hour offset", () => {
      const now = new Date("2026-10-22T00:00:00Z"); // 05:30 in Kolkata
      const zone = "Asia/Kolkata";
      const result = planSchedule({tasks: [task("a")], busy: [], now, horizon: horizonFor(now), timeZone: zone});
      assert.deepEqual([result.items[0].startISO, result.items[0].endISO], ["2026-10-22T08:00:00+05:30", "2026-10-22T08:30:00+05:30"]);
    });
  });

  describe("agreement with the validation rules", () => {
    // A small seeded generator, so the random cases are the same on every run
    function rng(seed) {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    }

    for (let seed = 1; seed <= 60; seed++) {
      it(`produces a valid schedule for random input (seed ${seed})`, () => {
        const r = rng(seed);
        const pick = (arr) => arr[Math.floor(r() * arr.length)];
        const now = new Date(NOW.getTime() + Math.floor(r() * 14 * 60) * 60000);
        const horizon = horizonFor(now, 1 + Math.floor(r() * 14));
        const tasks = Array.from({length: 1 + Math.floor(r() * 40)}, (_, i) => {
          const t = task(`t${i}`, {
            order: i + 1,
            priority: pick(["HIGH", "MEDIUM", "LOW"]),
            estimatedMinutes: pick([5, 10, 15, 20, 30, 45, 60, 90, 120, 240, 480, 700, 1000]),
            dueDate: pick(["", "", "2026-10-18", "2026-10-22", "2026-10-25", "2026-11-05"]),
            tags: pick([["Indoor"], ["Outdoor"], ["Garden", "Physical"], []]),
          });
          if (r() < 0.3) {
            t.projectId = pick(["p1", "p2"]);
            if (r() < 0.8) t.projectOrder = 1 + Math.floor(r() * 3);
          }
          return t;
        });
        const busy = Array.from({length: Math.floor(r() * 12)}, () => {
          const start = now.getTime() + Math.floor(r() * 10 * 24 * 60) * 60000;
          return win(new Date(start).toISOString(), new Date(start + (15 + Math.floor(r() * 300)) * 60000).toISOString());
        });
        const rainy = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].filter(() => r() < 0.4);
        const weather = r() < 0.7 ? {lastDate: pick(["2026-10-22", "2026-10-24", "2026-10-30"]), rainyDates: rainy} : null;
        const planned = planSchedule({tasks, busy, now, horizon, timeZone: NZ, weather});

        // Every task is placed or explained, never both and never twice
        const ids = [...planned.items.map((i) => i.taskId), ...planned.unplaced.map((u) => u.taskId)];
        assert.deepEqual([...ids].sort(), tasks.map((t) => t.id).sort());

        const checked = validateSchedule({items: planned.items, tasks, busy, now, horizon, timeZone: NZ, weather});
        assert.deepEqual(checked.errors, []);
      });
    }

    it("leaves no task unplaced while a gap it fits is still open", () => {
      // After planning, every unplaced timed task must be longer than every remaining gap in its allowed days
      const r = rng(99);
      const tasks = Array.from({length: 80}, (_, i) => task(`t${i}`, {order: i + 1, estimatedMinutes: 20 + Math.floor(r() * 120)}));
      const busy = [win("2026-10-22T12:00:00+13:00", "2026-10-22T13:00:00+13:00")];
      const result = plan(tasks, {busy});
      assert.ok(result.unplaced.length > 0, "the week should be too small for this many tasks");
      const taken = [...busy, ...result.items.map((i) => win(i.startISO, i.endISO))].map((w) => [Date.parse(w.start), Date.parse(w.end)]).sort((a, b) => a[0] - b[0]);
      const shortest = Math.min(...result.unplaced.map((u) => tasks.find((t) => t.id === u.taskId).estimatedMinutes));
      for (let day = 22; day <= 28; day++) {
        const open = Date.parse(`2026-10-${day}T08:00:00+13:00`);
        const close = Math.min(Date.parse(`2026-10-${day}T19:00:00+13:00`), Date.parse("2026-10-29T07:00:00+13:00"));
        let cursor = Math.max(open, NOW.getTime());
        for (const [s, e] of taken) {
          if (e <= cursor || s >= close) continue;
          assert.ok(s - cursor < shortest * 60000, `a ${(s - cursor) / 60000}-minute gap is left on the ${day}th but a ${shortest}-minute task is unplaced`);
          cursor = Math.max(cursor, e);
        }
        assert.ok(close - cursor < shortest * 60000, `time is left at the end of the ${day}th`);
      }
    });
  });
});

describe("planner.js: gap between tasks", () => {
  const gapPlan = (tasks, gapMinutes, extra = {}) => {
    const now = extra.now || NOW;
    const args = {tasks, busy: [], now, horizon: horizonFor(now), timeZone: NZ, gapMinutes, ...extra};
    const result = planSchedule(args);
    const repaired = repairSchedule({items: result.items, tasks, busy: args.busy, now, horizon: args.horizon, timeZone: NZ, allTasks: args.allTasks || tasks, fixed: args.fixed || [], gapMinutes});
    assert.deepEqual(repaired.errors, []);
    assert.deepEqual(repaired.dropped, [], "the planner's output must pass the gap validation");
    return result;
  };
  it("leaves the gap between consecutive tasks", () => {
    const result = gapPlan([task("a", {order: 1}), task("b", {order: 2}), task("c", {order: 3})], 15);
    assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
    assert.deepEqual(times(result, "b"), ["2026-10-22T08:45:00+13:00", "2026-10-22T09:15:00+13:00"]);
    assert.deepEqual(times(result, "c"), ["2026-10-22T09:30:00+13:00", "2026-10-22T10:00:00+13:00"]);
  });
  it("changes nothing with a gap of 0, or none given", () => {
    const tasks = [task("a", {order: 1}), task("b", {order: 2})];
    assert.deepEqual(gapPlan(tasks, 0), planSchedule({tasks, busy: [], now: NOW, horizon: horizonFor(NOW), timeZone: NZ}));
    assert.deepEqual(times(gapPlan(tasks, 0), "b"), ["2026-10-22T08:30:00+13:00", "2026-10-22T09:00:00+13:00"]);
  });
  it("does not leave a gap after a calendar event, only between tasks", () => {
    const busy = [win("2026-10-22T08:00:00+13:00", "2026-10-22T09:00:00+13:00")];
    const result = gapPlan([task("a", {order: 1}), task("b", {order: 2})], 10, {busy});
    assert.deepEqual(times(result, "a"), ["2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
    assert.deepEqual(times(result, "b"), ["2026-10-22T09:40:00+13:00", "2026-10-22T10:10:00+13:00"]);
  });
  it("keeps the gap on both sides of a task, so a short task cannot squeeze in flush against one", () => {
    // 09:00-09:40 is open between two meetings. Long (30m) is urgent and goes first; Short (10m) then needs the gap too.
    const busy = [win("2026-10-22T08:00:00+13:00", "2026-10-22T09:00:00+13:00"), win("2026-10-22T09:40:00+13:00", "2026-10-22T19:00:00+13:00")];
    const result = gapPlan([task("long", {estimatedMinutes: 30, priority: "HIGH"}), task("short", {estimatedMinutes: 10, order: 2})], 5, {busy});
    assert.deepEqual(times(result, "long"), ["2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"]);
    assert.equal(slotOf(result, "short").startISO.slice(0, 10), "2026-10-23"); // 09:30-09:40 is only 10 minutes, and the 5-minute gap on each side leaves none
  });
  it("lets a gap push a task that would just have fitted to the next day", () => {
    const busy = [win("2026-10-22T08:00:00+13:00", "2026-10-22T18:00:00+13:00")];
    const tasks = [task("a", {estimatedMinutes: 30, order: 1}), task("b", {estimatedMinutes: 30, order: 2})];
    assert.deepEqual(times(gapPlan(tasks, 0, {busy}), "b"), ["2026-10-22T18:30:00+13:00", "2026-10-22T19:00:00+13:00"]);
    assert.equal(slotOf(gapPlan(tasks, 10, {busy}), "b").startISO.slice(0, 10), "2026-10-23");
  });
  it("does not pad all-day reminders", () => {
    const result = gapPlan([task("big", {estimatedMinutes: 700, order: 1}), task("a", {order: 2})], 30);
    assert.equal(slotOf(result, "big").isAllDay, true);
    assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
  });
  it("keeps project order with a gap", () => {
    const tasks = [task("one", {projectId: "p", projectOrder: 1, order: 1}), task("two", {projectId: "p", projectOrder: 2, order: 2})];
    const result = gapPlan(tasks, 20);
    assert.deepEqual(times(result, "one"), ["2026-10-22T08:00:00+13:00", "2026-10-22T08:30:00+13:00"]);
    assert.deepEqual(times(result, "two"), ["2026-10-22T08:50:00+13:00", "2026-10-22T09:20:00+13:00"]);
  });
  it("works around a lunch break given as busy time", () => {
    const lunch = win("2026-10-22T12:00:00+13:00", "2026-10-22T12:30:00+13:00");
    const tasks = [task("a", {estimatedMinutes: 230, order: 1}), task("b", {estimatedMinutes: 30, order: 2})];
    const result = gapPlan(tasks, 10, {busy: [lunch]});
    assert.deepEqual(times(result, "a"), ["2026-10-22T08:00:00+13:00", "2026-10-22T11:50:00+13:00"]);
    assert.deepEqual(times(result, "b"), ["2026-10-22T12:30:00+13:00", "2026-10-22T13:00:00+13:00"]);
  });
});

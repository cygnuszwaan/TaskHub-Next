/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {TICK_MS, MAX_LOOKBACK_MS, scheduledDate, weatherMoves, weatherMoveMessage, runFailedMessage, reminderWindow, dueReminders, reminderMessage, dayText, timeText} = require("../alerts");

const ZONE = "Pacific/Auckland";
const at = (iso) => Date.parse(iso);
const task = (id, extra = {}) => ({id, title: `Task ${id}`, tags: [], ...extra});

describe("alerts.js", () => {
  describe("scheduledDate", () => {
    it("takes an all-day date as it is and a timed slot on the owner's clock", () => {
      assert.equal(scheduledDate(ZONE, "2026-10-27"), "2026-10-27");
      assert.equal(scheduledDate(ZONE, "2026-10-27T09:00:00+13:00"), "2026-10-27");
      assert.equal(scheduledDate(ZONE, "2026-10-26T23:30:00Z"), "2026-10-27", "an instant late in UTC is already tomorrow in Auckland");
    });
    it("is null for anything else", () => {
      for (const v of [undefined, null, 5, "", "soon"]) assert.equal(scheduledDate(ZONE, v), null);
    });
  });

  describe("weatherMoves", () => {
    const today = "2026-10-25";
    const outdoor = (id, start, extra = {}) => task(id, {tags: ["Outdoor"], scheduledStart: start, ...extra});
    const run = (before, scheduled, rainyDates = ["2026-10-27"]) => weatherMoves({before, scheduled: new Map(Object.entries(scheduled)), rainyDates, today, timeZone: ZONE});

    it("reports a task booked on a now-rainy day that the run put on another day", () => {
      const r = run([outdoor("a", "2026-10-27T09:00:00+13:00")], {a: {start: "2026-10-28T09:00:00+13:00"}});
      assert.deepEqual(r, [{taskId: "a", title: "Task a", from: "2026-10-27", to: "2026-10-28"}]);
    });
    it("reports one that got no slot with a null day", () => {
      assert.deepEqual(run([outdoor("a", "2026-10-27T09:00:00+13:00")], {}), [{taskId: "a", title: "Task a", from: "2026-10-27", to: null}]);
    });
    it("handles an all-day booking", () => {
      assert.equal(run([outdoor("a", "2026-10-27")], {a: {start: "2026-10-26"}})[0].to, "2026-10-26");
    });
    it("ignores a task that stays on its day, even a rainy one", () => {
      assert.deepEqual(run([outdoor("a", "2026-10-27T09:00:00+13:00")], {a: {start: "2026-10-27T13:00:00+13:00"}}), []);
    });
    it("ignores a task booked on a dry day", () => {
      assert.deepEqual(run([outdoor("a", "2026-10-26T09:00:00+13:00")], {a: {start: "2026-10-28T09:00:00+13:00"}}), []);
    });
    it("ignores days already past, tasks never booked, pinned tasks and tasks without a weather tag", () => {
      const r = run([
        outdoor("past", "2026-10-24T09:00:00+13:00"),
        outdoor("never", undefined),
        outdoor("pinned", "2026-10-27T09:00:00+13:00", {locked: true}),
        task("indoor", {tags: ["Kitchen"], scheduledStart: "2026-10-27T09:00:00+13:00"}),
      ], {}, ["2026-10-24", "2026-10-27"]);
      assert.deepEqual(r, []);
    });
    it("counts Garden and any case of the tags", () => {
      assert.equal(run([task("g", {tags: ["garden"], scheduledStart: "2026-10-27T09:00:00+13:00"})], {}).length, 1);
    });
    it("reports nothing without rainy dates", () => {
      assert.deepEqual(run([outdoor("a", "2026-10-27T09:00:00+13:00")], {}, []), []);
      assert.deepEqual(weatherMoves({before: [outdoor("a", "2026-10-27T09:00:00+13:00")], scheduled: new Map(), rainyDates: undefined, today, timeZone: ZONE}), []);
    });
    it("keeps the order of the list and copes with junk input", () => {
      const r = run([outdoor("b", "2026-10-27T09:00:00+13:00"), outdoor("a", "2026-10-27T10:00:00+13:00")], {});
      assert.deepEqual(r.map((m) => m.taskId), ["b", "a"]);
      assert.deepEqual(weatherMoves({before: undefined, scheduled: undefined, rainyDates: ["2026-10-27"], today, timeZone: ZONE}), []);
    });
  });

  describe("text helpers", () => {
    it("writes a local date and time the way the page does", () => {
      assert.equal(dayText("2026-10-27"), "Tue 27 Oct");
      assert.match(timeText(ZONE, new Date("2026-10-27T09:30:00+13:00")), /^9:30 [ap]m$/i);
      assert.match(timeText(ZONE, new Date("2026-10-27T15:05:00+13:00")), /^3:05 [ap]m$/i);
    });
  });

  describe("weatherMoveMessage", () => {
    it("is null for no moves", () => {
      assert.equal(weatherMoveMessage([]), null);
      assert.equal(weatherMoveMessage(undefined), null);
    });
    it("names the day and the new day for one task", () => {
      const m = weatherMoveMessage([{taskId: "a", title: "Mow lawn", from: "2026-10-27", to: "2026-10-28"}]);
      assert.deepEqual(m, {title: "Rain on Tue 27 Oct", body: "Mow lawn is now on Wed 28 Oct.", tag: "weather-moved"});
    });
    it("says so when there is no dry slot", () => {
      assert.equal(weatherMoveMessage([{taskId: "a", title: "Mow lawn", from: "2026-10-27", to: null}]).body, "Mow lawn has no dry slot yet.");
    });
    it("summarizes several with the first few titles", () => {
      const moves = ["A", "B", "C", "D", "E"].map((t) => ({taskId: t, title: t, from: "2026-10-27", to: null}));
      const m = weatherMoveMessage(moves);
      assert.equal(m.title, "5 outdoor tasks moved off rainy days");
      assert.equal(m.body, "A, B, C and 2 more.");
    });
  });

  describe("runFailedMessage", () => {
    it("carries the error text, cut and on one line", () => {
      assert.deepEqual(runFailedMessage(new Error("Inserting events failed")), {title: "Automatic schedule failed", body: "Inserting events failed", tag: "run-failed"});
      assert.equal(runFailedMessage(new Error("a\n\nb   c")).body, "a b c");
      const long = runFailedMessage(new Error("x".repeat(500))).body;
      assert.equal(long.length, 200);
      assert.ok(long.endsWith("…"));
    });
    it("copes with a non-error", () => {
      assert.equal(runFailedMessage("boom").body, "boom");
      assert.equal(runFailedMessage(undefined).body, "Unknown error");
    });
  });

  describe("reminderWindow", () => {
    const now = new Date("2026-10-27T09:00:00+13:00");
    it("runs from the last check to now", () => {
      assert.deepEqual(reminderWindow({lastAt: "2026-10-27T08:45:00+13:00", now}), {from: at("2026-10-27T08:45:00+13:00"), to: now.getTime()});
    });
    it("looks back one tick when there has been no check or the stored one is unusable or in the future", () => {
      for (const lastAt of [null, undefined, "junk", "2026-10-27T10:00:00+13:00"]) {
        assert.deepEqual(reminderWindow({lastAt, now}), {from: now.getTime() - TICK_MS, to: now.getTime()});
      }
    });
    it("never looks back further than the limit", () => {
      assert.equal(reminderWindow({lastAt: "2026-10-26T09:00:00+13:00", now}).from, now.getTime() - MAX_LOOKBACK_MS);
    });
  });

  describe("dueReminders", () => {
    const from = at("2026-10-27T08:45:00+13:00");
    const to = at("2026-10-27T09:00:00+13:00");
    const startAt = (id, hhmm, extra = {}) => task(id, {scheduledStart: `2026-10-27T${hhmm}:00+13:00`, ...extra});
    const ids = (tasks, lead = 30) => dueReminders({tasks, from, to, leadMinutes: lead}).map((t) => t.id);

    it("picks the tasks whose reminder moment fell in the window", () => {
      assert.deepEqual(ids([startAt("a", "09:20"), startAt("b", "09:30")]), ["a", "b"], "08:50 and 09:00, the end included");
    });
    it("leaves out a moment at or before the window start (the previous check had it) and one after its end", () => {
      assert.deepEqual(ids([startAt("early", "09:15"), startAt("late", "09:31")]), [], "08:45 is the previous window's; 09:01 is the next");
    });
    it("uses the lead it is given", () => {
      assert.deepEqual(ids([startAt("a", "09:50"), startAt("b", "10:00"), startAt("c", "09:30")], 60), ["a", "b"], "09:30 is 08:30 less an hour: before the window");
      assert.deepEqual(ids([startAt("a", "09:50")], 30), []);
    });
    it("leaves out a task that has already started by the end of the window", () => {
      assert.deepEqual(ids([startAt("a", "08:59"), startAt("b", "09:00")], 5), []);
    });
    it("leaves out all-day, unscheduled, unusable and running-timer tasks", () => {
      assert.deepEqual(ids([task("day", {scheduledStart: "2026-10-27"}), task("none"), task("bad", {scheduledStart: "soon"}), startAt("run", "09:20", {timerStartedAt: "2026-10-27T08:00:00.000Z"})]), []);
    });
    it("lists the earliest start first and tolerates junk", () => {
      assert.deepEqual(ids([startAt("b", "09:30"), startAt("a", "09:20")]), ["a", "b"]);
      assert.deepEqual(dueReminders({tasks: undefined, from, to, leadMinutes: 30}), []);
    });
    it("does not modify its input", () => {
      const list = [startAt("b", "09:30"), startAt("a", "09:20")];
      ids(list);
      assert.deepEqual(list.map((t) => t.id), ["b", "a"]);
    });
  });

  describe("reminderMessage", () => {
    it("is null for none", () => {
      assert.equal(reminderMessage([], ZONE), null);
      assert.equal(reminderMessage(undefined, ZONE), null);
    });
    it("names the task and its start for one, with a tag of its own", () => {
      const m = reminderMessage([task("a", {title: "Paint fence", scheduledStart: "2026-10-27T09:30:00+13:00"})], ZONE);
      assert.equal(m.title, "Paint fence");
      assert.match(m.body, /^Starts at 9:30 [ap]m\.$/i);
      assert.equal(m.tag, "starting-a");
    });
    it("counts several and lists the first few", () => {
      const tasks = ["A", "B", "C", "D"].map((t, i) => task(t, {title: t, scheduledStart: `2026-10-27T09:${10 + i * 10}:00+13:00`}));
      const m = reminderMessage(tasks, ZONE);
      assert.equal(m.title, "4 tasks starting soon");
      assert.match(m.body, /^A 9:10 [ap]m, B 9:20 [ap]m, C 9:30 [ap]m and 1 more\.$/i);
      assert.equal(m.tag, "starting-soon");
    });
  });
});

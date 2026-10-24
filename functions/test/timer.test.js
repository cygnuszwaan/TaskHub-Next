/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {clearActive, isRunning, elapsedSeconds, pauseTimer, abortTimer, startTimer, setTimerInList, settleTimer} = require("../timer");

const T0 = Date.parse("2026-10-24T09:00:00.000Z");

describe("timer.js", () => {
  describe("isRunning and elapsedSeconds", () => {
    it("is not running without a usable start", () => {
      assert.equal(isRunning({}), false);
      assert.equal(isRunning({timerStartedAt: "nonsense"}), false);
      assert.equal(isRunning({timerStartedAt: "2026-10-24T09:00:00.000Z"}), true);
    });
    it("counts saved seconds plus the running stretch", () => {
      const task = {trackedSeconds: 90, timerStartedAt: new Date(T0).toISOString()};
      assert.equal(elapsedSeconds(task, T0 + 30000), 120);
      assert.equal(elapsedSeconds({trackedSeconds: 90}, T0), 90);
      assert.equal(elapsedSeconds({}, T0), 0);
    });
    it("ignores a start in the future, an unusable clock and an unusable saved value", () => {
      const task = {trackedSeconds: 10, timerStartedAt: new Date(T0).toISOString()};
      assert.equal(elapsedSeconds(task, T0 - 5000), 10);
      assert.equal(elapsedSeconds(task, NaN), 10);
      assert.equal(elapsedSeconds({trackedSeconds: -4}, T0), 0);
      assert.equal(elapsedSeconds({trackedSeconds: "x"}, T0), 0);
    });
  });

  describe("startTimer and pauseTimer", () => {
    it("starts a timer at the given instant and leaves a running one alone", () => {
      const started = startTimer({id: "a"}, T0);
      assert.equal(started.timerStartedAt, "2026-10-24T09:00:00.000Z");
      assert.equal(startTimer(started, T0 + 60000), started);
      assert.deepEqual(startTimer({id: "a"}, NaN), {id: "a"});
    });
    it("pauses by adding the stretch to the saved seconds and removing the start", () => {
      const paused = pauseTimer({id: "a", trackedSeconds: 60, timerStartedAt: new Date(T0).toISOString()}, T0 + 125000);
      assert.deepEqual(paused, {id: "a", trackedSeconds: 185});
      assert.equal("timerStartedAt" in paused, false);
    });
    it("returns a task that is not running as it is, and does not modify the input", () => {
      const idle = {id: "a", trackedSeconds: 5};
      assert.equal(pauseTimer(idle, T0), idle);
      const running = {id: "a", timerStartedAt: new Date(T0).toISOString()};
      pauseTimer(running, T0 + 1000);
      assert.deepEqual(running, {id: "a", timerStartedAt: new Date(T0).toISOString()});
    });
    it("stops an unusable start without adding time when the clock is unusable", () => {
      const out = pauseTimer({id: "a", trackedSeconds: 7, timerStartedAt: new Date(T0).toISOString()}, NaN);
      assert.deepEqual(out, {id: "a", trackedSeconds: 7});
    });
  });

  describe("firstStartedAt", () => {
    it("is set by the first start and kept by every later start and pause", () => {
      const first = startTimer({id: "a"}, T0);
      assert.equal(first.firstStartedAt, "2026-10-24T09:00:00.000Z");
      const paused = pauseTimer(first, T0 + 60000);
      assert.equal(paused.firstStartedAt, first.firstStartedAt);
      const again = startTimer(paused, T0 + 3600000);
      assert.equal(again.timerStartedAt, "2026-10-24T10:00:00.000Z");
      assert.equal(again.firstStartedAt, "2026-10-24T09:00:00.000Z");
    });
    it("is replaced only when the stored value is not a date, and is not set by an unusable clock", () => {
      assert.equal(startTimer({id: "a", firstStartedAt: "junk"}, T0).firstStartedAt, "2026-10-24T09:00:00.000Z");
      assert.equal("firstStartedAt" in startTimer({id: "a"}, NaN), false);
    });
    it("is not set by a start on another task, and goes to the archive with the task", () => {
      const tasks = setTimerInList([{id: "a"}, {id: "b"}], "a", "START", T0).tasks;
      const after = setTimerInList(tasks, "b", "START", T0 + 1000).tasks;
      assert.equal(after[0].firstStartedAt, "2026-10-24T09:00:00.000Z");
      assert.equal(after[1].firstStartedAt, "2026-10-24T09:00:01.000Z");
      assert.equal(settleTimer(after[0], T0 + 5000).firstStartedAt, "2026-10-24T09:00:00.000Z");
      assert.equal("firstStartedAt" in settleTimer({id: "c"}, T0), false);
    });
  });

  describe("setTimerInList", () => {
    const list = () => [
      {id: "a", order: 1, trackedSeconds: 30},
      {id: "b", order: 2, trackedSeconds: 0, timerStartedAt: new Date(T0).toISOString()},
      {id: "c", order: 3},
    ];

    it("returns null for an unknown task or action", () => {
      assert.equal(setTimerInList(list(), "zzz", "START", T0), null);
      assert.equal(setTimerInList(list(), "a", "TOGGLE", T0), null);
      assert.equal(setTimerInList(list(), "a", undefined, T0), null);
    });
    it("starts one timer and pauses any other that was running", () => {
      const r = setTimerInList(list(), "a", "start", T0 + 60000);
      assert.equal(r.task.id, "a");
      assert.equal(r.task.timerStartedAt, new Date(T0 + 60000).toISOString());
      assert.deepEqual(r.tasks.find((t) => t.id === "b"), {id: "b", order: 2, trackedSeconds: 60});
      assert.deepEqual(r.tasks.find((t) => t.id === "c"), {id: "c", order: 3});
    });
    it("pauses just the named task", () => {
      const r = setTimerInList(list(), "b", "PAUSE", T0 + 90000);
      assert.deepEqual(r.task, {id: "b", order: 2, trackedSeconds: 90});
      assert.deepEqual(r.tasks.find((t) => t.id === "a"), {id: "a", order: 1, trackedSeconds: 30});
    });
    it("is idempotent: starting a running timer or pausing a paused one changes nothing", () => {
      const tasks = list();
      assert.equal(setTimerInList(tasks, "b", "START", T0 + 5000).task.timerStartedAt, new Date(T0).toISOString());
      assert.deepEqual(setTimerInList(tasks, "c", "PAUSE", T0).task, {id: "c", order: 3});
    });
    it("does not modify the input list", () => {
      const tasks = list();
      setTimerInList(tasks, "a", "START", T0);
      assert.deepEqual(tasks, list());
    });
  });

  describe("abortTimer and ABORT", () => {
    const running = () => ({id: "a", order: 1, trackedSeconds: 20, active: true, firstStartedAt: new Date(T0).toISOString(), timerStartedAt: new Date(T0).toISOString()});

    it("stops the timer and erases the tracked time, the first-started time and the active mark", () => {
      assert.deepEqual(abortTimer(running()), {id: "a", order: 1});
    });
    it("does the same to a paused task, and leaves a never-started task as it is", () => {
      const {timerStartedAt, ...paused} = running(); // eslint-disable-line no-unused-vars
      assert.deepEqual(abortTimer(paused), {id: "a", order: 1});
      assert.deepEqual(abortTimer({id: "b", order: 2}), {id: "b", order: 2});
    });
    it("does not modify the task passed in", () => {
      const task = running();
      abortTimer(task);
      assert.deepEqual(task, running());
    });
    it("leaves a task that elapsedSeconds counts as 0 and that has no timer chip", () => {
      assert.equal(elapsedSeconds(abortTimer(running()), T0 + 90000), 0);
      assert.equal(isRunning(abortTimer(running())), false);
    });
    it("lets the next start begin from zero with a fresh first-started time", () => {
      const again = startTimer(abortTimer(running()), T0 + 7200000);
      assert.equal(again.firstStartedAt, "2026-10-24T11:00:00.000Z");
      assert.equal(elapsedSeconds(again, T0 + 7200000 + 30000), 30);
    });
    it("aborts just the named task on the list, accepts the action in any case, and touches no other task", () => {
      const list = [running(), {id: "b", order: 2, trackedSeconds: 5, active: true, firstStartedAt: new Date(T0).toISOString()}, {id: "c", order: 3}];
      const r = setTimerInList(list, "a", "abort", T0 + 40000);
      assert.deepEqual(r.task, {id: "a", order: 1});
      assert.deepEqual(r.tasks.find((t) => t.id === "b"), list[1]);
      assert.deepEqual(r.tasks.find((t) => t.id === "c"), {id: "c", order: 3});
      assert.equal(setTimerInList(list, "zzz", "ABORT", T0), null);
      assert.deepEqual(list[0], running(), "the input list is not modified");
    });
  });

  describe("settleTimer", () => {
    it("stops a running timer and always carries trackedSeconds, 0 for a task never timed", () => {
      assert.deepEqual(settleTimer({id: "a"}, T0), {id: "a", trackedSeconds: 0});
      assert.deepEqual(settleTimer({id: "a", trackedSeconds: 20, timerStartedAt: new Date(T0).toISOString()}, T0 + 40000), {id: "a", trackedSeconds: 60});
      assert.deepEqual(settleTimer({id: "a", trackedSeconds: 20}, T0), {id: "a", trackedSeconds: 20});
    });
  });

  describe("the active mark", () => {
    it("is set by a start, kept by a pause, and taken from every other task by the next start", () => {
      const tasks = [{id: "a", order: 1}, {id: "b", order: 2}];
      const afterA = setTimerInList(tasks, "a", "START", T0).tasks;
      assert.equal(afterA[0].active, true);
      assert.equal("active" in afterA[1], false);
      const paused = setTimerInList(afterA, "a", "PAUSE", T0 + 60000).tasks;
      assert.equal(paused[0].active, true, "a paused task stays active");
      assert.equal("timerStartedAt" in paused[0], false);
      const afterB = setTimerInList(paused, "b", "START", T0 + 120000).tasks;
      assert.equal("active" in afterB[0], false);
      assert.equal(afterB[1].active, true);
      assert.equal(afterB[0].trackedSeconds, 60, "the paused task keeps its time");
    });
    it("is not given to a task by pausing it", () => {
      const out = setTimerInList([{id: "a"}], "a", "PAUSE", T0).tasks[0];
      assert.equal("active" in out, false);
    });
    it("is left off a task as archived", () => {
      assert.equal("active" in settleTimer({id: "a", active: true, trackedSeconds: 5}, T0), false);
      assert.equal("active" in clearActive({id: "a", active: true}), false);
      const plain = {id: "a"};
      assert.equal(clearActive(plain), plain);
    });
  });
});

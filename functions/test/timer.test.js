/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {isRunning, elapsedSeconds, pauseTimer, startTimer, setTimerInList, settleTimer} = require("../timer");

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

  describe("settleTimer", () => {
    it("stops a running timer and always carries trackedSeconds, 0 for a task never timed", () => {
      assert.deepEqual(settleTimer({id: "a"}, T0), {id: "a", trackedSeconds: 0});
      assert.deepEqual(settleTimer({id: "a", trackedSeconds: 20, timerStartedAt: new Date(T0).toISOString()}, T0 + 40000), {id: "a", trackedSeconds: 60});
      assert.deepEqual(settleTimer({id: "a", trackedSeconds: 20}, T0), {id: "a", trackedSeconds: 20});
    });
  });
});

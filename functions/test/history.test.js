/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {ROLLING_WINDOW, roundToFive, normalizeSamples, normalizeCount, averageMinutes, normalizeHistory, recordCompletion} = require("../history");

describe("history.js", () => {
  describe("roundToFive", () => {
    it("rounds to the nearest 5 minutes, a half going up", () => {
      assert.equal(roundToFive(12), 10);
      assert.equal(roundToFive(12.5), 15);
      assert.equal(roundToFive(13), 15);
      assert.equal(roundToFive(47.4), 45);
      assert.equal(roundToFive(47.6), 50);
    });
    it("never goes below 5", () => {
      assert.equal(roundToFive(0.2), 5);
      assert.equal(roundToFive(2.4), 5);
      assert.equal(roundToFive(0), 5);
    });
  });

  describe("normalizeSamples", () => {
    it("keeps usable seconds, rounded, newest ROLLING_WINDOW only", () => {
      assert.equal(ROLLING_WINDOW, 5);
      assert.deepEqual(normalizeSamples([1, 2, 3, 4, 5, 6, 7]), [3, 4, 5, 6, 7]);
      assert.deepEqual(normalizeSamples([600.4, 0, -3, "9", NaN, null, 0.4, 59.6]), [600, 60]);
    });
    it("returns [] for anything but an array", () => {
      assert.deepEqual(normalizeSamples(undefined), []);
      assert.deepEqual(normalizeSamples("12"), []);
    });
  });

  describe("normalizeCount", () => {
    it("accepts whole numbers from 1 and gives 0 otherwise", () => {
      assert.equal(normalizeCount(3), 3);
      for (const bad of [0, -1, 2.5, "3", null, undefined, 1e7]) assert.equal(normalizeCount(bad), 0, String(bad));
    });
  });

  describe("averageMinutes", () => {
    it("averages the samples and rounds to 5 minutes", () => {
      assert.equal(averageMinutes([600, 900]), 15); // 12.5 min is 750 s: a half rounds up
      assert.equal(averageMinutes([1500, 1800, 2100]), 30);
      assert.equal(averageMinutes([2700]), 45);
    });
    it("is null without a usable sample", () => {
      assert.equal(averageMinutes([]), null);
      assert.equal(averageMinutes([0, -4]), null);
      assert.equal(averageMinutes(undefined), null);
    });
    it("averages only the latest window", () => {
      assert.equal(averageMinutes([36000, 600, 600, 600, 600, 600]), 10);
    });
  });

  describe("normalizeHistory", () => {
    it("keeps the usable parts only", () => {
      assert.deepEqual(normalizeHistory({completedCount: 4, recentSeconds: [600, 0, 900]}), {completedCount: 4, recentSeconds: [600, 900]});
      assert.deepEqual(normalizeHistory({completedCount: 2}), {completedCount: 2});
      assert.deepEqual(normalizeHistory({recentSeconds: [60]}), {recentSeconds: [60]});
    });
    it("is null when nothing is usable", () => {
      for (const bad of [null, undefined, [], "x", {}, {completedCount: 0, recentSeconds: []}]) assert.equal(normalizeHistory(bad), null);
    });
  });

  describe("recordCompletion", () => {
    it("counts the completion and adds the tracked time", () => {
      assert.deepEqual(recordCompletion({trackedSeconds: 600}), {completedCount: 1, recentSeconds: [600]});
      assert.deepEqual(recordCompletion({completedCount: 3, recentSeconds: [300, 900], trackedSeconds: 600}), {completedCount: 4, recentSeconds: [300, 900, 600]});
    });
    it("counts a task that was never timed without adding a sample, and leaves recentSeconds out when empty", () => {
      assert.deepEqual(recordCompletion({trackedSeconds: 0}), {completedCount: 1});
      assert.deepEqual(recordCompletion({completedCount: 2, recentSeconds: [600], trackedSeconds: 0}), {completedCount: 3, recentSeconds: [600]});
    });
    it("keeps only the newest ROLLING_WINDOW samples", () => {
      assert.deepEqual(recordCompletion({completedCount: 5, recentSeconds: [1, 2, 3, 4, 5], trackedSeconds: 6}), {completedCount: 6, recentSeconds: [2, 3, 4, 5, 6]});
    });
    it("starts from 1 when a stored count is unusable", () => {
      assert.equal(recordCompletion({completedCount: "x"}).completedCount, 1);
    });
  });
});

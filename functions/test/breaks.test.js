/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {lunchWindows, padWindows} = require("../breaks");

const NZ = "Pacific/Auckland";
// 07:00 NZDT on Thursday 22 Oct 2026
const NOW = new Date("2026-10-21T18:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const horizonFor = (now, days = 3) => new Date(now.getTime() + days * DAY_MS);
const LUNCH = {enabled: true, time: "12:30", minutes: 45};
const lunch = (extra = {}, now = NOW, horizon = horizonFor(now)) => lunchWindows({lunch: {...LUNCH, ...extra}, timeZone: NZ, now, horizon});

describe("breaks.js", () => {
  describe("lunchWindows", () => {
    it("gives one window per local day, at the configured local time and length", () => {
      assert.deepEqual(lunch(), [
        {start: "2026-10-21T23:30:00.000Z", end: "2026-10-22T00:15:00.000Z"}, // 12:30-13:15 on the 22nd (+13:00)
        {start: "2026-10-22T23:30:00.000Z", end: "2026-10-23T00:15:00.000Z"},
        {start: "2026-10-23T23:30:00.000Z", end: "2026-10-24T00:15:00.000Z"},
      ]);
    });
    it("gives nothing when disabled, missing or unusable", () => {
      assert.deepEqual(lunch({enabled: false}), []);
      assert.deepEqual(lunchWindows({lunch: undefined, timeZone: NZ, now: NOW, horizon: horizonFor(NOW)}), []);
      assert.deepEqual(lunch({time: "noon"}), []);
      assert.deepEqual(lunch({minutes: 0}), []);
      assert.deepEqual(lunch({enabled: "yes"}), []);
    });
    it("drops a lunch that is already over today and cuts one that is under way to now", () => {
      const after = new Date("2026-10-22T02:00:00.000Z"); // 15:00 on the 22nd
      assert.equal(lunch({}, after)[0].start, "2026-10-22T23:30:00.000Z"); // the 23rd's lunch is first
      const during = new Date("2026-10-22T00:00:00.000Z"); // 13:00 on the 22nd
      assert.deepEqual(lunch({}, during)[0], {start: "2026-10-22T00:00:00.000Z", end: "2026-10-22T00:15:00.000Z"});
    });
    it("cuts the last window at the horizon and drops one past it", () => {
      const horizon = new Date("2026-10-22T00:00:00.000Z"); // 13:00 on the 22nd, in the middle of lunch
      assert.deepEqual(lunch({}, NOW, horizon), [{start: "2026-10-21T23:30:00.000Z", end: "2026-10-22T00:00:00.000Z"}]);
      assert.deepEqual(lunch({}, NOW, new Date("2026-10-21T23:00:00.000Z")), []); // horizon at 12:00, before lunch
    });
    it("follows the clock through a daylight saving change", () => {
      // NZ clocks go forward at 2:00 on Sunday 27 Sep 2026 (+12:00 to +13:00)
      const now = new Date("2026-09-25T19:00:00Z"); // 07:00 on Saturday the 26th, +12:00
      const w = lunchWindows({lunch: {enabled: true, time: "12:00", minutes: 30}, timeZone: NZ, now, horizon: horizonFor(now, 2)});
      assert.deepEqual(w.slice(0, 2).map((x) => x.start), ["2026-09-26T00:00:00.000Z", "2026-09-26T23:00:00.000Z"]); // 12:00 at +12:00, then 12:00 at +13:00
    });
  });

  describe("padWindows", () => {
    const w = [{start: "2026-10-22T10:00:00.000Z", end: "2026-10-22T11:00:00.000Z"}];
    it("widens each window on both sides", () => {
      assert.deepEqual(padWindows(w, 10), [{start: "2026-10-22T09:50:00.000Z", end: "2026-10-22T11:10:00.000Z"}]);
    });
    it("keeps the same instants for no gap", () => {
      assert.deepEqual(padWindows(w, 0), w);
      assert.deepEqual(padWindows(w, undefined), w);
    });
    it("drops unusable windows and does not modify its input", () => {
      const input = [...w, {start: "x", end: "y"}, null, {start: "2026-10-22T12:00:00Z", end: "2026-10-22T12:00:00Z"}];
      const copy = structuredClone(input);
      assert.equal(padWindows(input, 5).length, 1);
      assert.deepEqual(input, copy);
      assert.deepEqual(padWindows(undefined, 5), []);
    });
  });
});

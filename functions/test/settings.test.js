/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {DEFAULTS, INTERVALS, mergeSettings, applySettingsUpdate, isRunDue, claimRun} = require("../settings");

const base = (extra = {}) => ({...mergeSettings(undefined), ...extra});
const sched = (schedule, extra = {}) => base({schedule: {...DEFAULTS.schedule, ...schedule}, ...extra});

describe("settings.js", () => {
  describe("mergeSettings", () => {
    it("returns the defaults for nothing stored", () => {
      for (const stored of [undefined, null, {}, "junk"]) {
        assert.deepEqual(mergeSettings(stored), {...DEFAULTS, location: {...DEFAULTS.location}, schedule: {...DEFAULTS.schedule}});
      }
      assert.equal(DEFAULTS.timeZone, "Pacific/Auckland");
      assert.equal(DEFAULTS.schedule.time, "20:00");
    });
    it("keeps valid stored fields and fills the rest from defaults", () => {
      const s = mergeSettings({timeZone: "Australia/Sydney", schedule: {frequency: "INTERVAL", intervalMinutes: 30}, location: {name: "Sydney"}});
      assert.equal(s.timeZone, "Australia/Sydney");
      assert.deepEqual(s.schedule, {enabled: true, frequency: "INTERVAL", time: "20:00", intervalMinutes: 30});
      assert.deepEqual(s.location, {name: "Sydney", latitude: DEFAULTS.location.latitude, longitude: DEFAULTS.location.longitude});
    });
    it("replaces unusable stored fields with their defaults, field by field", () => {
      const s = mergeSettings({timeZone: "Mars/Olympus", schedule: {enabled: "yes", time: "25:00", intervalMinutes: 7, frequency: "INTERVAL"}, location: {latitude: 200, longitude: 10}, lastAutoRunAt: "not a date", lastRunFingerprint: 5});
      assert.equal(s.timeZone, "Pacific/Auckland");
      assert.deepEqual(s.schedule, {...DEFAULTS.schedule, frequency: "INTERVAL"});
      assert.equal(s.location.latitude, DEFAULTS.location.latitude);
      assert.equal(s.location.longitude, 10);
      assert.equal(s.lastAutoRunAt, null);
      assert.equal(s.lastRunFingerprint, null);
    });
    it("keeps run state and does not modify its input or the defaults", () => {
      const stored = {lastAutoRunAt: "2026-10-22T07:00:00.000Z", lastRunFingerprint: "abc", schedule: {time: "06:30"}};
      const copy = structuredClone(stored);
      const s = mergeSettings(stored);
      assert.equal(s.lastAutoRunAt, "2026-10-22T07:00:00.000Z");
      assert.equal(s.lastRunFingerprint, "abc");
      assert.deepEqual(stored, copy);
      s.schedule.time = "01:00";
      assert.equal(DEFAULTS.schedule.time, "20:00");
    });
  });

  describe("applySettingsUpdate", () => {
    it("changes only the fields provided", () => {
      const r = applySettingsUpdate(base(), {schedule: {time: "07:15"}});
      assert.deepEqual(r.settings.schedule, {...DEFAULTS.schedule, time: "07:15"});
      assert.deepEqual(r.settings.location, DEFAULTS.location);
      assert.equal(r.settings.timeZone, "Pacific/Auckland");
    });
    it("accepts a full valid update, trimming the place name", () => {
      const r = applySettingsUpdate(base(), {
        location: {name: "  Perth, WA ", latitude: -31.95, longitude: 115.86},
        timeZone: "Australia/Perth",
        schedule: {enabled: false, frequency: "INTERVAL", intervalMinutes: 15},
      });
      assert.equal(r.error, undefined);
      assert.equal(r.settings.location.name, "Perth, WA");
      assert.equal(r.settings.timeZone, "Australia/Perth");
      assert.deepEqual(r.settings.schedule, {enabled: false, frequency: "INTERVAL", time: "20:00", intervalMinutes: 15});
    });
    it("accepts every allowed interval and rejects others", () => {
      for (const n of INTERVALS) assert.ok(applySettingsUpdate(base(), {schedule: {intervalMinutes: n}}).settings);
      for (const n of [0, 5, 45, "60", null]) assert.match(applySettingsUpdate(base(), {schedule: {intervalMinutes: n}}).error, /intervalMinutes/);
    });
    it("rejects invalid values with a named reason and applies nothing", () => {
      const cur = base();
      const cases = [
        [{timeZone: "Mars/Olympus"}, /timeZone/],
        [{timeZone: "+05:00"}, /timeZone/],
        [{timeZone: "auckland"}, /timeZone/],
        [{timeZone: 5}, /timeZone/],
        [{location: {name: ""}}, /name/],
        [{location: {name: "x".repeat(101)}}, /name/],
        [{location: {latitude: 91}}, /latitude/],
        [{location: {longitude: -181}}, /longitude/],
        [{location: {latitude: "1"}}, /latitude/],
        [{location: {longitude: NaN}}, /longitude/],
        [{schedule: {enabled: "true"}}, /enabled/],
        [{schedule: {frequency: "HOURLY"}}, /frequency/],
        [{schedule: {time: "7:15"}}, /time/],
        [{schedule: {time: "24:00"}}, /time/],
        [{schedule: "daily"}, /schedule must be an object/],
        [{location: [1, 2]}, /location must be an object/],
      ];
      for (const [patch, pattern] of cases) {
        const r = applySettingsUpdate(cur, patch);
        assert.match(r.error, pattern, JSON.stringify(patch));
        assert.equal(r.settings, undefined);
      }
      assert.match(applySettingsUpdate(cur, null).error, /object/);
      assert.match(applySettingsUpdate(cur, [1]).error, /object/);
    });
    it("applies nothing when one field of several is invalid", () => {
      const r = applySettingsUpdate(base(), {timeZone: "Australia/Sydney", schedule: {time: "bad"}});
      assert.ok(r.error);
      assert.equal(r.settings, undefined);
    });
    it("cannot set run state and carries the current run state over", () => {
      const cur = base({lastAutoRunAt: "2026-10-22T07:00:00.000Z", lastRunFingerprint: "abc"});
      const r = applySettingsUpdate(cur, {lastAutoRunAt: null, lastRunFingerprint: "evil", extra: 1});
      assert.equal(r.settings.lastAutoRunAt, "2026-10-22T07:00:00.000Z");
      assert.equal(r.settings.lastRunFingerprint, "abc");
      assert.equal("extra" in r.settings, false);
    });
    it("does not modify the current settings", () => {
      const cur = base();
      const copy = structuredClone(cur);
      applySettingsUpdate(cur, {timeZone: "Australia/Sydney", schedule: {time: "05:00"}});
      assert.deepEqual(cur, copy);
    });
  });

  describe("isRunDue", () => {
    // 2026-10-22 is NZDT (+13:00): 07:00 UTC = 20:00 NZ.
    const nz = (hhmm, date = "2026-10-22") => new Date(`${date}T${hhmm}:00+13:00`);

    it("never runs when disabled", () => {
      assert.equal(isRunDue(sched({enabled: false}), nz("20:30")), false);
      assert.equal(isRunDue(sched({enabled: false, frequency: "INTERVAL"}), nz("10:00")), false);
    });
    describe("DAILY", () => {
      it("waits for the configured local time", () => {
        assert.equal(isRunDue(sched({time: "20:00"}), nz("19:59")), false);
        assert.equal(isRunDue(sched({time: "20:00"}), nz("20:00")), true);
        assert.equal(isRunDue(sched({time: "20:00"}), nz("23:59")), true);
      });
      it("runs once per local date", () => {
        const ran = base({lastAutoRunAt: nz("20:01").toISOString()});
        assert.equal(isRunDue(ran, nz("20:15")), false);
        assert.equal(isRunDue(ran, nz("23:45")), false);
        assert.equal(isRunDue(ran, nz("20:00", "2026-10-23")), true);
      });
      it("catches up when a tick was missed", () => {
        assert.equal(isRunDue(base({lastAutoRunAt: nz("20:01", "2026-10-21").toISOString()}), nz("21:30")), true);
      });
      it("is due on a never-run schedule once the time has passed", () => {
        assert.equal(isRunDue(sched({time: "06:00"}), nz("06:00")), true);
      });
      it("uses the configured time zone for the time and the date", () => {
        // 20:00 in Sydney (AEDT, +11:00) is 22:00 in Auckland.
        const s = sched({time: "20:00"}, {timeZone: "Australia/Sydney"});
        assert.equal(isRunDue(s, new Date("2026-10-22T08:59:00Z")), false);
        assert.equal(isRunDue(s, new Date("2026-10-22T09:00:00Z")), true);
        // Ran at 20:30 Sydney on the 22nd; 00:30 Sydney on the 23rd is a new local date, but before 20:00.
        const ran = {...s, lastAutoRunAt: "2026-10-22T09:30:00Z"};
        assert.equal(isRunDue(ran, new Date("2026-10-22T13:30:00Z")), false);
        assert.equal(isRunDue(ran, new Date("2026-10-23T09:00:00Z")), true);
      });
      it("compares last-run date in the configured zone, not UTC", () => {
        // 20:30 NZDT on the 22nd is 07:30 UTC on the 22nd; 08:00 NZDT on the 23rd is still the 22nd in UTC.
        const ran = base({lastAutoRunAt: "2026-10-22T07:30:00Z", schedule: {...DEFAULTS.schedule, time: "08:00"}});
        assert.equal(isRunDue(ran, nz("08:00", "2026-10-23")), true);
      });
    });
    describe("INTERVAL", () => {
      const every = (n, extra = {}) => sched({frequency: "INTERVAL", intervalMinutes: n}, extra);
      it("only runs inside the 8:00-19:00 local window", () => {
        assert.equal(isRunDue(every(15), nz("07:59")), false);
        assert.equal(isRunDue(every(15), nz("08:00")), true);
        assert.equal(isRunDue(every(15), nz("18:59")), true);
        assert.equal(isRunDue(every(15), nz("19:00")), false);
        assert.equal(isRunDue(every(15), nz("23:00")), false);
      });
      it("is due when it has never run", () => {
        assert.equal(isRunDue(every(60), nz("12:00")), true);
      });
      it("waits for the interval since the last run", () => {
        const ran = every(60, {lastAutoRunAt: nz("10:00").toISOString()});
        assert.equal(isRunDue(ran, nz("10:15")), false);
        assert.equal(isRunDue(ran, nz("10:45")), false);
        assert.equal(isRunDue(ran, nz("11:00")), true);
      });
      it("tolerates a tick that fires a few seconds early relative to the last run", () => {
        const ran = every(15, {lastAutoRunAt: "2026-10-22T10:00:04+13:00"});
        assert.equal(isRunDue(ran, new Date("2026-10-22T10:15:01+13:00")), true);
        assert.equal(isRunDue(ran, new Date("2026-10-22T10:13:30+13:00")), false);
      });
      it("resumes in the morning after an evening or overnight gap", () => {
        const ran = every(240, {lastAutoRunAt: nz("18:00", "2026-10-21").toISOString()});
        assert.equal(isRunDue(ran, nz("07:45")), false);
        assert.equal(isRunDue(ran, nz("08:00")), true);
      });
      it("uses the configured time zone for the window", () => {
        const s = every(15, {timeZone: "Australia/Sydney"});
        // 08:00 Sydney (AEDT) = 21:00 UTC the day before.
        assert.equal(isRunDue(s, new Date("2026-10-21T20:59:00Z")), false);
        assert.equal(isRunDue(s, new Date("2026-10-21T21:00:00Z")), true);
      });
    });
  });

  describe("claimRun", () => {
    const nz = (hhmm, date = "2026-10-22") => new Date(`${date}T${hhmm}:00+13:00`);

    it("is not due before the time and leaves the settings as they are", () => {
      const s = base();
      const r = claimRun(s, nz("19:45"));
      assert.equal(r.due, false);
      assert.equal(r.settings, s);
    });
    it("is not due when disabled", () => {
      assert.equal(claimRun(sched({enabled: false}), nz("21:00")).due, false);
    });
    it("marks the run with the current instant when due, without modifying the input", () => {
      const s = base();
      const copy = structuredClone(s);
      const r = claimRun(s, nz("20:05"));
      assert.equal(r.due, true);
      assert.equal(r.settings.lastAutoRunAt, nz("20:05").toISOString());
      assert.deepEqual(s, copy);
      assert.deepEqual({...r.settings, lastAutoRunAt: null}, s);
    });
    it("claims a DAILY slot only once: the next tick sees the mark", () => {
      const first = claimRun(base(), nz("20:00"));
      assert.equal(first.due, true);
      assert.equal(claimRun(first.settings, nz("20:15")).due, false);
      assert.equal(claimRun(first.settings, nz("20:00", "2026-10-23")).due, true);
    });
    it("spaces INTERVAL claims by the interval", () => {
      const every30 = sched({frequency: "INTERVAL", intervalMinutes: 30});
      const first = claimRun(every30, nz("09:00"));
      assert.equal(first.due, true);
      assert.equal(claimRun(first.settings, nz("09:15")).due, false);
      assert.equal(claimRun(first.settings, nz("09:30")).due, true);
    });
    it("waits for the next due time after a run, whether or not it succeeded", () => {
      // The mark is made when the run starts; nothing here depends on the outcome.
      const claimed = claimRun(base(), nz("20:00")).settings;
      for (const t of ["20:15", "20:30", "21:00", "23:45"]) assert.equal(claimRun(claimed, nz(t)).due, false, t);
    });
  });
});

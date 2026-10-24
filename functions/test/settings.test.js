/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_CONTRACTOR_INFO, DEFAULTS, INTERVALS, mergeSettings, applySettingsUpdate, isRunDue, claimRun} = require("../settings");

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

  describe("scheduleDays", () => {
    it("defaults to 7 and keeps a stored valid value", () => {
      assert.equal(mergeSettings(undefined).scheduleDays, 7);
      assert.equal(mergeSettings({scheduleDays: 28}).scheduleDays, 28);
    });
    it("falls back to 7 for an unusable stored value", () => {
      for (const bad of [0, 29, 3.5, "14", null, NaN]) assert.equal(mergeSettings({scheduleDays: bad}).scheduleDays, 7);
    });
    it("is editable, alone, without touching the rest", () => {
      const r = applySettingsUpdate(base(), {scheduleDays: 21});
      assert.equal(r.settings.scheduleDays, 21);
      assert.deepEqual(r.settings.schedule, DEFAULTS.schedule);
    });
    it("rejects out-of-range and non-integer values, saving nothing", () => {
      for (const bad of [0, 29, 1.5, "7", null]) {
        const r = applySettingsUpdate(base(), {scheduleDays: bad});
        assert.match(r.error, /scheduleDays/);
        assert.equal(r.settings, undefined);
      }
    });
    it("accepts the bounds", () => {
      assert.equal(applySettingsUpdate(base(), {scheduleDays: 1}).settings.scheduleDays, 1);
      assert.equal(applySettingsUpdate(base(), {scheduleDays: 28}).settings.scheduleDays, 28);
    });
  });

  describe("job sheet contractor information", () => {
    it("is empty by default, and a stored value that is not text falls back to empty", () => {
      assert.deepEqual(mergeSettings(undefined).jobSheet, {contractorInfo: ""});
      assert.deepEqual(mergeSettings({jobSheet: {contractorInfo: 5}}).jobSheet, {contractorInfo: ""});
      assert.deepEqual(mergeSettings({jobSheet: {contractorInfo: "A Builder\n021 000 000"}}).jobSheet, {contractorInfo: "A Builder\n021 000 000"});
    });
    it("is saved with its line breaks, trailing spaces and blank lines at either end removed", () => {
      const r = applySettingsUpdate(base(), {jobSheet: {contractorInfo: "\r\n  A Builder Ltd  \r\nPh 021 000 000   \n\nGST 12-345-678\n\n"}});
      assert.equal(r.error, undefined);
      assert.equal(r.settings.jobSheet.contractorInfo, "  A Builder Ltd\nPh 021 000 000\n\nGST 12-345-678");
    });
    it("can be cleared with empty text, and is left alone by an update of other fields", () => {
      const withInfo = applySettingsUpdate(base(), {jobSheet: {contractorInfo: "A Builder"}}).settings;
      assert.equal(applySettingsUpdate(withInfo, {gapMinutes: 10}).settings.jobSheet.contractorInfo, "A Builder");
      assert.equal(applySettingsUpdate(withInfo, {jobSheet: {contractorInfo: "  \n "}}).settings.jobSheet.contractorInfo, "");
    });
    it("rejects text that is too long, anything that is not text, and a group that is not an object, saving nothing", () => {
      assert.equal(applySettingsUpdate(base(), {jobSheet: {contractorInfo: "x".repeat(MAX_CONTRACTOR_INFO)}}).error, undefined);
      assert.match(applySettingsUpdate(base(), {jobSheet: {contractorInfo: "x".repeat(MAX_CONTRACTOR_INFO + 1)}}).error, /at most 1000/);
      assert.match(applySettingsUpdate(base(), {jobSheet: {contractorInfo: 7}}).error, /must be text/);
      assert.match(applySettingsUpdate(base(), {jobSheet: "A Builder"}).error, /jobSheet must be an object/);
      assert.match(applySettingsUpdate(base(), {gapMinutes: 5, jobSheet: {contractorInfo: null}}).error, /must be text/);
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
      it("only runs inside the 8:00-20:00 local window", () => {
        assert.equal(isRunDue(every(15), nz("07:59")), false);
        assert.equal(isRunDue(every(15), nz("08:00")), true);
        assert.equal(isRunDue(every(15), nz("19:00")), true);
        assert.equal(isRunDue(every(15), nz("19:59")), true);
        assert.equal(isRunDue(every(15), nz("20:00")), false);
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

describe("settings.js: gap between tasks and lunch break", () => {
  const {MIN_GAP_MINUTES, MAX_GAP_MINUTES, MIN_LUNCH_MINUTES, MAX_LUNCH_MINUTES} = require("../settings");
  it("defaults to no gap and no lunch break (12:00 for 30 minutes once switched on)", () => {
    const s = mergeSettings(undefined);
    assert.equal(s.gapMinutes, 0);
    assert.deepEqual(s.lunch, {enabled: false, time: "12:00", minutes: 30});
  });
  it("keeps valid stored values and falls back field by field for unusable ones", () => {
    const s = mergeSettings({gapMinutes: 15, lunch: {enabled: true, time: "13:15", minutes: 45}});
    assert.equal(s.gapMinutes, 15);
    assert.deepEqual(s.lunch, {enabled: true, time: "13:15", minutes: 45});
    const bad = mergeSettings({gapMinutes: 90, lunch: {enabled: 1, time: "25:00", minutes: 2}});
    assert.equal(bad.gapMinutes, 0);
    assert.deepEqual(bad.lunch, DEFAULTS.lunch);
    assert.deepEqual(mergeSettings({lunch: {minutes: 60}}).lunch, {enabled: false, time: "12:00", minutes: 60});
  });
  it("does not let a returned lunch object change the defaults", () => {
    const s = mergeSettings(undefined);
    s.lunch.enabled = true;
    assert.equal(DEFAULTS.lunch.enabled, false);
  });
  it("is editable alone, and the bounds are accepted", () => {
    const current = mergeSettings({scheduleDays: 10});
    const r = applySettingsUpdate(current, {gapMinutes: 20});
    assert.equal(r.settings.gapMinutes, 20);
    assert.equal(r.settings.scheduleDays, 10);
    assert.deepEqual(r.settings.lunch, DEFAULTS.lunch);
    for (const gap of [MIN_GAP_MINUTES, MAX_GAP_MINUTES]) assert.equal(applySettingsUpdate(current, {gapMinutes: gap}).settings.gapMinutes, gap);
    for (const minutes of [MIN_LUNCH_MINUTES, MAX_LUNCH_MINUTES]) assert.equal(applySettingsUpdate(current, {lunch: {minutes}}).settings.lunch.minutes, minutes);
  });
  it("updates one lunch field without touching the others", () => {
    const current = mergeSettings({lunch: {enabled: true, time: "12:30", minutes: 40}});
    assert.deepEqual(applySettingsUpdate(current, {lunch: {time: "13:00"}}).settings.lunch, {enabled: true, time: "13:00", minutes: 40});
    assert.deepEqual(applySettingsUpdate(current, {lunch: {enabled: false}}).settings.lunch, {enabled: false, time: "12:30", minutes: 40});
  });
  it("rejects bad values with a named reason and saves nothing", () => {
    const current = mergeSettings(undefined);
    const cases = [
      [{gapMinutes: -1}, /gapMinutes/], [{gapMinutes: 61}, /gapMinutes/], [{gapMinutes: 2.5}, /gapMinutes/], [{gapMinutes: "10"}, /gapMinutes/], [{gapMinutes: null}, /gapMinutes/],
      [{lunch: {enabled: "yes"}}, /lunch\.enabled/], [{lunch: {time: "12:60"}}, /lunch\.time/], [{lunch: {time: ""}}, /lunch\.time/],
      [{lunch: {minutes: 4}}, /lunch\.minutes/], [{lunch: {minutes: 181}}, /lunch\.minutes/], [{lunch: {minutes: 30.5}}, /lunch\.minutes/],
      [{lunch: "noon"}, /lunch must be an object/],
    ];
    for (const [patch, message] of cases) {
      const r = applySettingsUpdate(current, patch);
      assert.match(r.error, message, JSON.stringify(patch));
      assert.equal(r.settings, undefined);
    }
    assert.match(applySettingsUpdate(current, {gapMinutes: 10, lunch: {minutes: 1}}).error, /lunch\.minutes/);
  });
  it("leaves the schedule's own time check as it was", () => {
    assert.match(applySettingsUpdate(mergeSettings(undefined), {schedule: {time: "7pm"}}).error, /schedule\.time/);
  });
});

describe("settings.js: daily window", () => {
  const {dayWindowMinutes, MIN_DAY_MINUTES} = require("../settings");
  it("defaults to 09:00-17:00", () => {
    assert.deepEqual(mergeSettings(undefined).day, {start: "09:00", end: "17:00"});
    assert.deepEqual(dayWindowMinutes(mergeSettings(undefined)), {dayStartMin: 540, dayEndMin: 1020});
  });
  it("agrees with the scheduler's default hours", () => {
    const {DAY_START_MIN, DAY_END_MIN} = require("../schedule");
    assert.deepEqual(dayWindowMinutes(undefined), {dayStartMin: DAY_START_MIN, dayEndMin: DAY_END_MIN});
  });
  it("keeps a valid stored window and falls back to both defaults for a bad one", () => {
    assert.deepEqual(mergeSettings({day: {start: "07:15", end: "21:00"}}).day, {start: "07:15", end: "21:00"});
    assert.deepEqual(mergeSettings({day: {start: "7am", end: "21:00"}}).day, {start: "09:00", end: "21:00"});
    assert.deepEqual(mergeSettings({day: {start: "18:00", end: "09:00"}}).day, {start: "09:00", end: "17:00"});
    assert.deepEqual(mergeSettings({day: {start: "09:00", end: "09:30"}}).day, {start: "09:00", end: "17:00"});
    assert.deepEqual(mergeSettings({day: "9-5"}).day, {start: "09:00", end: "17:00"});
  });
  it("does not let a returned window change the defaults", () => {
    mergeSettings(undefined).day.start = "03:00";
    assert.equal(mergeSettings(undefined).day.start, "09:00");
  });
  it("is editable one end at a time, and the whole window at once", () => {
    const current = mergeSettings(undefined);
    assert.deepEqual(applySettingsUpdate(current, {day: {end: "18:30"}}).settings.day, {start: "09:00", end: "18:30"});
    assert.deepEqual(applySettingsUpdate(current, {day: {start: "06:00"}}).settings.day, {start: "06:00", end: "17:00"});
    assert.deepEqual(applySettingsUpdate(current, {day: {start: "10:00", end: "11:00"}}).settings.day, {start: "10:00", end: "11:00"});
    assert.equal(MIN_DAY_MINUTES, 60);
  });
  it("rejects a malformed time, a window shorter than an hour and one that is backwards, saving nothing", () => {
    const current = mergeSettings(undefined);
    assert.match(applySettingsUpdate(current, {day: {start: "9:00"}}).error, /day\.start/);
    assert.match(applySettingsUpdate(current, {day: {end: "25:00"}}).error, /day\.end/);
    assert.match(applySettingsUpdate(current, {day: {end: "09:30"}}).error, /at least 60 minutes after day\.start/);
    assert.match(applySettingsUpdate(current, {day: {start: "17:00"}}).error, /at least 60 minutes after/);
    assert.match(applySettingsUpdate(current, {day: {start: "18:00", end: "08:00"}}).error, /at least 60 minutes after/);
    assert.match(applySettingsUpdate(current, {day: "9-5"}).error, /day must be an object/);
    assert.match(applySettingsUpdate(current, {gapMinutes: 10, day: {end: "09:00"}}).error, /day\.end/);
  });
  it("leaves the automatic run's own 8:00-20:00 window alone", () => {
    const s = base({day: {start: "10:00", end: "15:00"}, schedule: {...DEFAULTS.schedule, frequency: "INTERVAL", intervalMinutes: 15}});
    assert.equal(isRunDue(s, new Date("2026-10-22T08:15:00+13:00")), true);
  });
});

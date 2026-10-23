/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {localParts, localDate, localMinutesOfDay, utcOffsetMinutes, utcOffset, localDayStart, startOfLocalDay, formatLocalNow, addDays} = require("../time");

const NZ = "Pacific/Auckland";
const SYDNEY = "Australia/Sydney";
const LA = "America/Los_Angeles";

// NZ daylight saving in 2026: NZST (+12:00) until 03:00 on 5 April, NZDT (+13:00) from 02:00 on 27 September.
// Sydney: AEDT (+11:00) until 03:00 on 5 April, from 02:00 on 4 October. Los Angeles: PDT (-07:00) from 8 March
// to 1 November, PST (-08:00) otherwise.
describe("time.js", () => {
  describe("a zone is required", () => {
    it("throws instead of falling back to the server's zone", () => {
      const now = new Date("2026-10-22T00:00:00Z");
      for (const zone of [undefined, null, "", 5]) {
        assert.throws(() => localDate(zone, now), /time zone is required/);
        assert.throws(() => localMinutesOfDay(zone, now), /time zone is required/);
        assert.throws(() => utcOffset(zone, now), /time zone is required/);
        assert.throws(() => formatLocalNow(zone, now), /time zone is required/);
        assert.throws(() => startOfLocalDay(zone, now), /time zone is required/);
      }
    });
    it("rejects an unknown zone", () => {
      assert.throws(() => localDate("Mars/Olympus", new Date()), RangeError);
    });
  });

  describe("localDate", () => {
    it("returns the local calendar date, not the UTC one", () => {
      assert.equal(localDate(NZ, new Date("2026-10-21T20:00:00Z")), "2026-10-22");
    });
    it("stays on the previous local day until local midnight", () => {
      assert.equal(localDate(NZ, new Date("2026-10-21T10:59:00Z")), "2026-10-21");
      assert.equal(localDate(NZ, new Date("2026-10-21T11:00:00Z")), "2026-10-22");
    });
    it("follows the zone: the same instant is a different date elsewhere", () => {
      const instant = new Date("2026-10-22T03:00:00Z");
      assert.equal(localDate(NZ, instant), "2026-10-22");
      assert.equal(localDate(LA, instant), "2026-10-21");
      assert.equal(localDate("UTC", instant), "2026-10-22");
    });
    it("defaults to now", () => {
      assert.match(localDate(NZ), /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("localParts", () => {
    it("gives the local date and minutes since midnight together", () => {
      assert.deepEqual(localParts(NZ, new Date("2026-10-21T20:30:00Z")), {date: "2026-10-22", minutes: 9 * 60 + 30});
      assert.deepEqual(localParts(LA, new Date("2026-10-22T03:15:00Z")), {date: "2026-10-21", minutes: 20 * 60 + 15});
    });
  });

  describe("utcOffset", () => {
    it("is +13:00 in NZ summer and +12:00 in winter", () => {
      assert.equal(utcOffset(NZ, new Date("2026-10-22T00:00:00Z")), "+13:00");
      assert.equal(utcOffset(NZ, new Date("2026-07-01T00:00:00Z")), "+12:00");
    });
    it("switches exactly at the NZ spring-forward changeover", () => {
      assert.equal(utcOffset(NZ, new Date("2026-09-26T13:59:00Z")), "+12:00");
      assert.equal(utcOffset(NZ, new Date("2026-09-26T14:00:00Z")), "+13:00");
    });
    it("switches exactly at the NZ fall-back changeover", () => {
      assert.equal(utcOffset(NZ, new Date("2026-04-04T13:59:00Z")), "+13:00");
      assert.equal(utcOffset(NZ, new Date("2026-04-04T14:00:00Z")), "+12:00");
    });
    it("handles other zones: negative, UTC, half-hour and quarter-hour offsets", () => {
      assert.equal(utcOffset(LA, new Date("2026-07-01T00:00:00Z")), "-07:00");
      assert.equal(utcOffset(LA, new Date("2026-12-01T00:00:00Z")), "-08:00");
      assert.equal(utcOffset("UTC", new Date("2026-07-01T00:00:00Z")), "+00:00");
      assert.equal(utcOffset("Asia/Kolkata", new Date("2026-07-01T00:00:00Z")), "+05:30");
      assert.equal(utcOffset("America/St_Johns", new Date("2026-12-01T00:00:00Z")), "-03:30");
      assert.equal(utcOffset("Pacific/Chatham", new Date("2026-07-01T00:00:00Z")), "+12:45");
    });
    it("reports minutes too", () => {
      assert.equal(utcOffsetMinutes(NZ, new Date("2026-10-22T00:00:00Z")), 780);
      assert.equal(utcOffsetMinutes(LA, new Date("2026-07-01T00:00:00Z")), -420);
      assert.equal(utcOffsetMinutes("America/St_Johns", new Date("2026-12-01T00:00:00Z")), -210);
      assert.equal(utcOffsetMinutes("UTC", new Date("2026-07-01T00:00:00Z")), 0);
    });
  });

  describe("startOfLocalDay", () => {
    it("returns 00:00 local time of the local day containing the instant", () => {
      assert.equal(startOfLocalDay(NZ, new Date("2026-10-22T05:00:00Z")).toISOString(), "2026-10-21T11:00:00.000Z");
    });
    it("uses the previous local day just before local midnight", () => {
      assert.equal(startOfLocalDay(NZ, new Date("2026-10-21T10:59:00Z")).toISOString(), "2026-10-20T11:00:00.000Z");
    });
    it("works in other zones", () => {
      assert.equal(startOfLocalDay(LA, new Date("2026-10-22T03:00:00Z")).toISOString(), "2026-10-21T07:00:00.000Z");
      assert.equal(startOfLocalDay("Asia/Kolkata", new Date("2026-10-22T03:00:00Z")).toISOString(), "2026-10-21T18:30:00.000Z");
    });
  });

  describe("formatLocalNow", () => {
    it("formats date and time in the zone's local time", () => {
      const text = formatLocalNow(NZ, new Date("2026-10-21T20:00:00Z")); // 09:00 NZDT on 22 Oct
      assert.match(text, /22 October 2026/);
      assert.match(text, /9:00/);
    });
    it("follows the zone", () => {
      const text = formatLocalNow(LA, new Date("2026-10-21T20:00:00Z")); // 13:00 PDT on 21 Oct
      assert.match(text, /21 October 2026/);
      assert.match(text, /1:00/);
    });
  });

  describe("localMinutesOfDay", () => {
    it("counts minutes since local midnight", () => {
      assert.equal(localMinutesOfDay(NZ, new Date("2026-10-21T20:30:00Z")), 9 * 60 + 30);
      assert.equal(localMinutesOfDay(LA, new Date("2026-10-21T20:30:00Z")), 13 * 60 + 30);
    });
    it("is 0 at local midnight and 1439 a minute before", () => {
      assert.equal(localMinutesOfDay(NZ, new Date("2026-10-21T11:00:00Z")), 0);
      assert.equal(localMinutesOfDay(NZ, new Date("2026-10-22T10:59:00Z")), 23 * 60 + 59);
    });
  });

  describe("localDayStart", () => {
    it("returns local midnight for a normal date", () => {
      assert.equal(localDayStart(NZ, "2026-10-22").toISOString(), "2026-10-21T11:00:00.000Z");
      assert.equal(localDayStart(NZ, "2026-07-01").toISOString(), "2026-06-30T12:00:00.000Z");
    });
    it("uses the pre-changeover offset on the NZ spring-forward day", () => {
      assert.equal(localDayStart(NZ, "2026-09-27").toISOString(), "2026-09-26T12:00:00.000Z");
    });
    it("uses the pre-changeover offset on the NZ fall-back day", () => {
      assert.equal(localDayStart(NZ, "2026-04-05").toISOString(), "2026-04-04T11:00:00.000Z");
    });
    it("makes a changeover day 23 or 25 hours long", () => {
      const hours = (zone, a, b) => (localDayStart(zone, b) - localDayStart(zone, a)) / 3600000;
      assert.equal(hours(NZ, "2026-09-27", "2026-09-28"), 23);
      assert.equal(hours(NZ, "2026-04-05", "2026-04-06"), 25);
      assert.equal(hours(SYDNEY, "2026-10-04", "2026-10-05"), 23);
      assert.equal(hours(SYDNEY, "2026-04-05", "2026-04-06"), 25);
      assert.equal(hours(LA, "2026-03-08", "2026-03-09"), 23);
      assert.equal(hours(LA, "2026-11-01", "2026-11-02"), 25);
    });
    it("works west of UTC and in half-hour zones", () => {
      assert.equal(localDayStart(LA, "2026-10-22").toISOString(), "2026-10-22T07:00:00.000Z");
      assert.equal(localDayStart(LA, "2026-12-01").toISOString(), "2026-12-01T08:00:00.000Z");
      assert.equal(localDayStart("Asia/Kolkata", "2026-10-22").toISOString(), "2026-10-21T18:30:00.000Z");
      assert.equal(localDayStart("UTC", "2026-10-22").toISOString(), "2026-10-22T00:00:00.000Z");
    });
    it("is always the first instant of the date", () => {
      for (const zone of [NZ, SYDNEY, LA, "Asia/Kolkata", "Pacific/Chatham", "America/St_Johns", "Europe/London"]) {
        for (const date of ["2026-03-08", "2026-03-29", "2026-04-05", "2026-09-27", "2026-10-04", "2026-10-25", "2026-11-01", "2026-12-31"]) {
          const start = localDayStart(zone, date);
          assert.equal(localDate(zone, start), date, `${zone} ${date}`);
          assert.equal(localDate(zone, new Date(start.getTime() - 60000)), addDays(date, -1), `${zone} ${date} minus a minute`);
        }
      }
    });
    it("starts after a changeover that skips midnight", () => {
      // Cuba moved its clocks from 00:00 to 01:00 on 8 March 2026, so that day begins at 01:00 CDT (05:00 UTC).
      assert.equal(localDayStart("America/Havana", "2026-03-08").toISOString(), "2026-03-08T05:00:00.000Z");
    });
  });

  describe("addDays", () => {
    it("adds and subtracts across month and year boundaries", () => {
      assert.equal(addDays("2026-10-31", 1), "2026-11-01");
      assert.equal(addDays("2026-12-31", 1), "2027-01-01");
      assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    });
    it("handles leap days", () => {
      assert.equal(addDays("2028-02-28", 1), "2028-02-29");
      assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    });
    it("handles zero and larger shifts", () => {
      assert.equal(addDays("2026-10-22", 0), "2026-10-22");
      assert.equal(addDays("2026-10-22", 7), "2026-10-29");
    });
  });
});

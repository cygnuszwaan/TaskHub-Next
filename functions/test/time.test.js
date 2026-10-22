/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {TIME_ZONE, getNZDate, getNZOffset, getNZStartOfDay, formatNZNow, getNZMinutesOfDay, getNZDayStart, addDays} = require("../time");

// NZ daylight saving in 2026: NZST (+12:00) until 03:00 on 5 April, NZDT (+13:00) from 02:00 on 27 September.
describe("time.js", () => {
  it("uses the Auckland time zone", () => {
    assert.equal(TIME_ZONE, "Pacific/Auckland");
  });

  describe("getNZDate", () => {
    it("returns the NZ calendar date, not the UTC one", () => {
      assert.equal(getNZDate(new Date("2026-10-21T20:00:00Z")), "2026-10-22");
    });
    it("stays on the previous NZ day until local midnight", () => {
      assert.equal(getNZDate(new Date("2026-10-21T10:59:00Z")), "2026-10-21");
      assert.equal(getNZDate(new Date("2026-10-21T11:00:00Z")), "2026-10-22");
    });
  });

  describe("getNZOffset", () => {
    it("is +13:00 in summer and +12:00 in winter", () => {
      assert.equal(getNZOffset(new Date("2026-10-22T00:00:00Z")), "+13:00");
      assert.equal(getNZOffset(new Date("2026-07-01T00:00:00Z")), "+12:00");
    });
    it("switches exactly at the spring-forward changeover", () => {
      assert.equal(getNZOffset(new Date("2026-09-26T13:59:00Z")), "+12:00");
      assert.equal(getNZOffset(new Date("2026-09-26T14:00:00Z")), "+13:00");
    });
    it("switches exactly at the fall-back changeover", () => {
      assert.equal(getNZOffset(new Date("2026-04-04T13:59:00Z")), "+13:00");
      assert.equal(getNZOffset(new Date("2026-04-04T14:00:00Z")), "+12:00");
    });
  });

  describe("getNZStartOfDay", () => {
    it("returns 00:00 NZ time of the NZ day containing the instant", () => {
      assert.equal(getNZStartOfDay(new Date("2026-10-22T05:00:00Z")).toISOString(), "2026-10-21T11:00:00.000Z");
    });
    it("uses the previous NZ day just before local midnight", () => {
      assert.equal(getNZStartOfDay(new Date("2026-10-21T10:59:00Z")).toISOString(), "2026-10-20T11:00:00.000Z");
    });
  });

  describe("formatNZNow", () => {
    it("formats date and time in NZ local time", () => {
      const text = formatNZNow(new Date("2026-10-21T20:00:00Z")); // 09:00 NZDT on 22 Oct
      assert.match(text, /22 October 2026/);
      assert.match(text, /9:00/);
    });
  });

  describe("getNZMinutesOfDay", () => {
    it("counts minutes since NZ midnight", () => {
      assert.equal(getNZMinutesOfDay(new Date("2026-10-21T20:30:00Z")), 9 * 60 + 30);
    });
    it("is 0 at NZ midnight and 1439 a minute before", () => {
      assert.equal(getNZMinutesOfDay(new Date("2026-10-21T11:00:00Z")), 0);
      assert.equal(getNZMinutesOfDay(new Date("2026-10-22T10:59:00Z")), 23 * 60 + 59);
    });
  });

  describe("getNZDayStart", () => {
    it("returns NZ midnight for a normal date", () => {
      assert.equal(getNZDayStart("2026-10-22").toISOString(), "2026-10-21T11:00:00.000Z");
      assert.equal(getNZDayStart("2026-07-01").toISOString(), "2026-06-30T12:00:00.000Z");
    });
    it("uses the pre-changeover offset on the spring-forward day", () => {
      assert.equal(getNZDayStart("2026-09-27").toISOString(), "2026-09-26T12:00:00.000Z");
    });
    it("uses the pre-changeover offset on the fall-back day", () => {
      assert.equal(getNZDayStart("2026-04-05").toISOString(), "2026-04-04T11:00:00.000Z");
    });
    it("makes a changeover day 23 or 25 hours long", () => {
      const hours = (a, b) => (getNZDayStart(b) - getNZDayStart(a)) / 3600000;
      assert.equal(hours("2026-09-27", "2026-09-28"), 23);
      assert.equal(hours("2026-04-05", "2026-04-06"), 25);
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

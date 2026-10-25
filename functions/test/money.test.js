/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_HOURLY_RATE, MAX_MATERIAL_COST, normalizeMoney, normalizeHourlyRate, normalizeMaterialCost} = require("../money");

describe("money.js normalizeMoney", () => {
  it("accepts numbers and plain decimal text, rounded to cents", () => {
    assert.equal(normalizeMoney(12, 100), 12);
    assert.equal(normalizeMoney(12.345, 100), 12.35);
    assert.equal(normalizeMoney("45.5", 100), 45.5);
    assert.equal(normalizeMoney(" 7 ", 100), 7);
    assert.equal(normalizeMoney(0, 100), 0);
    assert.equal(normalizeMoney(0.1 + 0.2, 100), 0.3);
  });
  it("gives null for null and empty text", () => {
    for (const v of [null, "", "   "]) assert.equal(normalizeMoney(v, 100), null);
  });
  it("gives undefined for anything unusable", () => {
    for (const v of [undefined, -1, "-1", NaN, Infinity, "abc", "1e3", "1,000", "$5", "5.", ".5", true, {}, [], 100.01, "100.01", "1234567890"]) assert.equal(normalizeMoney(v, 100), undefined, String(v));
  });
  it("allows the maximum itself", () => {
    assert.equal(normalizeMoney(100, 100), 100);
    assert.equal(normalizeMoney("100.00", 100), 100);
  });
});

describe("money.js rate and cost", () => {
  it("treats a rate of 0 as none and keeps a cost of 0", () => {
    assert.equal(normalizeHourlyRate(0), null);
    assert.equal(normalizeHourlyRate("0.00"), null);
    assert.equal(normalizeMaterialCost(0), 0);
  });
  it("applies each one's own limit", () => {
    assert.equal(normalizeHourlyRate(MAX_HOURLY_RATE), MAX_HOURLY_RATE);
    assert.equal(normalizeHourlyRate(MAX_HOURLY_RATE + 1), undefined);
    assert.equal(normalizeMaterialCost(MAX_HOURLY_RATE + 1), MAX_HOURLY_RATE + 1);
    assert.equal(normalizeMaterialCost(MAX_MATERIAL_COST + 1), undefined);
  });
});

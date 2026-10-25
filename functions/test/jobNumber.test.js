/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {normalizeJobNumber, lastIssued, formatJobNumber} = require("../jobNumber");

describe("jobNumber.js", () => {
  it("accepts whole numbers from 1 and nothing else", () => {
    assert.equal(normalizeJobNumber(1), 1);
    assert.equal(normalizeJobNumber(999999), 999999);
    for (const v of [0, -1, 1.5, "7", null, undefined, NaN, Infinity, {}]) assert.equal(normalizeJobNumber(v), null);
  });
  it("reads the last number issued from the counter document, 0 when there is none or it is unusable", () => {
    assert.equal(lastIssued({last: 41}), 41);
    assert.equal(lastIssued({last: 0}), 0);
    for (const v of [undefined, null, {}, {last: -3}, {last: 2.5}, {last: "9"}]) assert.equal(lastIssued(v), 0);
  });
  it("prints plain digits with no padding, and nothing for an unusable value", () => {
    assert.equal(formatJobNumber(1), "1");
    assert.equal(formatJobNumber(123), "123");
    assert.equal(formatJobNumber(999999), "999999");
    assert.equal(formatJobNumber(1000000), "1000000");
    for (const v of [undefined, null, 0, "12", 1.5]) assert.equal(formatJobNumber(v), "");
  });
});

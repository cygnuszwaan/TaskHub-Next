/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {toCents, formatMoney, usableRate, billedMinutes, materialsCents, entryFigures, sumFigures, isInvoice, figuresText} = require("../invoice");

describe("invoice.js", () => {
  it("converts dollars to whole cents without float drift", () => {
    assert.equal(toCents(19.99), 1999);
    assert.equal(toCents(0.1 + 0.2), 30);
  });
  it("formats cents as New Zealand dollars with a plain space or none", () => {
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(123456), "$1,234.56");
    assert.equal(formatMoney(5), "$0.05");
    assert.ok(!/[\u00a0\u202f]/.test(formatMoney(100000000)));
  });
  it("uses a rate only when it is a number above 0", () => {
    assert.equal(usableRate(85), 85);
    for (const bad of [0, -1, null, undefined, "85", NaN, Infinity]) assert.equal(usableRate(bad), null);
  });
  it("bills tracked time to the minute, else the estimate, else nothing", () => {
    assert.equal(billedMinutes({trackedSeconds: 1500}), 25);
    assert.equal(billedMinutes({trackedSeconds: 89}), 1);
    assert.equal(billedMinutes({trackedSeconds: 29, estimatedMinutes: 30}), 0);
    assert.equal(billedMinutes({trackedSeconds: 0, estimatedMinutes: 30}), 30);
    assert.equal(billedMinutes({estimatedMinutes: 30.4}), 30);
    assert.equal(billedMinutes({}), 0);
  });
  it("sums the costs of the materials that have one and says whether any does", () => {
    assert.deepEqual(materialsCents({materials: [{text: "a", cost: 2.5}, {text: "b"}, {text: "c", cost: 0.1}, {text: "d", cost: "9"}, {text: "e", cost: -1}, null]}), {cents: 260, hasCosts: true});
    assert.deepEqual(materialsCents({materials: [{text: "a", cost: 0}]}), {cents: 0, hasCosts: true});
    assert.deepEqual(materialsCents({materials: [{text: "a"}]}), {cents: 0, hasCosts: false});
    assert.deepEqual(materialsCents({}), {cents: 0, hasCosts: false});
  });
  it("works out labour, materials and total for one task", () => {
    const row = {trackedSeconds: 3600, materials: [{text: "a", cost: 10.25}]};
    assert.deepEqual(entryFigures(row, 80), {labour: 8000, materials: 1025, total: 9025, hasCosts: true});
    assert.deepEqual(entryFigures(row, null), {labour: 0, materials: 1025, total: 1025, hasCosts: true});
    assert.equal(entryFigures({trackedSeconds: 1500}, 85).labour, 3542);
  });
  it("sums figures and keeps hasCosts if any has them", () => {
    const sum = sumFigures([{labour: 100, materials: 0, total: 100, hasCosts: false}, {labour: 50, materials: 25, total: 75, hasCosts: true}]);
    assert.deepEqual(sum, {labour: 150, materials: 25, total: 175, hasCosts: true});
    assert.deepEqual(sumFigures([]), {labour: 0, materials: 0, total: 0, hasCosts: false});
  });
  it("is an invoice with a rate or any cost", () => {
    assert.equal(isInvoice(85, []), true);
    assert.equal(isInvoice(null, [{hasCosts: false}, {hasCosts: true}]), true);
    assert.equal(isInvoice(null, [{hasCosts: false}]), false);
    assert.equal(isInvoice(0, []), false);
  });
  it("prints only the lines that mean something", () => {
    const f = {labour: 8000, materials: 0, total: 8000, hasCosts: false};
    assert.deepEqual(figuresText(f, 80), {labour: "$80.00", materials: "", total: "$80.00"});
    assert.deepEqual(figuresText({...f, hasCosts: true}, 80), {labour: "$80.00", materials: "$0.00", total: "$80.00"});
    assert.deepEqual(figuresText({labour: 0, materials: 500, total: 500, hasCosts: true}, null), {labour: "", materials: "$5.00", total: "$5.00"});
  });
});

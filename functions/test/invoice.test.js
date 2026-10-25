/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {toCents, formatMoney, usableRate, billedMinutes, materialsCents, travelTenths, travelText, entryFigures, sumFigures, isInvoice, figuresText} = require("../invoice");

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
    assert.deepEqual(entryFigures(row, 80), {labour: 8000, materials: 1025, travel: 0, travelTenths: 0, total: 9025, hasCosts: true, hasTravel: false});
    assert.deepEqual(entryFigures(row, null), {labour: 0, materials: 1025, travel: 0, travelTenths: 0, total: 1025, hasCosts: true, hasTravel: false});
    assert.equal(entryFigures({trackedSeconds: 1500}, 85).labour, 3542);
  });
  it("sums figures and keeps hasCosts if any has them", () => {
    const sum = sumFigures([{labour: 100, materials: 0, total: 100, hasCosts: false}, {labour: 50, materials: 25, total: 75, hasCosts: true}]);
    assert.deepEqual(sum, {labour: 150, materials: 25, travel: 0, travelTenths: 0, total: 175, hasCosts: true, hasTravel: false});
    assert.deepEqual(sumFigures([]), {labour: 0, materials: 0, travel: 0, travelTenths: 0, total: 0, hasCosts: false, hasTravel: false});
  });
  it("is an invoice with a rate or any cost", () => {
    assert.equal(isInvoice(85, []), true);
    assert.equal(isInvoice(null, [{hasCosts: false}, {hasCosts: true}]), true);
    assert.equal(isInvoice(null, [{hasCosts: false}]), false);
    assert.equal(isInvoice(0, []), true);
    assert.equal(isInvoice(-1, []), false);
  });
  it("bills labour at a rate of 0 as $0.00 (a client's unpaid work)", () => {
    const row = {trackedSeconds: 3600, materials: [{text: "Paint", cost: 12.5}]};
    const f = entryFigures(row, 0, null);
    assert.equal(f.labour, 0);
    assert.equal(f.total, 1250);
    assert.equal(figuresText(f, 0).labour, "$0.00");
    assert.equal(figuresText(f, null).labour, "");
  });
  it("prints only the lines that mean something", () => {
    const f = {labour: 8000, materials: 0, total: 8000, hasCosts: false};
    assert.deepEqual(figuresText(f, 80), {labour: "$80.00", materials: "", travel: "", travelKm: "", total: "$80.00"});
    assert.deepEqual(figuresText({...f, hasCosts: true}, 80), {labour: "$80.00", materials: "$0.00", travel: "", travelKm: "", total: "$80.00"});
    assert.deepEqual(figuresText({labour: 0, materials: 500, total: 500, hasCosts: true}, null), {labour: "", materials: "$5.00", travel: "", travelKm: "", total: "$5.00"});
  });
  describe("travel", () => {
    it("bills the km at the travel rate in whole cents and adds it to the total", () => {
      const row = {trackedSeconds: 3600, travelKm: 12.5};
      assert.deepEqual(entryFigures(row, 80, 1.2), {labour: 8000, materials: 0, travel: 1500, travelTenths: 125, total: 9500, hasCosts: false, hasTravel: true});
      assert.equal(entryFigures({travelKm: 0.3}, null, 1.15).travel, 35); // 0.3 km at $1.15 is 34.5 cents
      assert.equal(entryFigures({travelKm: 33.3}, null, 1.17).travel, 3896);
    });
    it("does not bill travel without a distance or a usable travel rate, but still counts the distance", () => {
      for (const rate of [undefined, null, 0, "1.2", NaN]) {
        const f = entryFigures({travelKm: 10}, 80, rate);
        assert.equal(f.travel, 0);
        assert.equal(f.hasTravel, false);
        assert.equal(f.travelTenths, 100);
      }
      for (const km of [undefined, 0, -3, "5", NaN]) assert.deepEqual([entryFigures({travelKm: km}, 80, 1.2).travel, entryFigures({travelKm: km}, 80, 1.2).hasTravel], [0, false]);
    });
    it("sums travel and distance exactly and keeps hasTravel if any has it", () => {
      const a = entryFigures({travelKm: 0.1}, null, 1.2);
      const b = entryFigures({travelKm: 0.2}, null, 1.2);
      const sum = sumFigures([a, b, entryFigures({}, 80, 1.2)]);
      assert.equal(sum.travelTenths, 3);
      assert.equal(sum.travel, a.travel + b.travel);
      assert.equal(sum.hasTravel, true);
      assert.equal(sumFigures([entryFigures({travelKm: 5}, null, null)]).hasTravel, false);
    });
    it("makes a sheet an invoice when travel is billed, even with no hourly rate or costs", () => {
      assert.equal(isInvoice(null, [entryFigures({travelKm: 5}, null, 1.2)]), true);
      assert.equal(isInvoice(null, [entryFigures({travelKm: 5}, null, null)]), false);
    });
    it("prints the travel amount and the distance", () => {
      const f = entryFigures({travelKm: 12.5}, null, 1.2);
      assert.deepEqual(figuresText(f, null), {labour: "", materials: "", travel: "$15.00", travelKm: "12.5 km", total: "$15.00"});
      assert.deepEqual(figuresText(entryFigures({travelKm: 40}, null, null), null), {labour: "", materials: "", travel: "", travelKm: "40 km", total: "$0.00"});
    });
    it("travelTenths and travelText", () => {
      assert.equal(travelTenths({travelKm: 12.34}), 123);
      assert.equal(travelTenths({}), 0);
      assert.equal(travelText(125), "12.5 km");
      assert.equal(travelText(400), "40 km");
      assert.equal(travelText(0), "");
    });
  });
});

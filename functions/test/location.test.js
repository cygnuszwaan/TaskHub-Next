/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_LOCATION_NAME_LENGTH, normalizeLocation} = require("../location");

describe("location.js", () => {
  describe("normalizeLocation", () => {
    it("keeps a name alone, one line with its whitespace collapsed", () => {
      assert.deepEqual(normalizeLocation({name: "  12 Beach Rd,\n  Whangaparāoa "}), {name: "12 Beach Rd, Whangaparāoa"});
      assert.deepEqual(normalizeLocation({name: "Smith's yard", latitude: null, longitude: null}), {name: "Smith's yard"});
    });
    it("keeps coordinates with the name when both are given and in range", () => {
      assert.deepEqual(normalizeLocation({name: "Whangaparāoa, Auckland", latitude: -36.63, longitude: 174.78}), {name: "Whangaparāoa, Auckland", latitude: -36.63, longitude: 174.78});
      assert.deepEqual(normalizeLocation({name: "Pole", latitude: -90, longitude: 180}), {name: "Pole", latitude: -90, longitude: 180});
      assert.deepEqual(normalizeLocation({name: "Origin", latitude: 0, longitude: 0}), {name: "Origin", latitude: 0, longitude: 0});
    });
    it("drops anything but the name and coordinates", () => {
      assert.deepEqual(normalizeLocation({name: "A", timeZone: "Pacific/Auckland", extra: 1}), {name: "A"});
    });
    it("reads null, blank text and an empty object as none", () => {
      for (const none of [null, "", "   ", {}, {name: ""}, {name: "  \n "}, {name: null}, {name: "", latitude: null, longitude: null}]) assert.equal(normalizeLocation(none), null, JSON.stringify(none));
    });
    it("rejects a name that is too long or not text", () => {
      assert.deepEqual(normalizeLocation({name: "x".repeat(MAX_LOCATION_NAME_LENGTH)}), {name: "x".repeat(MAX_LOCATION_NAME_LENGTH)});
      assert.equal(normalizeLocation({name: "x".repeat(MAX_LOCATION_NAME_LENGTH + 1)}), undefined);
      for (const name of [5, true, [], {}]) assert.equal(normalizeLocation({name}), undefined, JSON.stringify(name));
    });
    it("needs both coordinates or neither", () => {
      assert.equal(normalizeLocation({name: "A", latitude: -36.6}), undefined);
      assert.equal(normalizeLocation({name: "A", longitude: 174.7}), undefined);
      assert.equal(normalizeLocation({name: "A", latitude: -36.6, longitude: null}), undefined);
    });
    it("needs coordinates that are numbers in range", () => {
      for (const [latitude, longitude] of [[91, 0], [-91, 0], [0, 181], [0, -181], ["1", "2"], [NaN, 0], [0, Infinity], [true, false], [[], {}]]) {
        assert.equal(normalizeLocation({name: "A", latitude, longitude}), undefined, `${latitude}, ${longitude}`);
      }
    });
    it("needs a name when there are coordinates", () => {
      assert.equal(normalizeLocation({latitude: -36.6, longitude: 174.7}), undefined);
      assert.equal(normalizeLocation({name: "  ", latitude: -36.6, longitude: 174.7}), undefined);
    });
    it("rejects what is not an object or none", () => {
      for (const bad of [undefined, "Beach Rd", 5, true, [], [{name: "A"}]]) assert.equal(normalizeLocation(bad), undefined, JSON.stringify(bad));
    });
    it("does not change its input", () => {
      const input = {name: " A ", latitude: 1, longitude: 2};
      normalizeLocation(input);
      assert.deepEqual(input, {name: " A ", latitude: 1, longitude: 2});
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {coordsOf, distanceKm, sameArea} = require("../geo");

const WHANGAPARAOA = {latitude: -36.63, longitude: 174.78};
const OREWA = {latitude: -36.5859, longitude: 174.6945};
const AUCKLAND_CBD = {latitude: -36.8485, longitude: 174.7633};

describe("geo.js", () => {
  describe("coordsOf", () => {
    it("keeps only the coordinates of a usable point", () => {
      assert.deepEqual(coordsOf({name: "Home", latitude: -36.63, longitude: 174.78}), WHANGAPARAOA);
      assert.deepEqual(coordsOf({latitude: 0, longitude: 0}), {latitude: 0, longitude: 0});
    });
    it("rejects what is not a point", () => {
      for (const bad of [null, undefined, "x", 5, [], {}, {latitude: 1}, {longitude: 1}, {latitude: "1", longitude: 2}, {latitude: NaN, longitude: 2}, {latitude: 91, longitude: 0}, {latitude: 0, longitude: 181}, {latitude: Infinity, longitude: 0}]) {
        assert.equal(coordsOf(bad), null, JSON.stringify(bad));
      }
    });
  });

  describe("distanceKm", () => {
    it("is zero for the same point and symmetric", () => {
      assert.equal(distanceKm(WHANGAPARAOA, WHANGAPARAOA), 0);
      assert.equal(distanceKm(WHANGAPARAOA, OREWA), distanceKm(OREWA, WHANGAPARAOA));
    });
    it("matches known distances", () => {
      // One degree of latitude is about 111.2 km
      assert.ok(Math.abs(distanceKm({latitude: 0, longitude: 0}, {latitude: 1, longitude: 0}) - 111.195) < 0.01);
      // One degree of longitude on the equator is the same, and shrinks with latitude
      assert.ok(Math.abs(distanceKm({latitude: 0, longitude: 0}, {latitude: 0, longitude: 1}) - 111.195) < 0.01);
      assert.ok(Math.abs(distanceKm({latitude: 60, longitude: 0}, {latitude: 60, longitude: 1}) - 55.6) < 0.1);
      // Whangaparaoa to Orewa is about 9 km, and to the Auckland CBD about 25 km
      assert.ok(distanceKm(WHANGAPARAOA, OREWA) > 8.5 && distanceKm(WHANGAPARAOA, OREWA) < 9.5);
      assert.ok(distanceKm(WHANGAPARAOA, AUCKLAND_CBD) > 23 && distanceKm(WHANGAPARAOA, AUCKLAND_CBD) < 27);
    });
    it("works across the antimeridian and the poles", () => {
      assert.ok(Math.abs(distanceKm({latitude: 0, longitude: 179.5}, {latitude: 0, longitude: -179.5}) - 111.195) < 0.01);
      assert.ok(Math.abs(distanceKm({latitude: 90, longitude: 0}, {latitude: -90, longitude: 0}) - 20015.1) < 1);
    });
    it("is null when either point is unusable", () => {
      assert.equal(distanceKm(null, WHANGAPARAOA), null);
      assert.equal(distanceKm(WHANGAPARAOA, {latitude: 1}), null);
    });
  });

  describe("sameArea", () => {
    it("is true within the radius, boundary included, and false beyond it", () => {
      const km = distanceKm(WHANGAPARAOA, OREWA);
      assert.equal(sameArea(WHANGAPARAOA, OREWA, 10), true);
      assert.equal(sameArea(WHANGAPARAOA, OREWA, km), true);
      assert.equal(sameArea(WHANGAPARAOA, OREWA, km - 0.01), false);
      assert.equal(sameArea(WHANGAPARAOA, AUCKLAND_CBD, 10), false);
    });
    it("is false for an unusable point or radius", () => {
      assert.equal(sameArea(WHANGAPARAOA, null, 10), false);
      assert.equal(sameArea(undefined, WHANGAPARAOA, 10), false);
      for (const radius of [0, -5, NaN, Infinity, "10", null, undefined]) assert.equal(sameArea(WHANGAPARAOA, WHANGAPARAOA, radius), false, String(radius));
    });
  });
});

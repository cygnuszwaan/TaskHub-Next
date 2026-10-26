/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_LOCATION_NAME_LENGTH, normalizeLocation, effectiveLocation} = require("../location");

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

  describe("effectiveLocation", () => {
    const where = (name, lat = -36.6, lon = 174.7) => ({name, latitude: lat, longitude: lon});
    const task = {id: "t1", title: "Fix gate", location: where("Task place")};
    const project = {id: "p1", name: "Kitchen reno", location: where("Project place")};
    const client = {id: "c1", name: "Smith Ltd", location: where("Client place")};
    it("takes the first that is set: the task's, then its project's, then the client's, and says where it came from", () => {
      assert.deepEqual(effectiveLocation(task, project, client), {location: where("Task place"), source: "task", from: "Fix gate"});
      assert.deepEqual(effectiveLocation({id: "t1", title: "Fix gate"}, project, client), {location: where("Project place"), source: "project", from: "Kitchen reno"});
      assert.deepEqual(effectiveLocation({id: "t1", title: "Fix gate"}, {id: "p1", name: "Kitchen reno"}, client), {location: where("Client place"), source: "client", from: "Smith Ltd"});
    });
    it("is null when none of them has one", () => {
      assert.equal(effectiveLocation({title: "x"}, {name: "p"}, {name: "c"}), null);
      for (const none of [null, undefined]) assert.equal(effectiveLocation(none, none, none), null);
    });
    it("lets a change to the client reach a project that has not set its own", () => {
      const before = effectiveLocation(null, {name: "p"}, client);
      const moved = {...client, location: where("New client place")};
      assert.equal(before.location.name, "Client place");
      assert.equal(effectiveLocation(null, {name: "p"}, moved).location.name, "New client place");
      assert.equal(effectiveLocation(null, project, moved).location.name, "Project place", "an own location is the override");
    });
    it("works with a project or client alone, as the project's Location row does", () => {
      assert.equal(effectiveLocation(null, project, null).source, "project");
      assert.equal(effectiveLocation(undefined, undefined, client).source, "client");
      assert.equal(effectiveLocation(null, null, null), null);
    });
    it("skips a stored location that does not pass the checks, and returns it cleaned", () => {
      assert.equal(effectiveLocation(null, {name: "p", location: {name: "x", latitude: 5}}, null), null);
      assert.equal(effectiveLocation(null, {name: "p", location: "text"}, client).source, "client");
      assert.deepEqual(effectiveLocation(null, {name: "p", location: {name: "  A   B "}}, null).location, {name: "A B"});
    });
    it("allows a label with no position", () => {
      assert.deepEqual(effectiveLocation(null, {name: "p", location: {name: "Smith's yard"}}, null), {location: {name: "Smith's yard"}, source: "project", from: "p"});
    });
  });
});

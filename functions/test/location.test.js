/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_LOCATION_NAME_LENGTH, normalizeLocation, effectiveLocation} = require("../location");
const {applyDirectUpdate, completeInList, mergeTaskChanges, manualTaskChange} = require("../tasks");
const {buildTemplates} = require("../templates");
const {stepFromTask} = require("../projectTemplates");
const {applyCompletedEdit} = require("../completedEdit");
const {reopenTask} = require("../reopen");

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

let n = 0;
const makeId = () => `loc${++n}`;
const SMITH = {name: "12 Beach Rd, Whangaparaoa", latitude: -36.63, longitude: 174.78};
const withLocation = () => ({id: "t1", title: "Fit tap", priority: "LOW", dueDate: "", estimatedMinutes: 30, tags: [], status: "PENDING", order: 1, location: SMITH});

describe("location on a task", () => {
  describe("applyDirectUpdate", () => {
    it("sets a normalized location", () => {
      const next = applyDirectUpdate({id: "t1", title: "x"}, {location: {name: "  12   Beach Rd ", latitude: -36.63, longitude: 174.78}});
      assert.deepEqual(next.location, {name: "12 Beach Rd", latitude: -36.63, longitude: 174.78});
    });
    it("accepts a name without coordinates", () => {
      assert.deepEqual(applyDirectUpdate({id: "t1", title: "x"}, {location: {name: "Garage"}}).location, {name: "Garage"});
    });
    it("removes it with null, blank text or an empty object", () => {
      for (const v of [null, "", "  ", {}, {name: " "}]) assert.equal("location" in applyDirectUpdate(withLocation(), {location: v}), false, JSON.stringify(v));
    });
    it("leaves it as it was when the value is unusable", () => {
      for (const v of [42, [], {name: 5}, {name: "x", latitude: 1}, {name: "x".repeat(MAX_LOCATION_NAME_LENGTH + 1)}, {latitude: 1, longitude: 2}]) {
        assert.deepEqual(applyDirectUpdate(withLocation(), {location: v}).location, SMITH, JSON.stringify(v));
      }
    });
    it("is not touched by an edit that does not mention it", () => {
      assert.deepEqual(applyDirectUpdate(withLocation(), {title: "Fit tap again"}).location, SMITH);
    });
    it("never stores an unvalidated value", () => {
      assert.equal("location" in applyDirectUpdate({id: "t1", title: "x"}, {location: 42}), false);
    });
  });

  describe("manual entry", () => {
    it("manualTaskChange passes location on and omits it when not sent", () => {
      assert.deepEqual(manualTaskChange({title: "Fit tap", location: SMITH}).location, SMITH);
      assert.equal("location" in manualTaskChange({title: "Fit tap"}), false);
    });
    it("mergeTaskChanges applies it to a new task only when told to", () => {
      const change = {title: "Fit tap", location: {name: " Garage "}};
      assert.deepEqual(mergeTaskChanges([], [change], makeId, [], {location: true}).tasks[0].location, {name: "Garage"});
      assert.equal("location" in mergeTaskChanges([], [change], makeId).tasks[0], false);
    });
    it("drops an unusable location on a new task", () => {
      assert.equal("location" in mergeTaskChanges([], [{title: "Fit tap", location: {name: "x", latitude: 1}}], makeId, [], {location: true}).tasks[0], false);
    });
    it("is never changed on an existing task by a merge", () => {
      const merged = mergeTaskChanges([withLocation()], [{id: "t1", title: "Fit tap", location: {name: "Elsewhere"}}], makeId, [], {location: true});
      assert.deepEqual(merged.tasks[0].location, SMITH);
    });
  });

  describe("repeating task", () => {
    const task = {...withLocation(), dueDate: "2026-10-20", recurrence: {frequency: "WEEKLY", interval: 1}};
    it("goes to the next occurrence", () => {
      assert.deepEqual(completeInList([task], "t1", "2026-10-22", makeId).spawned.location, SMITH);
    });
    it("is left off the next occurrence when the task has none", () => {
      const {location, ...bare} = task; // eslint-disable-line no-unused-vars
      assert.equal("location" in completeInList([bare], "t1", "2026-10-22", makeId).spawned, false);
    });
    it("is kept on the completed task", () => {
      assert.deepEqual(completeInList([task], "t1", "2026-10-22", makeId).completedTask.location, SMITH);
    });
  });

  describe("completed-task templates", () => {
    const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, tags: [], completedAt: "2026-10-20T01:00:00.000Z"};
    it("carry the newest row's location", () => {
      assert.deepEqual(buildTemplates([{...row, location: SMITH}])[0].location, SMITH);
    });
    it("have none when the row has none or an unusable one", () => {
      assert.equal("location" in buildTemplates([row])[0], false);
      assert.equal("location" in buildTemplates([{...row, location: {name: "x", latitude: 1}}])[0], false);
    });
  });

  describe("project templates", () => {
    it("do not keep a step's location", () => {
      assert.equal("location" in stepFromTask(withLocation()), false);
    });
  });
});

describe("location on a completed task", () => {
  const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, location: SMITH, completedAt: new Date("2026-10-20T01:00:00Z")};
  const opts = {projectIds: [], timeZone: "Pacific/Auckland", now: new Date("2026-10-24T02:00:00Z")};
  it("is corrected to a normalized location", () => {
    assert.deepEqual(applyCompletedEdit(row, {location: {name: "  14   Beach Rd ", latitude: -36.6, longitude: 174.7}}, opts), {set: {location: {name: "14 Beach Rd", latitude: -36.6, longitude: 174.7}}, remove: []});
    assert.deepEqual(applyCompletedEdit(row, {location: {name: "Garage"}}, opts), {set: {location: {name: "Garage"}}, remove: []});
  });
  it("is removed by null, blank text or an empty object when the row has one, else there is nothing to change", () => {
    for (const v of [null, "", "  ", {}]) assert.deepEqual(applyCompletedEdit(row, {location: v}, opts), {set: {}, remove: ["location"]}, JSON.stringify(v));
    const {location, ...bare} = row; // eslint-disable-line no-unused-vars
    assert.deepEqual(applyCompletedEdit(bare, {location: null}, opts), {error: "Nothing to change"});
  });
  it("is refused when unusable", () => {
    for (const v of [42, [], {name: 5}, {name: "x", latitude: 1}, {name: "x".repeat(MAX_LOCATION_NAME_LENGTH + 1)}, {latitude: 1, longitude: 2}]) {
      assert.match(applyCompletedEdit(row, {location: v}, opts).error, /^Location must be/, JSON.stringify(v));
    }
  });
  it("comes back with a reopened task", () => {
    assert.deepEqual(reopenTask([], {...row, id: "t1"}, {makeId: () => "new1"}).task.location, SMITH);
  });
});

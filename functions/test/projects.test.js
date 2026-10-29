/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_NAME_LENGTH, MAX_PROJECT_ORDER, normalizeProjectName, normalizeProjectOrder, applyProjectFields, projectFieldsOf, removeProjectFromTasks, setProjectLocation, setProjectUrl, sortProjects, addProject, renameProject} = require("../projects");

const task = (id, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", ...extra});
const ids = ["p1", "p2"];

describe("projects.js", () => {
  describe("normalizeProjectName", () => {
    it("trims and collapses inner whitespace", () => {
      assert.deepEqual(normalizeProjectName("  Kitchen \n  reno "), {name: "Kitchen reno"});
    });
    it("rejects non-strings and blank names", () => {
      for (const v of [undefined, null, 7, "", "   ", {}]) assert.match(normalizeProjectName(v).error, /non-empty string/);
    });
    it("accepts exactly the maximum length and rejects one more", () => {
      assert.equal(normalizeProjectName("a".repeat(MAX_NAME_LENGTH)).name.length, MAX_NAME_LENGTH);
      assert.match(normalizeProjectName("a".repeat(MAX_NAME_LENGTH + 1)).error, /at most 100/);
    });
  });

  describe("normalizeProjectOrder", () => {
    it("returns null for null and undefined for unusable values", () => {
      assert.equal(normalizeProjectOrder(null), null);
      for (const v of [undefined, "2", NaN, Infinity, {}, [], true, ""]) assert.equal(normalizeProjectOrder(v), undefined);
    });
    it("rounds and clamps to 1..999", () => {
      assert.equal(normalizeProjectOrder(3), 3);
      assert.equal(normalizeProjectOrder(2.6), 3);
      assert.equal(normalizeProjectOrder(0), 1);
      assert.equal(normalizeProjectOrder(-5), 1);
      assert.equal(normalizeProjectOrder(100000), MAX_PROJECT_ORDER);
    });
  });

  describe("applyProjectFields", () => {
    it("joins an existing project", () => {
      assert.deepEqual(applyProjectFields(task("a"), {projectId: "p1"}, ids), task("a", {projectId: "p1"}));
    });
    it("ignores an unknown or non-string project id", () => {
      for (const v of ["nope", 5, undefined, {}]) assert.deepEqual(applyProjectFields(task("a", {projectId: "p1", projectOrder: 2}), {projectId: v}, ids), task("a", {projectId: "p1", projectOrder: 2}));
    });
    it("joins and orders in one update", () => {
      assert.deepEqual(applyProjectFields(task("a"), {projectId: "p1", projectOrder: 2}, ids), task("a", {projectId: "p1", projectOrder: 2}));
    });
    it("joins without an order number, leaving it unordered", () => {
      assert.equal("projectOrder" in applyProjectFields(task("a"), {projectId: "p1"}, ids), false);
    });
    it("sets, changes and clears the order of a member", () => {
      const member = task("a", {projectId: "p1", projectOrder: 1});
      assert.equal(applyProjectFields(member, {projectOrder: 4}, ids).projectOrder, 4);
      assert.equal("projectOrder" in applyProjectFields(member, {projectOrder: null}, ids), false);
      assert.equal(applyProjectFields(member, {projectOrder: "x"}, ids).projectOrder, 1);
    });
    it("ignores an order number for a task with no project", () => {
      assert.deepEqual(applyProjectFields(task("a"), {projectOrder: 2}, ids), task("a"));
    });
    it("leaving a project (null or empty id) clears the order number too", () => {
      for (const v of [null, ""]) {
        assert.deepEqual(applyProjectFields(task("a", {projectId: "p1", projectOrder: 2}), {projectId: v}, ids), task("a"));
      }
    });
    it("leaving a project wins over an order number in the same update", () => {
      assert.deepEqual(applyProjectFields(task("a", {projectId: "p1", projectOrder: 2}), {projectId: null, projectOrder: 5}, ids), task("a"));
    });
    it("moving to another project clears the order unless one is given", () => {
      const member = task("a", {projectId: "p1", projectOrder: 2});
      assert.deepEqual(applyProjectFields(member, {projectId: "p2"}, ids), task("a", {projectId: "p2"}));
      assert.deepEqual(applyProjectFields(member, {projectId: "p2", projectOrder: 1}, ids), task("a", {projectId: "p2", projectOrder: 1}));
    });
    it("re-sending the current project keeps the order", () => {
      assert.equal(applyProjectFields(task("a", {projectId: "p1", projectOrder: 2}), {projectId: "p1"}, ids).projectOrder, 2);
    });
    it("changes nothing when the keys are absent or fields is missing", () => {
      const member = task("a", {projectId: "p1", projectOrder: 2});
      assert.deepEqual(applyProjectFields(member, {title: "x"}, ids), member);
      assert.deepEqual(applyProjectFields(member, undefined, ids), member);
      assert.deepEqual(applyProjectFields(member, null, ids), member);
    });
    it("cannot join any project when no project ids are known", () => {
      assert.deepEqual(applyProjectFields(task("a"), {projectId: "p1"}, []), task("a"));
    });
    it("does not modify its input", () => {
      const member = task("a", {projectId: "p1", projectOrder: 2});
      const copy = structuredClone(member);
      applyProjectFields(member, {projectId: null}, ids);
      assert.deepEqual(member, copy);
    });
  });

  describe("projectFieldsOf", () => {
    it("returns only the project fields a task has", () => {
      assert.deepEqual(projectFieldsOf(task("a")), {});
      assert.deepEqual(projectFieldsOf(task("a", {projectId: "p1"})), {projectId: "p1"});
      assert.deepEqual(projectFieldsOf(task("a", {projectId: "p1", projectOrder: 3})), {projectId: "p1", projectOrder: 3});
    });
    it("drops a stray order number on a task with no project", () => {
      assert.deepEqual(projectFieldsOf(task("a", {projectOrder: 3})), {});
    });
  });

  describe("removeProjectFromTasks", () => {
    it("clears membership and order for members only, reusing the other task objects", () => {
      const a = task("a", {projectId: "p1", projectOrder: 1});
      const b = task("b", {projectId: "p2", projectOrder: 1});
      const c = task("c");
      const out = removeProjectFromTasks([a, b, c], "p1");
      assert.deepEqual(out[0], task("a"));
      assert.equal(out[1], b);
      assert.equal(out[2], c);
      assert.equal(a.projectId, "p1");
    });
  });

  describe("sortProjects", () => {
    it("sorts by name ignoring case, then id, without modifying the input", () => {
      const input = [{id: "3", name: "beta"}, {id: "2", name: "Alpha"}, {id: "1", name: "alpha"}];
      assert.deepEqual(sortProjects(input).map((p) => p.id), ["1", "2", "3"]);
      assert.deepEqual(input.map((p) => p.id), ["3", "2", "1"]);
    });
  });

  describe("addProject", () => {
    const makeId = () => "new1";
    it("adds a project with a server id and keeps the list sorted", () => {
      const r = addProject([{id: "p1", name: "Zed"}], "  Alpha ", makeId);
      assert.deepEqual(r.project, {id: "new1", name: "Alpha"});
      assert.deepEqual(r.projects.map((p) => p.name), ["Alpha", "Zed"]);
    });
    it("rejects a name that is taken, ignoring case and spacing", () => {
      assert.match(addProject([{id: "p1", name: "Kitchen reno"}], " kitchen   RENO", makeId).error, /already exists/);
    });
    it("rejects an unusable name", () => {
      assert.match(addProject([], "  ", makeId).error, /non-empty/);
    });
  });

  describe("renameProject", () => {
    const list = [{id: "p1", name: "One"}, {id: "p2", name: "Two"}];
    it("keeps the project's other fields, its client included", () => {
      const withClient = [{id: "p1", name: "One", clientId: "c1"}];
      assert.deepEqual(renameProject(withClient, "p1", "Uno").project, {id: "p1", name: "Uno", clientId: "c1"});
    });
    it("renames and re-sorts", () => {
      const r = renameProject(list, "p1", "Zebra");
      assert.deepEqual(r.project, {id: "p1", name: "Zebra"});
      assert.deepEqual(r.projects.map((p) => p.id), ["p2", "p1"]);
    });
    it("allows changing only the case of its own name", () => {
      assert.equal(renameProject(list, "p1", "ONE").project.name, "ONE");
    });
    it("rejects another project's name", () => {
      assert.match(renameProject(list, "p1", "two").error, /already exists/);
    });
    it("reports an unknown id before checking the name", () => {
      assert.deepEqual(renameProject(list, "zzz", ""), {notFound: true});
    });
    it("rejects an unusable name", () => {
      assert.match(renameProject(list, "p1", 5).error, /non-empty/);
    });
  });

  describe("setProjectUrl", () => {
    const projects = [{id: "p1", name: "Alpha", clientId: "c1"}, {id: "p2", name: "Beta", url: "https://old.example.com"}];
    it("sets the project's own link, keeping its other fields", () => {
      const r = setProjectUrl(projects, "p1", " alpha.example.com/plans ");
      assert.deepEqual(r.project, {id: "p1", name: "Alpha", clientId: "c1", url: "https://alpha.example.com/plans"});
      assert.deepEqual(r.projects[0], r.project);
      assert.equal(r.projects[1], projects[1], "other projects are untouched");
      assert.equal("url" in projects[0], false, "the input is not modified");
    });
    it("replaces an existing link and keeps an http one as typed", () => {
      assert.equal(setProjectUrl(projects, "p2", "http://new.example.com").project.url, "http://new.example.com");
    });
    it("takes it off for null or blank text, so the project uses its client's again", () => {
      for (const v of [null, "", "  "]) assert.equal("url" in setProjectUrl(projects, "p2", v).project, false, String(v));
      assert.equal(setProjectUrl(projects, "p1", null).project.clientId, "c1");
    });
    it("reports an unknown project and an unusable link", () => {
      assert.deepEqual(setProjectUrl(projects, "zzz", null), {notFound: true});
      for (const bad of [undefined, 5, [], {}, "javascript:alert(1)", "tel:5551234", "two words", `https://example.com/${"a".repeat(500)}`]) {
        assert.match(setProjectUrl(projects, "p1", bad).error, /^url must be null or an http or https address/, JSON.stringify(bad));
      }
    });
  });

  describe("setProjectLocation", () => {
    const projects = [{id: "p1", name: "Alpha", clientId: "c1"}, {id: "p2", name: "Beta", location: {name: "Old", latitude: -36.5, longitude: 174.6}}];
    it("sets the project's own location, keeping its other fields", () => {
      const r = setProjectLocation(projects, "p1", {name: " 12 Beach Road,  Orewa ", latitude: -36.58, longitude: 174.69});
      assert.deepEqual(r.project, {id: "p1", name: "Alpha", clientId: "c1", location: {name: "12 Beach Road, Orewa", latitude: -36.58, longitude: 174.69}});
      assert.deepEqual(r.projects[0], r.project);
      assert.equal(r.projects[1], projects[1], "other projects are untouched");
      assert.equal("location" in projects[0], false, "the input is not modified");
    });
    it("replaces an existing location and allows a label with no position", () => {
      assert.deepEqual(setProjectLocation(projects, "p2", {name: "Smith's yard"}).project.location, {name: "Smith's yard"});
    });
    it("takes it off for null, so the project inherits its client's again", () => {
      const r = setProjectLocation(projects, "p2", null);
      assert.equal("location" in r.project, false);
      assert.equal(setProjectLocation(projects, "p1", null).project.clientId, "c1");
    });
    it("reports an unknown project and an unusable location", () => {
      assert.deepEqual(setProjectLocation(projects, "zzz", null), {notFound: true});
      for (const bad of [undefined, "text", 5, [], {name: "x", latitude: 5}, {name: "x", latitude: 99, longitude: 0}, {name: "x".repeat(201)}, {latitude: 1, longitude: 2}]) {
        assert.match(setProjectLocation(projects, "p1", bad).error, /^location must be null or a name/, JSON.stringify(bad));
      }
    });
  });
});

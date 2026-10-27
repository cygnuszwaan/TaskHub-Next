/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {planObject, planDescriptionMigration} = require("../descriptionMigration");
const admin = require("firebase-admin");
const {run} = require("../scripts/migrateCommentsToDescription");

describe("descriptionMigration.js", () => {
  describe("planObject", () => {
    it("moves a text to the description when there is none", () => {
      assert.deepEqual(planObject({comments: "  Use the blue paint.\nAsk Sam. "}), {set: {description: "Use the blue paint.\nAsk Sam."}, remove: ["comments"], dropped: null});
      assert.deepEqual(planObject({comments: "x", description: "   "}), {set: {description: "x"}, remove: ["comments"], dropped: null});
    });
    it("keeps an existing description and reports the old text only when it differs", () => {
      assert.deepEqual(planObject({comments: "Old", description: "New"}), {set: null, remove: ["comments"], dropped: "Old"});
      assert.deepEqual(planObject({comments: " Same ", description: "Same"}), {set: null, remove: ["comments"], dropped: null});
    });
    it("only removes a blank text", () => {
      assert.deepEqual(planObject({comments: "   "}), {set: null, remove: ["comments"], dropped: null});
      assert.deepEqual(planObject({comments: "", description: "Keep"}), {set: null, remove: ["comments"], dropped: null});
    });
    it("leaves alone what has no text comments: none at all, or a list of timestamped comments", () => {
      for (const doc of [null, undefined, "x", {}, {title: "t"}, {description: "d"}, {comments: null}, {comments: []}, {comments: [{id: "c1", at: 1, text: "x"}]}]) assert.equal(planObject(doc), null, JSON.stringify(doc));
    });
  });

  describe("planDescriptionMigration", () => {
    const tasks = [{id: "t1", title: "Paint fence", comments: "Blue"}, {id: "t2", title: "Mow", description: "Front"}, {id: "t3", title: "Fix gate", comments: "Hinge", description: "Loose"}];
    const completed = [{id: "a1", title: "Fit tap", comments: "Washer"}, {id: "a2", title: "Old job"}];
    const templates = [
      {id: "p1", name: "Bathroom", steps: [{title: "Strip", priority: "HIGH", comments: "Wear a mask"}, {title: "Tile", priority: "LOW"}]},
      {id: "p2", name: "Fence", steps: [{title: "Dig", description: "Mind the pipes"}]},
      {id: "p3", name: "Broken"},
    ];
    it("plans every document that has a text comments, and nothing else", () => {
      const plan = planDescriptionMigration({tasks, completed, templates});
      assert.deepEqual(plan.changes.map((c) => [c.collection, c.id]), [["tasks", "t1"], ["tasks", "t3"], ["completed_tasks", "a1"], ["project_templates", "p1"]]);
      assert.deepEqual(plan.changes[0], {collection: "tasks", id: "t1", label: "Paint fence", set: {description: "Blue"}, remove: ["comments"]});
      assert.deepEqual(plan.changes[1], {collection: "tasks", id: "t3", label: "Fix gate", set: null, remove: ["comments"]});
    });
    it("rewrites a template's steps with the text moved and the other steps as they were", () => {
      const change = planDescriptionMigration({templates}).changes[0];
      assert.deepEqual(change.set.steps, [{title: "Strip", priority: "HIGH", description: "Wear a mask"}, {title: "Tile", priority: "LOW"}]);
      assert.deepEqual(change.remove, []);
    });
    it("reports the comments it would drop", () => {
      assert.deepEqual(planDescriptionMigration({tasks, completed, templates}).dropped, [{collection: "tasks", id: "t3", label: "Fix gate", comments: "Hinge"}]);
    });
    it("does not modify its input", () => {
      const copy = JSON.parse(JSON.stringify({tasks, completed, templates}));
      planDescriptionMigration({tasks, completed, templates});
      assert.deepEqual({tasks, completed, templates}, copy);
    });
    it("plans nothing for no input, unusable input or documents already migrated", () => {
      for (const input of [undefined, {}, {tasks: "x", completed: null, templates: 5}, {tasks: [{id: "t2", description: "Front"}], templates: [{id: "p2", steps: [{title: "Dig", description: "x"}]}]}]) assert.deepEqual(planDescriptionMigration(input), {changes: [], dropped: []}, JSON.stringify(input));
    });
  });

  describe("the script", () => {
    // A tiny stand-in for the Firestore handle: collections of plain documents, a recorded list of batched updates.
    function fakeDb(data) {
      const updates = [];
      const db = {
        collection: (name) => ({
          select: () => ({get: async () => ({docs: (data[name] || []).map((d) => ({id: d.id, data: () => {
            const {id, ...rest} = d; // eslint-disable-line no-unused-vars
            return rest;
          }}))})}),
          doc: (id) => ({path: `${name}/${id}`}),
        }),
        batch: () => {
          const ops = [];
          return {update: (ref, fields) => ops.push([ref.path, fields]), commit: async () => updates.push(...ops)};
        },
      };
      return {db, updates};
    }
    const data = () => ({
      tasks: [{id: "t1", title: "Paint fence", comments: "Blue"}, {id: "t2", title: "Mow"}],
      completed_tasks: [{id: "a1", title: "Fit tap", comments: "Washer"}],
      project_templates: [{id: "p1", name: "Bathroom", steps: [{title: "Strip", comments: "Mask"}]}],
    });
    it("writes nothing on a dry run", async () => {
      const {db, updates} = fakeDb(data());
      const out = [];
      assert.deepEqual(await run({db, log: (m) => out.push(m)}), {migrated: 0});
      assert.equal(updates.length, 0);
      assert.ok(out.some((m) => /Dry run only/.test(m)));
    });
    it("with apply, writes the description and deletes the old key, for tasks, entries and templates", async () => {
      const {db, updates} = fakeDb(data());
      assert.deepEqual(await run({db, apply: true, log: () => {}}), {migrated: 3});
      assert.deepEqual(updates.map(([path]) => path), ["tasks/t1", "completed_tasks/a1", "project_templates/p1"]);
      assert.equal(updates[0][1].description, "Blue");
      assert.ok(updates[0][1].comments.isEqual(admin.firestore.FieldValue.delete()), "the old key is deleted with a FieldValue");
      assert.deepEqual(updates[2][1], {steps: [{title: "Strip", description: "Mask"}]});
    });
    it("reports nothing to migrate when no document has text comments", async () => {
      const {db, updates} = fakeDb({tasks: [{id: "t1", title: "x", description: "d"}], completed_tasks: [], project_templates: []});
      const out = [];
      assert.deepEqual(await run({db, apply: true, log: (m) => out.push(m)}), {migrated: 0});
      assert.equal(updates.length, 0);
      assert.ok(out.includes("Nothing to migrate."));
    });
  });
});

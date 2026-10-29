/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_DESCRIPTION_LENGTH, normalizeDescription} = require("../description");
const {applyCompletedEdit} = require("../completedEdit");
const {normalizeStep} = require("../proposal");
const {applyDirectUpdate, completeInList, mergeTaskChanges, manualTaskChange} = require("../tasks");

let n = 0;
const makeId = () => `new${++n}`;
const base = () => ({id: "t1", title: "Paint fence", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1});
const withDescription = () => ({...base(), description: "Use the blue paint.\nAsk Sam for the ladder."});

describe("description.js", () => {
  describe("normalizeDescription", () => {
    it("keeps text, trimmed, with its inner line breaks", () => {
      assert.equal(normalizeDescription("  Use the blue paint.\nAsk Sam.  "), "Use the blue paint.\nAsk Sam.");
    });
    it("treats null, an empty string and blank text as no description", () => {
      for (const value of [null, "", "   ", "\n\t "]) assert.equal(normalizeDescription(value), null, JSON.stringify(value));
    });
    it("treats anything that is not a string as unusable", () => {
      for (const value of [undefined, 5, true, {}, [], ["a"]]) assert.equal(normalizeDescription(value), undefined, JSON.stringify(value));
    });
    it("cuts the text to the limit", () => {
      assert.equal(normalizeDescription("x".repeat(MAX_DESCRIPTION_LENGTH + 50)).length, MAX_DESCRIPTION_LENGTH);
    });
  });

  describe("direct edits", () => {
    it("sets the description, trimmed", () => {
      assert.equal(applyDirectUpdate(base(), {description: "  Ring first "}).description, "Ring first");
    });
    it("replaces existing description", () => {
      assert.equal(applyDirectUpdate(withDescription(), {description: "New note"}).description, "New note");
    });
    it("removes the key for null, an empty string or blank text", () => {
      for (const value of [null, "", "  "]) assert.equal("description" in applyDirectUpdate(withDescription(), {description: value}), false, JSON.stringify(value));
    });
    it("leaves description alone for an unusable value or when the field is not sent", () => {
      assert.equal(applyDirectUpdate(withDescription(), {description: 42}).description, withDescription().description);
      assert.equal(applyDirectUpdate(withDescription(), {title: "Renamed"}).description, withDescription().description);
    });
    it("does not change the task it was given", () => {
      const task = withDescription();
      applyDirectUpdate(task, {description: null});
      assert.deepEqual(task, withDescription());
    });
  });

  describe("the model", () => {
    it("never sets or changes description, on an update or a new task, unless the caller allows it", () => {
      const merged = mergeTaskChanges([withDescription()], [{id: "t1", title: "Paint fence", description: "Hacked"}, {title: "New task", description: "Nope"}], makeId);
      assert.equal(merged.tasks.find((t) => t.id === "t1").description, withDescription().description);
      assert.equal("description" in merged.tasks.find((t) => t.title === "New task"), false);
    });
    it("sets a long input's description on a new task when allowed, trimmed and cut to 2000 characters, and still never on an update", () => {
      const long = `  ${"x".repeat(2500)}  `;
      const merged = mergeTaskChanges([withDescription()], [{id: "t1", title: "Paint fence", description: "Hacked"}, {title: "New task", description: long}, {title: "Short one", description: "   "}], makeId, [], {description: true});
      assert.equal(merged.tasks.find((t) => t.id === "t1").description, withDescription().description);
      assert.equal(merged.tasks.find((t) => t.title === "New task").description, "x".repeat(MAX_DESCRIPTION_LENGTH));
      assert.equal("description" in merged.tasks.find((t) => t.title === "Short one"), false);
    });
    it("keeps description when it updates other fields", () => {
      const merged = mergeTaskChanges([withDescription()], [{id: "t1", title: "Paint the fence", priority: "HIGH"}], makeId);
      assert.equal(merged.tasks[0].description, withDescription().description);
    });
  });

  describe("manual entries", () => {
    it("give a new task its description when told to", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", description: "  Hinge is loose "})], makeId, [], {description: true});
      assert.equal(merged.tasks[0].description, "Hinge is loose");
    });
    it("leave description out when blank or unusable", () => {
      for (const description of ["  ", 7, null]) {
        const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", description})], makeId, [], {description: true});
        assert.equal("description" in merged.tasks[0], false, JSON.stringify(description));
      }
    });
    it("are not applied without the option", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", description: "Note"})], makeId);
      assert.equal("description" in merged.tasks[0], false);
    });
  });

  describe("completing a repeating task", () => {
    it("carries the description to the next occurrence", () => {
      const task = {...withDescription(), recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-20"};
      assert.equal(completeInList([task], "t1", "2026-10-22", makeId).spawned.description, withDescription().description);
    });
    it("adds no description key when there were none", () => {
      const task = {...base(), recurrence: {frequency: "WEEKLY", interval: 1}};
      assert.equal("description" in completeInList([task], "t1", "2026-10-22", makeId).spawned, false);
    });
  });
  describe("comments are not a description", () => {
    it("a direct edit never takes a comments value as the description or writes it, text or list", () => {
      for (const comments of ["  Ring first ", "", null, [{id: "comment-0001", at: 1, text: "x"}]]) {
        const next = applyDirectUpdate(withDescription(), {comments});
        assert.equal(next.description, withDescription().description, JSON.stringify(comments));
        assert.equal("comments" in next, false, JSON.stringify(comments));
      }
    });
    it("a direct edit keeps the comments a task holds", () => {
      const comments = [{id: "comment-0001", at: 1760000000000, text: "Rang the client"}];
      assert.deepEqual(applyDirectUpdate({...base(), comments}, {title: "Renamed", comments: []}).comments, comments);
    });
    it("a manual entry, a completed entry's edit and a suggested step ignore comments", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", comments: " Hinge is loose "})], makeId, [], {description: true});
      assert.equal("description" in merged.tasks[0], false);
      assert.equal("comments" in merged.tasks[0], false);
      const row = {title: "Mow lawn", priority: "LOW", estimatedMinutes: 30, tags: [], completedAt: new Date("2026-10-20T01:00:00Z")};
      assert.deepEqual(applyCompletedEdit(row, {comments: " Front only "}, {timeZone: "Pacific/Auckland"}), {error: "Nothing to change"});
      assert.equal("description" in normalizeStep({title: "Dig", comments: " Mind the pipes "}), false);
      assert.equal("comments" in normalizeStep({title: "Dig", comments: "x"}), false);
    });
  });
});

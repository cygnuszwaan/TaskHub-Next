/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_DESCRIPTION_LENGTH, normalizeDescription, readDescription} = require("../description");
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
    it("never sets or changes description, on an update or a new task", () => {
      const merged = mergeTaskChanges([withDescription()], [{id: "t1", title: "Paint fence", description: "Hacked"}, {title: "New task", description: "Nope"}], makeId);
      assert.equal(merged.tasks.find((t) => t.id === "t1").description, withDescription().description);
      assert.equal("description" in merged.tasks.find((t) => t.title === "New task"), false);
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
  describe("an older page's comments", () => {
    it("readDescription takes description first, then a non-empty comments text, else nothing", () => {
      assert.deepEqual(readDescription({description: "New", comments: "Old"}), {has: true, value: "New"});
      assert.deepEqual(readDescription({description: null, comments: "Old"}), {has: true, value: null});
      assert.deepEqual(readDescription({comments: "Old"}), {has: true, value: "Old"});
      for (const comments of ["", "   ", null, 5, ["a"], [{id: "c1", at: 1, text: "x"}], undefined]) assert.deepEqual(readDescription({comments}), {has: false}, JSON.stringify(comments));
      for (const fields of [undefined, null, "text", [], {}, {title: "x"}]) assert.deepEqual(readDescription(fields), {has: false}, JSON.stringify(fields));
    });
    it("a direct edit sets the description from a non-empty comments text and never writes a comments key", () => {
      const next = applyDirectUpdate(base(), {comments: "  Ring first "});
      assert.equal(next.description, "Ring first");
      assert.equal("comments" in next, false);
    });
    it("a direct edit ignores an empty comments box, so an older page cannot erase a description", () => {
      for (const comments of ["", "  ", null]) assert.equal(applyDirectUpdate(withDescription(), {comments}).description, withDescription().description, JSON.stringify(comments));
    });
    it("a direct edit ignores comments of any other type, which are not an old description", () => {
      const next = applyDirectUpdate(withDescription(), {comments: [{id: "c1", at: 1, text: "x"}]});
      assert.equal(next.description, withDescription().description);
      assert.equal("comments" in next, false);
    });
    it("description wins when both are sent", () => {
      assert.equal(applyDirectUpdate(base(), {description: "New", comments: "Old"}).description, "New");
    });
    it("a manual entry takes comments as its description", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", comments: " Hinge is loose "})], makeId, [], {description: true});
      assert.equal(merged.tasks[0].description, "Hinge is loose");
      assert.equal("comments" in merged.tasks[0], false);
    });
    it("a completed entry's edit takes comments as its description", () => {
      const row = {title: "Mow lawn", priority: "LOW", estimatedMinutes: 30, tags: [], completedAt: new Date("2026-10-20T01:00:00Z")};
      assert.deepEqual(applyCompletedEdit(row, {comments: " Front only "}, {timeZone: "Pacific/Auckland"}), {set: {description: "Front only"}, remove: []});
      assert.deepEqual(applyCompletedEdit({...row, description: "x"}, {comments: ""}, {timeZone: "Pacific/Auckland"}), {error: "Nothing to change"});
    });
    it("a suggested project's step takes comments as its description", () => {
      assert.equal(normalizeStep({title: "Dig", comments: " Mind the pipes "}).description, "Mind the pipes");
      assert.equal(normalizeStep({title: "Dig", description: "New", comments: "Old"}).description, "New");
      assert.equal("comments" in normalizeStep({title: "Dig", comments: "x"}), false);
    });
  });
});

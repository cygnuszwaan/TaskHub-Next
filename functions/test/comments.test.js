/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_COMMENTS_LENGTH, normalizeComments} = require("../comments");
const {applyDirectUpdate, completeInList, mergeTaskChanges, manualTaskChange} = require("../tasks");

let n = 0;
const makeId = () => `new${++n}`;
const base = () => ({id: "t1", title: "Paint fence", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1});
const withComments = () => ({...base(), comments: "Use the blue paint.\nAsk Sam for the ladder."});

describe("comments.js", () => {
  describe("normalizeComments", () => {
    it("keeps text, trimmed, with its inner line breaks", () => {
      assert.equal(normalizeComments("  Use the blue paint.\nAsk Sam.  "), "Use the blue paint.\nAsk Sam.");
    });
    it("treats null, an empty string and blank text as no comments", () => {
      for (const value of [null, "", "   ", "\n\t "]) assert.equal(normalizeComments(value), null, JSON.stringify(value));
    });
    it("treats anything that is not a string as unusable", () => {
      for (const value of [undefined, 5, true, {}, [], ["a"]]) assert.equal(normalizeComments(value), undefined, JSON.stringify(value));
    });
    it("cuts the text to the limit", () => {
      assert.equal(normalizeComments("x".repeat(MAX_COMMENTS_LENGTH + 50)).length, MAX_COMMENTS_LENGTH);
    });
  });

  describe("direct edits", () => {
    it("sets the comments, trimmed", () => {
      assert.equal(applyDirectUpdate(base(), {comments: "  Ring first "}).comments, "Ring first");
    });
    it("replaces existing comments", () => {
      assert.equal(applyDirectUpdate(withComments(), {comments: "New note"}).comments, "New note");
    });
    it("removes the key for null, an empty string or blank text", () => {
      for (const value of [null, "", "  "]) assert.equal("comments" in applyDirectUpdate(withComments(), {comments: value}), false, JSON.stringify(value));
    });
    it("leaves comments alone for an unusable value or when the field is not sent", () => {
      assert.equal(applyDirectUpdate(withComments(), {comments: 42}).comments, withComments().comments);
      assert.equal(applyDirectUpdate(withComments(), {title: "Renamed"}).comments, withComments().comments);
    });
    it("does not change the task it was given", () => {
      const task = withComments();
      applyDirectUpdate(task, {comments: null});
      assert.deepEqual(task, withComments());
    });
  });

  describe("the model", () => {
    it("never sets or changes comments, on an update or a new task", () => {
      const merged = mergeTaskChanges([withComments()], [{id: "t1", title: "Paint fence", comments: "Hacked"}, {title: "New task", comments: "Nope"}], makeId);
      assert.equal(merged.tasks.find((t) => t.id === "t1").comments, withComments().comments);
      assert.equal("comments" in merged.tasks.find((t) => t.title === "New task"), false);
    });
    it("keeps comments when it updates other fields", () => {
      const merged = mergeTaskChanges([withComments()], [{id: "t1", title: "Paint the fence", priority: "HIGH"}], makeId);
      assert.equal(merged.tasks[0].comments, withComments().comments);
    });
  });

  describe("manual entries", () => {
    it("give a new task its comments when told to", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", comments: "  Hinge is loose "})], makeId, [], {comments: true});
      assert.equal(merged.tasks[0].comments, "Hinge is loose");
    });
    it("leave comments out when blank or unusable", () => {
      for (const comments of ["  ", 7, null]) {
        const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", comments})], makeId, [], {comments: true});
        assert.equal("comments" in merged.tasks[0], false, JSON.stringify(comments));
      }
    });
    it("are not applied without the option", () => {
      const merged = mergeTaskChanges([], [manualTaskChange({title: "Fix gate", comments: "Note"})], makeId);
      assert.equal("comments" in merged.tasks[0], false);
    });
  });

  describe("completing a repeating task", () => {
    it("carries the comments to the next occurrence", () => {
      const task = {...withComments(), recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-20"};
      assert.equal(completeInList([task], "t1", "2026-10-22", makeId).spawned.comments, withComments().comments);
    });
    it("adds no comments key when there were none", () => {
      const task = {...base(), recurrence: {frequency: "WEEKLY", interval: 1}};
      assert.equal("comments" in completeInList([task], "t1", "2026-10-22", makeId).spawned, false);
    });
  });
});

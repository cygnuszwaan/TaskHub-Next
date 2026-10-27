/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_COMMENT_LENGTH, MAX_COMMENTS, normalizeCommentId, normalizeCommentText, commentsOf, commentTarget, addComment, removeComment, withComments} = require("../comments");
const {completeInList, mergeTaskChanges, undoInList, removalRecord} = require("../tasks");
const {reopenTask} = require("../reopen");
const {stepFromTask} = require("../projectTemplates");
const {buildTemplates} = require("../templates");
const {serializeCompleted} = require("../completed");

const T = 1761500000000;
const c = (n, at = T + n * 1000, text = `Note ${n}`) => ({id: `comment-${String(n).padStart(4, "0")}`, at, text});
let made = 0;
const makeId = () => `new${++made}`;
const base = (extra = {}) => ({id: "t1", title: "Paint fence", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1, ...extra});

describe("comments.js", () => {
  describe("normalizeCommentId", () => {
    it("takes 8 to 64 letters, digits, - and _", () => {
      for (const id of ["abcdefgh", "A1_-b2c3", "x".repeat(64)]) assert.equal(normalizeCommentId(id), id);
    });
    it("refuses anything else", () => {
      for (const id of ["short", "x".repeat(65), "has space1", "slash/id/12", "", null, undefined, 12345678, {}]) assert.equal(normalizeCommentId(id), null, JSON.stringify(id));
    });
  });

  describe("normalizeCommentText", () => {
    it("trims and keeps line breaks inside", () => {
      assert.equal(normalizeCommentText("  Rang Sam.\nNo answer.  "), "Rang Sam.\nNo answer.");
    });
    it("cuts to the limit", () => {
      assert.equal(normalizeCommentText("x".repeat(MAX_COMMENT_LENGTH + 10)).length, MAX_COMMENT_LENGTH);
    });
    it("gives null for blank text and for anything that is not text", () => {
      for (const v of ["", "  \n\t", null, undefined, 5, [], {}]) assert.equal(normalizeCommentText(v), null, JSON.stringify(v));
    });
  });

  describe("commentsOf", () => {
    it("reads the list in the order stored, each as exactly {id, at, text}", () => {
      assert.deepEqual(commentsOf({comments: [{...c(1), extra: true}, c(2)]}), [c(1), c(2)]);
    });
    it("gives none for a missing or unusable comments value, a text one included", () => {
      for (const doc of [undefined, null, "x", [], {}, {comments: null}, {comments: "An old text note"}, {comments: {}}, {comments: 5}]) assert.deepEqual(commentsOf(doc), [], JSON.stringify(doc));
    });
    it("skips entries that are unusable and the later ones of a repeated id", () => {
      const list = [c(1), null, "x", [], {id: "short", at: T, text: "x"}, {...c(2), at: 0}, {...c(3), at: 1.5}, {...c(4), at: "5"}, {...c(5), text: "  "}, {...c(6), text: 7}, {...c(1), text: "again"}, c(7)];
      assert.deepEqual(commentsOf({comments: list}), [c(1), c(7)]);
    });
  });

  describe("commentTarget", () => {
    it("names a task or an entry, exactly one", () => {
      assert.deepEqual(commentTarget({taskId: "t1"}), {field: "taskId", id: "t1"});
      assert.deepEqual(commentTarget({archiveId: "arch-0001"}), {field: "archiveId", id: "arch-0001"});
    });
    it("refuses both, neither and an unusable id", () => {
      assert.match(commentTarget({taskId: "t1", archiveId: "a1"}).error, /not both/);
      assert.match(commentTarget({}).error, /Missing/);
      assert.match(commentTarget(undefined).error, /Missing/);
      assert.match(commentTarget({taskId: ""}).error, /Missing taskId/);
      assert.match(commentTarget({archiveId: "a/b"}).error, /Missing archiveId/);
      assert.match(commentTarget({taskId: 5}).error, /Missing taskId/);
      assert.match(commentTarget({taskId: null, archiveId: null}).error, /Missing/);
    });
  });

  describe("addComment", () => {
    it("adds to nothing, to a missing key and to a list", () => {
      assert.deepEqual(addComment(undefined, c(1)), {comments: [c(1)], added: true});
      assert.deepEqual(addComment("An old text note", c(1)), {comments: [c(1)], added: true});
      assert.deepEqual(addComment([c(1)], c(2)), {comments: [c(1), c(2)], added: true});
    });
    it("stores exactly {id, at, text}, the text trimmed and cut", () => {
      const done = addComment([], {id: "comment-0001", at: T, text: "  Hi  ", extra: 1});
      assert.deepEqual(done.comments, [{id: "comment-0001", at: T, text: "Hi"}]);
      assert.equal(addComment([], {...c(1), text: "y".repeat(MAX_COMMENT_LENGTH + 5)}).comments[0].text.length, MAX_COMMENT_LENGTH);
    });
    it("keeps the list in the order written: an earlier comment that arrives later goes before the later ones", () => {
      const list = [c(1, T + 1000), c(3, T + 3000)];
      assert.deepEqual(addComment(list, c(2, T + 2000)).comments.map((x) => x.id), [c(1).id, c(2).id, c(3).id]);
      assert.deepEqual(addComment(list, c(4, T)).comments.map((x) => x.id), [c(4).id, c(1).id, c(3).id]);
    });
    it("puts a comment written at the same time as another after it", () => {
      assert.deepEqual(addComment([c(1, T)], c(2, T)).comments.map((x) => x.id), [c(1).id, c(2).id]);
    });
    it("adds nothing for an id already there, leaving the list as it was", () => {
      const list = [c(1), c(2)];
      assert.deepEqual(addComment(list, {...c(1), text: "different", at: T + 99999}), {comments: list, added: false});
    });
    it("refuses an unusable id, blank text and an unusable time with a reason", () => {
      assert.match(addComment([], {...c(1), id: "x"}).error, /id/);
      assert.match(addComment([], {...c(1), id: undefined}).error, /id/);
      assert.match(addComment([], {...c(1), text: "  "}).error, /text/);
      assert.match(addComment([], {...c(1), text: 5}).error, /text/);
      for (const at of [0, -1, 1.5, "5", null, undefined, NaN]) assert.match(addComment([], {...c(1), at}).error, /time/, String(at));
      assert.match(addComment([], null).error, /id/);
    });
    it("refuses a comment past the most a task holds", () => {
      const full = Array.from({length: MAX_COMMENTS}, (_, i) => c(i + 1));
      assert.match(addComment(full, c(9999)).error, /at most 200/);
      assert.equal(addComment(full.slice(1), c(9999)).added, true);
      assert.equal(addComment(full, full[0]).added, false); // a repeat is still harmless on a full list
    });
    it("does not change the list it was given", () => {
      const list = [c(1)];
      addComment(list, c(2));
      assert.deepEqual(list, [c(1)]);
    });
  });

  describe("removeComment", () => {
    it("removes the named comment and keeps the rest in order", () => {
      assert.deepEqual(removeComment([c(1), c(2), c(3)], c(2).id), {comments: [c(1), c(3)], removed: true});
    });
    it("says nothing was removed for an id that is not there, or no list", () => {
      assert.deepEqual(removeComment([c(1)], "comment-9999"), {comments: [c(1)], removed: false});
      assert.deepEqual(removeComment(undefined, c(1).id), {comments: [], removed: false});
      assert.deepEqual(removeComment("An old text note", c(1).id), {comments: [], removed: false});
    });
    it("removes the last comment and leaves an empty list", () => {
      assert.deepEqual(removeComment([c(1)], c(1).id), {comments: [], removed: true});
    });
  });

  describe("withComments", () => {
    it("sets the list and takes the key away for an empty one", () => {
      assert.deepEqual(withComments(base(), [c(1)]).comments, [c(1)]);
      assert.equal("comments" in withComments(base({comments: [c(1)]}), []), false);
      assert.equal("comments" in withComments(base(), undefined), false);
    });
    it("does not change the document it was given", () => {
      const doc = base({comments: [c(1)]});
      withComments(doc, []);
      assert.deepEqual(doc.comments, [c(1)]);
    });
  });

  describe("on a task's way through the app", () => {
    it("the model never sets or changes comments, on an update or a new task", () => {
      const merged = mergeTaskChanges([base({comments: [c(1)]})], [{id: "t1", title: "Paint fence", comments: [c(9)]}, {title: "New task", comments: [c(8)]}], makeId, [], {description: true, materials: true});
      assert.deepEqual(merged.tasks.find((t) => t.id === "t1").comments, [c(1)]);
      assert.equal("comments" in merged.tasks.find((t) => t.title === "New task"), false);
    });
    it("a completed task's archive row keeps its comments", () => {
      const done = completeInList([base({comments: [c(1), c(2)]})], "t1", "2026-10-27", makeId, "2026-10-27T01:00:00Z");
      assert.deepEqual(done.completedTask.comments, [c(1), c(2)]);
    });
    it("the next occurrence of a repeating task starts with none", () => {
      const task = base({comments: [c(1)], recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-20", description: "Blue paint"});
      const done = completeInList([task], "t1", "2026-10-27", makeId, "2026-10-27T01:00:00Z");
      assert.equal("comments" in done.spawned, false);
      assert.equal(done.spawned.description, "Blue paint");
    });
    it("a reopened entry brings its comments back, the ones added after the completion too", () => {
      const row = {...completeInList([base({comments: [c(1)]})], "t1", "2026-10-27", makeId, "2026-10-27T01:00:00Z").completedTask, comments: [c(1), c(2)], completedAt: new Date()};
      const back = reopenTask([], row, {makeId});
      assert.deepEqual(back.task.comments, [c(1), c(2)]);
    });
    it("serialising a completed row keeps its comments", () => {
      assert.deepEqual(serializeCompleted([{title: "x", comments: [c(1)], completedAt: new Date("2026-10-27T01:00:00Z")}])[0].comments, [c(1)]);
    });
    it("a project template step and a completed task's template never carry comments", () => {
      assert.equal("comments" in stepFromTask(base({comments: [c(1)], description: "Note"})), false);
      const [template] = buildTemplates([{title: "Paint fence", priority: "LOW", estimatedMinutes: 30, tags: [], comments: [c(1)], completedAt: "2026-10-27T01:00:00.000Z"}], 10);
      assert.equal("comments" in template, false);
    });
  });

  describe("Undo of a completion", () => {
    const record = (task) => removalRecord("COMPLETE", task, "arch-0001", null, T);
    it("brings the task back with the comments it had when it was removed", () => {
      const task = base({comments: [c(1)]});
      assert.deepEqual(undoInList([], record(task)).restored.comments, [c(1)]);
    });
    it("uses the comments the archive row holds now when they are given, so ones added to the entry afterwards are kept", () => {
      const task = base({comments: [c(1)]});
      assert.deepEqual(undoInList([], record(task), [c(1), c(2)]).restored.comments, [c(1), c(2)]);
    });
    it("takes the key away when the row's comments were all deleted", () => {
      const done = undoInList([], record(base({comments: [c(1)]})), []);
      assert.equal("comments" in done.restored, false);
    });
    it("cleans the row's comments and gives a task without any none", () => {
      assert.deepEqual(undoInList([], record(base()), [c(1), {id: "bad"}]).restored.comments, [c(1)]);
      assert.equal("comments" in undoInList([], record(base())).restored, false);
    });
    it("still drops the schedule fields of an unpinned task", () => {
      const task = base({comments: [c(1)], googleCalendarEventId: "e1", scheduledStart: "2026-10-28T09:00:00+13:00", scheduledEnd: "2026-10-28T10:00:00+13:00"});
      const restored = undoInList([], record(task), [c(1)]).restored;
      assert.equal("googleCalendarEventId" in restored, false);
      assert.equal("scheduledStart" in restored, false);
    });
  });
});

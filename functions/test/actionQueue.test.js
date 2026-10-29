/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {setTimerInList, settleTimer} = require("../timer");
const {completeInList, applyDirectUpdate, normalizeRecurrence, removalRecord, undoInList: serverUndoInList} = require("../tasks");
const {reopenTask} = require("../reopen");
const {recordCompletion} = require("../history");
const {normalizeDescription} = require("../description");
const {normalizeSnooze} = require("../snooze");
const {normalizeTravelKm} = require("../travel");
const {normalizePhone, normalizeEmail, normalizeUrl} = require("../contact");
const {normalizeLocation} = require("../location");
const {applyCompletedEdit} = require("../completedEdit");
const {normalizeMaterials: serverNormalizeMaterials} = require("../materials");
const {normalizeMaterialCost: serverNormalizeMaterialCost} = require("../money");
const {addComment: serverAddComment, removeComment: serverRemoveComment} = require("../comments");
const {normalizeArchiveId, resolveActionTime} = require("../clientTime");
const {normalizeRequestId} = require("../addRequests");
const {applyBatch} = require("../batch");

// The page's pure helpers sit between two marker comments in public/index.html; load them as the page does.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
assert.ok(start > 0 && end > start, "pure-helpers markers not found in public/index.html");
const block = html.slice(start, end);

function load() {
  return new Function(`${block}
    return {setClockOffset, serverNow, parseClockOffset, waitingTaskIds, hasPendingActions, actionQueueRefusal, elapsedSecondsOf, runningSeconds, ACTION_QUEUE_KEY, ACTION_QUEUE_MAX, ACTION_KINDS, EDIT_FIELDS, ENTRY_EDIT_FIELDS, normalizeSnooze, normalizeTravelKm, normalizePhone, normalizeEmail, normalizeUrl, normalizeLocation, normalizeRecurrence, checkEditFields, taskEditChanges, serverOnlyEditChanges, taskEditBody, UNDO_TASK_MAX_CHARS, completionRecord, undoInList, blockedBy, undoPlan, completeBody, undoBody, reopenBody, entryEditBody, splitHeldFields, fieldNamesText, takeBackCompletion, newArchiveId, usableArchiveId, clockOffsetFrom, normalizeSamples, normalizeCount, recordCompletion, setTimerInList, settleTimer, completedRowOf, reopenTask, normalizeDescription, applyEditFields, addCommentToList, removeCommentFromList, commentBody, commentDeleteBody, waitingCommentIds, MAX_COMMENTS, normalizeCommentText, commentsOf, cleanEntryTags, MAX_TRACKED_SECONDS, MAX_ENTRY_TAGS, normalizeQueuedAction, makeQueuedAction, cleanActionQueue, parseActionQueue, serializeActionQueue, withPendingActions, cancelActions, actionLabel, actionCardView, actionQueueSummary, actionDiscardPrompt, deletionRecord, deleteBody, removalBody, normalizeMaterials, normalizeMaterialCost, heldMaterials, withMaterialIds, coalesceMaterialsEdit, openMaterialGroups, openMaterialCount, withMaterialChecked, MAX_MATERIALS, BATCH_ACTIONS, MAX_BATCH, batchInList, batchActionBody, unheldBatchId, isShoppingKind, shoppingTempId, withPendingShopping, waitingShoppingIds, hasPendingShopping, shoppingBody, shoppingRemovalId, shoppingWithAdded, shoppingWithout, MAX_SHOPPING_ITEMS, MAX_SHOPPING_TEXT};
  `)();
}

const MIN = 60 * 1000;
const T0 = Date.parse("2026-10-27T01:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

function task(id, extra = {}) {
  return {id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 30, tags: [], status: "PENDING", order: 1, ...extra};
}
function timerTasks() {
  return [
    task("a", {order: 1}),
    task("b", {order: 2, timerStartedAt: iso(T0 - 10 * MIN), firstStartedAt: iso(T0 - 10 * MIN), trackedSeconds: 120, active: true}),
    task("c", {order: 3, trackedSeconds: 30}),
    task("d", {order: 4, firstStartedAt: iso(T0 - 60 * MIN), trackedSeconds: 600}),
  ];
}
function action(page, over = {}) {
  return page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "Task a", fields: {action: "START"}, now: T0, offset: 0, ...over});
}


// A task as the server completes it (at T0) and the record it keeps for Undo, with the list the server then holds.
function completedFixture(extra = {}, recurrence = undefined) {
  const base = task("a", {order: 3, estimatedMinutes: 45, timerStartedAt: iso(T0 - 10 * MIN), firstStartedAt: iso(T0 - 20 * MIN), trackedSeconds: 120, active: true, googleCalendarEventId: "evt1", scheduledStart: iso(T0 + 60 * MIN), scheduledEnd: iso(T0 + 90 * MIN), ...extra});
  if (recurrence) base.recurrence = recurrence;
  const before = [task("z", {order: 1}), base, task("y", {order: 5})];
  let n = 0;
  const done = completeInList(before, "a", "2026-10-27", () => `spawn-${++n}`, iso(T0), undefined);
  const record = removalRecord("COMPLETE", done.completedTask, "archive-0001", done.spawned, T0);
  return {before, done, record, base};
}
function undoAction(page, record, over = {}) {
  const fields = {task: record.task};
  if (record.spawnedId) fields.spawnedId = record.spawnedId;
  return page.makeQueuedAction({kind: "UNDO", taskId: record.task.id, archiveId: record.archiveId, title: record.task.title, fields, now: T0 + MIN, ...over});
}

describe("action queue (public/index.html)", () => {
  describe("copies of the server's rules", () => {
    it("setTimerInList gives the server's answer for every action, task, clock and cap", () => {
      const page = load();
      let compared = 0;
      for (const id of ["a", "b", "c", "d", "missing"]) {
        for (const verb of ["START", "PAUSE", "ABORT", "start", " pause ", "Abort", "bogus", "", undefined, null, 5]) {
          for (const nowMs of [T0, T0 - 20 * MIN, T0 + 5 * 3600 * 1000, NaN, Infinity, undefined]) {
            for (const capSeconds of [undefined, 0, 60, 100000, -1, 1.5, null]) {
              const input = timerTasks();
              const options = {capSeconds: capSeconds === null ? undefined : capSeconds};
              assert.deepEqual(page.setTimerInList(input, id, verb, nowMs, options), setTimerInList(timerTasks(), id, verb, nowMs, options), `${id} ${verb} ${nowMs} ${capSeconds}`);
              assert.deepEqual(input, timerTasks(), "the input is not modified");
              compared++;
            }
          }
        }
      }
      assert.ok(compared > 2000);
    });
    it("settleTimer and recordCompletion give the server's answer", () => {
      const page = load();
      for (const t of timerTasks()) {
        for (const nowMs of [T0, T0 - 20 * MIN, NaN]) {
          assert.deepEqual(page.settleTimer(t, nowMs), settleTimer(t, nowMs));
        }
      }
      for (const t of [task("x"), task("x", {trackedSeconds: 0.4}), task("x", {trackedSeconds: 90, completedCount: 2, recentSeconds: [60, 70, 80, 90, 100, 110]}), task("x", {completedCount: 1000000}), task("x", {recentSeconds: "no"})]) {
        assert.deepEqual(page.recordCompletion(t), recordCompletion(t));
      }
    });
    it("completedRowOf is the row completeTask archives, and the Queue loses the task as completeInList removes it", () => {
      const page = load();
      const repeating = task("b", {order: 2, timerStartedAt: iso(T0 - 10 * MIN), firstStartedAt: iso(T0 - 10 * MIN), trackedSeconds: 120, active: true, recurrence: {frequency: "WEEKLY", interval: 1}, dueDate: "2026-10-27", completedCount: 3, recentSeconds: [600, 700, 800]});
      const cases = [task("a"), repeating, task("c", {trackedSeconds: 45, description: "note", projectId: "p1", projectOrder: 2, materials: [{id: "m1", text: "Nails", checked: true, cost: 3.5}]}), task("d", {locked: true, googleCalendarEventId: "ev", scheduledStart: iso(T0 + MIN), scheduledEnd: iso(T0 + 31 * MIN)})];
      for (const t of cases) {
        const list = [task("z", {order: 0}), t, task("y", {order: 9})];
        const done = completeInList(list, t.id, "2026-10-27", () => "new-id", iso(T0), 4);
        const row = {...done.completedTask, ...done.history, completedAt: iso(T0), archiveId: "archive-0001"};
        assert.deepEqual(page.completedRowOf(t, T0, "archive-0001"), row);
        const shown = page.withPendingActions(list, [], [{requestId: "req-00001", kind: "COMPLETE", taskId: t.id, archiveId: "archive-0001", title: t.title, at: T0, status: "PENDING"}]);
        assert.deepEqual(shown.tasks, done.tasks.filter((x) => x.id !== "new-id"), "no next occurrence is shown");
        assert.deepEqual(shown.completed, [{...row, waitingRequestId: "req-00001"}]);
      }
    });
    it("reopenTask gives the server's answer, with the row's history taken back and the same errors", () => {
      const page = load();
      const finished = completeInList([task("a", {trackedSeconds: 90, completedCount: 2, recentSeconds: [60, 90], projectId: "p1", projectOrder: 1, travelKm: 4, location: {name: "Gate"}, description: "c", recurrence: {frequency: "DAILY", interval: 1}, dueDate: "2026-10-26"}), task("b")], "a", "2026-10-27", () => "new-id", iso(T0), 7);
      const row = {...finished.completedTask, ...finished.history, completedAt: iso(T0)};
      const rows = [
        row,
        {...row, trackedSeconds: 500},
        {...row, id: "b"},
        {...row, locked: true, googleCalendarEventId: "ev", scheduledStart: iso(T0), scheduledEnd: iso(T0 + MIN)},
        {...row, id: undefined},
        {...row, title: "  "},
        {...row, completedCount: undefined, recentSeconds: undefined, trackedSeconds: 0},
        {...row, timerStartedAt: iso(T0), active: true},
      ];
      for (const r of rows) {
        for (const projectIds of [[], ["p1"]]) {
          const list = [task("b", {order: 5}), task("q", {order: 2})];
          const expected = reopenTask(list, r, {projectIds, makeId: () => "made-id"});
          assert.deepEqual(page.reopenTask(list, r, {projectIds, makeId: () => "made-id"}), expected);
        }
      }
      assert.deepEqual(page.reopenTask([], null, {makeId: () => "x"}), reopenTask([], null, {makeId: () => "x"}));
      assert.equal(page.reopenTask([], rows[0], {projectIds: [], makeId: () => "x"}).task.completedCount, 2, "the history is back to before the completion");
    });
    it("an EDIT of description leaves a task and an entry as the server's edits do", () => {
      const page = load();
      for (const description of ["  hi  ", "", "   ", null, "x".repeat(2500), 5, undefined]) {
        assert.equal(page.normalizeDescription(description), normalizeDescription(description));
        for (const t of [task("a"), task("a", {description: "old"})]) {
          if (normalizeDescription(description) === undefined) continue;
          assert.deepEqual(page.applyEditFields(t, {description}), applyDirectUpdate(t, {description}));
          const edit = applyCompletedEdit(t, {description}, {timeZone: "Pacific/Auckland"});
          const expected = edit.error ? {...t} : {...t, ...edit.set}; // the server refuses an edit that changes nothing, which leaves the entry as it is
          for (const key of edit.remove || []) delete expected[key];
          assert.deepEqual(page.applyEditFields(t, {description}), expected);
        }
      }
    });
    it("makes archive ids and request ids the server accepts", () => {
      const page = load();
      for (let i = 0; i < 20; i++) assert.ok(normalizeArchiveId(page.newArchiveId()), "random");
      assert.ok(normalizeArchiveId(page.newArchiveId(() => "00000000-1111-2222-3333-444444444444")));
      assert.ok(normalizeArchiveId(page.newArchiveId(() => "bad id")), "an unusable id is replaced");
      for (const v of ["abcdefgh", "a".repeat(64), "__name__", "short", "a".repeat(65), "has space", "a/bcdefgh", "", null, 5]) {
        assert.equal(page.usableArchiveId(v), normalizeArchiveId(v) !== null, String(v));
      }
    });
  });

  describe("makeQueuedAction", () => {
    it("builds each kind as a PENDING action", () => {
      const page = load();
      assert.deepEqual(action(page, {requestId: "req-00001"}), {requestId: "req-00001", kind: "TIMER", taskId: "a", title: "Task a", fields: {action: "START"}, at: T0, status: "PENDING"});
      assert.deepEqual(action(page, {requestId: "req-00002", fields: {action: "pause", capSeconds: 90}}).fields, {action: "PAUSE", capSeconds: 90});
      assert.deepEqual(page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Task a", now: T0, requestId: "req-00003"}), {requestId: "req-00003", kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Task a", at: T0, status: "PENDING"});
      assert.deepEqual(page.makeQueuedAction({kind: "REOPEN", taskId: "a", archiveId: "archive-0001", title: "Task a", now: T0, requestId: "req-00004"}).archiveId, "archive-0001");
      assert.deepEqual(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Task a", fields: {description: "  hi "}, now: T0, requestId: "req-00005"}).fields, {description: "hi"});
      assert.deepEqual(page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task a", fields: {description: ""}, now: T0, requestId: "req-00006"}).fields, {description: null});
    });
    it("makes a request id of its own when none is given", () => {
      const page = load();
      const a = action(page);
      const b = action(page);
      assert.match(a.requestId, /^[A-Za-z0-9_-]{8,64}$/);
      assert.notEqual(a.requestId, b.requestId);
    });
    it("books the device's clock corrected by its offset, to the millisecond", () => {
      const page = load();
      assert.equal(action(page, {offset: 2500}).at, T0 + 2500);
      assert.equal(action(page, {offset: -90000}).at, T0 - 90000);
      assert.equal(action(page, {offset: undefined}).at, T0);
      assert.equal(action(page, {offset: NaN}).at, T0);
      assert.equal(action(page, {now: T0 + 0.4, offset: 0.4}).at, T0 + 1);
    });
    it("refuses what the server would refuse or could not replay", () => {
      const page = load();
      const bad = [
        {now: undefined}, {now: NaN}, {now: "1"}, {now: 0}, {now: -5}, {requestId: "short"}, {requestId: "has space here"}, {requestId: 5},
        {taskId: ""}, {taskId: undefined}, {taskId: 5}, {fields: undefined}, {fields: {}}, {fields: {action: "STOP"}}, {fields: {action: "START", capSeconds: 5}},
        {fields: {action: "PAUSE", capSeconds: -1}}, {fields: {action: "PAUSE", capSeconds: 1.5}}, {kind: "PURGE"}, {kind: "UNDO"}, {kind: "timer"}, {kind: undefined},
      ];
      for (const over of bad) assert.equal(action(page, over), null, JSON.stringify(over));
      const base = {title: "T", now: T0, requestId: "req-00001"};
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", taskId: "a"}), null, "no archive id");
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", taskId: "a", archiveId: "__name__"}), null);
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", archiveId: "archive-0001"}), null, "no task");
      assert.equal(page.makeQueuedAction({...base, kind: "REOPEN", archiveId: "archive-0001"}), null, "no task");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", fields: {description: "x"}}), null, "no target");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", archiveId: "archive-0001", fields: {description: "x"}}), null, "two targets");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {materials: [{text: "Nails", checked: false}]}}), null, "a material without an id of its own cannot be held");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {projectId: "p"}}), null, "a field that cannot be held");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {queueNumber: 2}}), null, "a field that needs the server");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields: {title: "x"}}), null, "an entry holds only the plain fields of its archive row");
      for (const fields of [{materials: []}, {completedDate: "2026-10-27", completedTime: "09:00"}, {estimatedMinutes: 5}, {trackedSeconds: -1}, {priority: "URGENT"}]) {
        assert.equal(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields}), null, JSON.stringify(fields));
      }
      assert.deepEqual(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields: {priority: "HIGH"}}).fields, {priority: "HIGH"});
      assert.deepEqual(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields: {projectId: "p"}}).fields, {projectId: "p"}, "an entry holds its project");
      assert.deepEqual(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields: {projectId: ""}}).fields, {projectId: null}, "none, as the server stores it");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", archiveId: "archive-0001", fields: {projectId: 5}}), null, "not an id");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {description: 5}}), null);
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {}}), null);
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a"}), null);
    });
    it("keeps a title on one line and cuts a long one", () => {
      const page = load();
      assert.equal(action(page, {title: "  Fix \n the   gate "}).title, "Fix the gate");
      assert.equal(action(page, {title: undefined}).title, "");
      const long = action(page, {title: "x".repeat(300)}).title;
      assert.equal(long.length, 100);
      assert.ok(long.endsWith("…"));
    });
  });

  describe("the stored queue", () => {
    it("round-trips and keeps the order", () => {
      const page = load();
      const queue = [action(page, {requestId: "req-00001"}), page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Task a", now: T0 + 1, requestId: "req-00002"}), page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task a", fields: {description: "hi"}, now: T0 + 2, requestId: "req-00003"})];
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue(queue)), queue);
      assert.equal(page.ACTION_QUEUE_KEY, "taskhub-action-queue");
    });
    it("is empty for nothing, damaged text or JSON that is not a list", () => {
      const page = load();
      for (const text of [null, undefined, "", "not json", "{}", "5", "null", "\"x\""]) assert.deepEqual(page.parseActionQueue(text), [], String(text));
      assert.equal(page.serializeActionQueue(undefined), "[]");
    });
    it("drops unusable actions and repeated request ids", () => {
      const page = load();
      const good = action(page, {requestId: "req-00001"});
      const list = [good, null, 5, "x", [], {...good, requestId: "req-00002", status: "SENT"}, {...good, requestId: "req-00003", kind: "PURGE"}, {...good, requestId: "req-00004", at: 1.5}, {...good, requestId: "req-00005", fields: {action: "NOPE"}}, {...good, title: "again"}, {...good, requestId: "req-00006", taskId: ""}];
      assert.deepEqual(page.cleanActionQueue(list), [good]);
      assert.deepEqual(page.cleanActionQueue("no"), []);
    });
    it("keeps a FAILED action with its error, cut, and \"Not sent\" when there is none", () => {
      const page = load();
      const good = action(page, {requestId: "req-00001"});
      const [a, b, c] = page.cleanActionQueue([{...good, status: "FAILED", error: "Task not found"}, {...good, requestId: "req-00002", status: "FAILED"}, {...good, requestId: "req-00003", status: "FAILED", error: "e".repeat(500)}]);
      assert.equal(a.error, "Task not found");
      assert.equal(b.error, "Not sent");
      assert.equal(c.error.length, 300);
      assert.equal(page.cleanActionQueue([good])[0].error, undefined, "a PENDING action has no error");
      assert.equal("error" in page.cleanActionQueue([{...good, error: "stale"}])[0], false);
    });
    it("holds at most ACTION_QUEUE_MAX, the oldest", () => {
      const page = load();
      const list = Array.from({length: 60}, (_, i) => action(page, {requestId: `req-${String(i).padStart(5, "0")}`, now: T0 + i}));
      const kept = page.cleanActionQueue(list);
      assert.equal(page.ACTION_QUEUE_MAX, 50);
      assert.equal(kept.length, 50);
      assert.equal(kept[0].requestId, "req-00000");
      assert.equal(kept[49].requestId, "req-00049");
    });
    it("holds only the kinds stage 1 can replay and the fields it can apply", () => {
      const page = load();
      assert.deepEqual(page.ACTION_KINDS, ["TIMER", "COMPLETE", "REOPEN", "EDIT", "UNDO", "COMMENT", "COMMENT_DELETE", "DELETE", "SHOPPING_ADD", "SHOPPING_REMOVE", "BATCH"]);
      assert.deepEqual(page.EDIT_FIELDS, ["title", "priority", "estimatedMinutes", "tags", "dueDate", "recurrence", "travelKm", "phone", "email", "url", "location", "snoozedUntil", "description", "materials"]);
      assert.deepEqual(page.ENTRY_EDIT_FIELDS, ["priority", "trackedSeconds", "tags", "travelKm", "phone", "email", "url", "location", "description", "projectId"]);
    });
  });

  describe("clockOffsetFrom", () => {
    it("is the server's time less the device's", () => {
      const {clockOffsetFrom} = load();
      assert.equal(clockOffsetFrom(T0 + 4000, T0), 4000);
      assert.equal(clockOffsetFrom(T0 - 4000, T0), -4000);
      assert.equal(clockOffsetFrom(T0, T0), 0);
      assert.equal(clockOffsetFrom(T0 + 0.6, T0), 1);
    });
    it("is null when either time is not a number", () => {
      const {clockOffsetFrom} = load();
      for (const bad of [undefined, null, "5", NaN, Infinity]) {
        assert.equal(clockOffsetFrom(bad, T0), null, String(bad));
        assert.equal(clockOffsetFrom(T0, bad), null, String(bad));
      }
    });
  });

  describe("withPendingActions", () => {
    const timer = (page, taskId, verb, atMs, extra = {}) => page.makeQueuedAction({kind: "TIMER", taskId, title: `Task ${taskId}`, fields: {action: verb, ...extra}, now: atMs, requestId: `req-${verb}-${atMs % 1000000}`});

    it("shows the lists as they are with nothing waiting", () => {
      const page = load();
      const tasks = timerTasks();
      const completed = [{archiveId: "archive-0001", title: "Old", completedAt: iso(T0)}];
      assert.deepEqual(page.withPendingActions(tasks, completed, []), {tasks, completed});
      assert.deepEqual(page.withPendingActions(undefined, undefined, undefined), {tasks: [], completed: []});
      assert.deepEqual(page.withPendingActions(tasks, completed, "no"), {tasks, completed});
    });
    it("does not modify the lists it is given", () => {
      const page = load();
      const tasks = timerTasks();
      const completed = [{archiveId: "archive-0001", title: "Old", completedAt: iso(T0 - MIN), trackedSeconds: 60}];
      const actions = [timer(page, "a", "START", T0), page.makeQueuedAction({kind: "COMPLETE", taskId: "b", archiveId: "archive-0002", title: "B", now: T0 + MIN}), page.makeQueuedAction({kind: "REOPEN", taskId: "old", archiveId: "archive-0001", title: "Old", now: T0 + 2 * MIN}), page.makeQueuedAction({kind: "EDIT", taskId: "c", title: "C", fields: {description: "hi"}, now: T0 + 3 * MIN})];
      page.withPendingActions(tasks, completed, actions);
      assert.deepEqual(tasks, timerTasks());
      assert.deepEqual(completed, [{archiveId: "archive-0001", title: "Old", completedAt: iso(T0 - MIN), trackedSeconds: 60}]);
    });
    it("replays timer actions in order at the time each was made", () => {
      const page = load();
      const actions = [timer(page, "a", "START", T0), timer(page, "a", "PAUSE", T0 + 5 * MIN), timer(page, "c", "START", T0 + 6 * MIN)];
      const shown = page.withPendingActions(timerTasks(), [], actions).tasks;
      const a = shown.find((t) => t.id === "a");
      const b = shown.find((t) => t.id === "b");
      const c = shown.find((t) => t.id === "c");
      assert.equal(a.trackedSeconds, 300);
      assert.equal(a.timerStartedAt, undefined);
      assert.equal(a.firstStartedAt, iso(T0));
      assert.equal(b.timerStartedAt, undefined, "starting a paused b, which had been running, at the time a was started");
      assert.equal(b.trackedSeconds, 120 + 10 * 60);
      assert.equal(b.active, undefined);
      assert.equal(c.timerStartedAt, iso(T0 + 6 * MIN));
      assert.equal(c.active, true);
      assert.equal(a.active, undefined);
    });
    it("never counts a negative stretch when a pause was booked before its start", () => {
      const page = load();
      const actions = [timer(page, "a", "START", T0), timer(page, "a", "PAUSE", T0 - 30 * 1000)];
      assert.equal(page.withPendingActions(timerTasks(), [], actions).tasks.find((t) => t.id === "a").trackedSeconds, 0);
    });
    it("applies a pause's cap and an abort", () => {
      const page = load();
      const capped = page.withPendingActions(timerTasks(), [], [timer(page, "b", "PAUSE", T0, {capSeconds: 60})]).tasks.find((t) => t.id === "b");
      assert.equal(capped.trackedSeconds, 180);
      const aborted = page.withPendingActions(timerTasks(), [], [timer(page, "d", "ABORT", T0)]).tasks.find((t) => t.id === "d");
      assert.equal(aborted.trackedSeconds, undefined);
      assert.equal(aborted.firstStartedAt, undefined);
    });
    it("ignores a FAILED action, and one whose target is not there", () => {
      const page = load();
      const start = timer(page, "a", "START", T0);
      assert.deepEqual(page.withPendingActions(timerTasks(), [], [{...start, status: "FAILED", error: "no"}]).tasks, timerTasks());
      assert.deepEqual(page.withPendingActions(timerTasks(), [], [timer(page, "gone", "START", T0)]).tasks, timerTasks());
      const nothing = page.withPendingActions(timerTasks(), [], [
        page.makeQueuedAction({kind: "COMPLETE", taskId: "gone", archiveId: "archive-0001", title: "G", now: T0}),
        page.makeQueuedAction({kind: "REOPEN", taskId: "x", archiveId: "archive-0009", title: "G", now: T0}),
        page.makeQueuedAction({kind: "EDIT", taskId: "gone", title: "G", fields: {description: "hi"}, now: T0}),
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0009", title: "G", fields: {description: "hi"}, now: T0}),
      ]);
      assert.deepEqual(nothing, {tasks: timerTasks(), completed: []});
    });
    it("completes a task: it leaves the Queue and heads History with its time stopped and marked waiting", () => {
      const page = load();
      const actions = [page.makeQueuedAction({kind: "COMPLETE", taskId: "b", archiveId: "archive-0002", title: "Task b", now: T0, requestId: "req-00001"})];
      const old = {archiveId: "archive-0001", title: "Old", completedAt: iso(T0 - MIN)};
      const shown = page.withPendingActions(timerTasks(), [old], actions);
      assert.deepEqual(shown.tasks.map((t) => t.id), ["a", "c", "d"]);
      assert.equal(shown.completed.length, 2);
      assert.equal(shown.completed[0].archiveId, "archive-0002");
      assert.equal(shown.completed[0].waitingRequestId, "req-00001");
      assert.equal(shown.completed[0].completedAt, iso(T0));
      assert.equal(shown.completed[0].trackedSeconds, 120 + 600);
      assert.equal(shown.completed[0].timerStartedAt, undefined);
      assert.equal(shown.completed[0].active, undefined);
      assert.equal(shown.completed[1], old);
    });
    it("places a completed entry by its time, newest first", () => {
      const page = load();
      const rows = [{archiveId: "archive-0005", title: "New", completedAt: iso(T0 + 10 * MIN)}, {archiveId: "archive-0004", title: "Old", completedAt: iso(T0 - MIN)}];
      const complete = (id, archiveId, atMs) => page.makeQueuedAction({kind: "COMPLETE", taskId: id, archiveId, title: id, now: atMs, requestId: `req-${archiveId}`});
      const shown = page.withPendingActions(timerTasks(), rows, [complete("a", "archive-0006", T0), complete("c", "archive-0007", T0 + 20 * MIN)]);
      assert.deepEqual(shown.completed.map((r) => r.archiveId), ["archive-0007", "archive-0005", "archive-0006", "archive-0004"]);
    });
    it("does not add an entry the server's list already holds", () => {
      const page = load();
      const held = {archiveId: "archive-0002", title: "Task b", completedAt: iso(T0)};
      const shown = page.withPendingActions(timerTasks(), [held], [page.makeQueuedAction({kind: "COMPLETE", taskId: "b", archiveId: "archive-0002", title: "Task b", now: T0})]);
      assert.deepEqual(shown.completed, [held]);
      assert.deepEqual(shown.tasks.map((t) => t.id), ["a", "c", "d"]);
    });
    it("reopens an entry: it leaves History and joins the end of the Queue with its time and history", () => {
      const page = load();
      const finished = completeInList([task("e", {order: 3, trackedSeconds: 90, completedCount: 1, recentSeconds: [60]})], "e", "2026-10-27", () => "n", iso(T0 - 5 * MIN), 1);
      const row = {...finished.completedTask, ...finished.history, completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001"};
      const action1 = page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0});
      const shown = page.withPendingActions(timerTasks(), [row], [action1]);
      assert.deepEqual(shown.completed, []);
      const back = shown.tasks[shown.tasks.length - 1];
      assert.equal(back.id, "e");
      assert.equal(back.order, 5);
      assert.equal(back.status, "PENDING");
      assert.equal(back.trackedSeconds, 90);
      assert.equal(back.timerStartedAt, undefined);
      assert.deepEqual(back, reopenTask(timerTasks(), row, {projectIds: [], makeId: () => "x"}).task);
    });
    it("keeps a reopened task's project unless the page knows it is gone", () => {
      const page = load();
      const row = {id: "e", title: "E", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: [], projectId: "p1", projectOrder: 2, trackedSeconds: 0, completedAt: iso(T0), archiveId: "archive-0001", completedCount: 1};
      const reopen = page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "E", now: T0});
      assert.equal(page.withPendingActions([], [row], [reopen]).tasks[0].projectId, "p1");
      assert.equal(page.withPendingActions([], [row], [reopen], {projectIds: ["p1", "p2"]}).tasks[0].projectId, "p1");
      const gone = page.withPendingActions([], [row], [reopen], {projectIds: ["p2"]}).tasks[0];
      assert.equal(gone.projectId, undefined);
      assert.equal(gone.projectOrder, undefined);
    });
    it("leaves an entry that cannot be reopened where it is", () => {
      const page = load();
      const row = {id: "e", title: " ", completedAt: iso(T0), archiveId: "archive-0001"};
      const shown = page.withPendingActions([], [row], [page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "E", now: T0})]);
      assert.deepEqual(shown, {tasks: [], completed: [row]});
    });
    it("takes a waiting completion back through a waiting reopen, and the entry's waiting mark with it", () => {
      const page = load();
      const actions = [
        page.makeQueuedAction({kind: "COMPLETE", taskId: "c", archiveId: "archive-0002", title: "Task c", now: T0}),
        page.makeQueuedAction({kind: "REOPEN", taskId: "c", archiveId: "archive-0002", title: "Task c", now: T0 + MIN}),
      ];
      const shown = page.withPendingActions(timerTasks(), [], actions);
      assert.deepEqual(shown.completed, []);
      const back = shown.tasks.find((t) => t.id === "c");
      assert.ok(back);
      assert.equal("waitingRequestId" in back, false);
      assert.equal(back.trackedSeconds, 30);
    });
    it("edits description on a task, and on an entry, including one that is itself waiting", () => {
      const page = load();
      const row = {archiveId: "archive-0001", title: "Old", description: "was", completedAt: iso(T0 - MIN)};
      const edit = (target, description, atMs) => page.makeQueuedAction({kind: "EDIT", ...target, title: "t", fields: {description}, now: atMs});
      const shown = page.withPendingActions(timerTasks(), [row], [edit({taskId: "c"}, "  new ", T0), edit({archiveId: "archive-0001"}, "", T0 + 1)]);
      assert.equal(shown.tasks.find((t) => t.id === "c").description, "new");
      assert.equal("description" in shown.completed[0], false);
      const waiting = page.withPendingActions(timerTasks(), [], [
        page.makeQueuedAction({kind: "COMPLETE", taskId: "c", archiveId: "archive-0002", title: "C", now: T0}),
        edit({archiveId: "archive-0002"}, "done well", T0 + 1),
      ]);
      assert.equal(waiting.completed[0].description, "done well");
      assert.equal(waiting.completed[0].waitingRequestId !== undefined, true);
    });
    it("is the same whether the actions were all waiting or the first had been sent and the server's list holds its result", () => {
      const page = load();
      const first = timer(page, "a", "START", T0);
      const second = timer(page, "a", "PAUSE", T0 + 5 * MIN);
      const allWaiting = page.withPendingActions(timerTasks(), [], [first, second]).tasks;
      const serverAfterFirst = setTimerInList(timerTasks(), "a", "START", T0).tasks;
      assert.deepEqual(page.withPendingActions(serverAfterFirst, [], [second]).tasks, allWaiting);
    });
  });

  describe("cancelActions", () => {
    const complete = (page, id, archiveId, atMs, requestId) => page.makeQueuedAction({kind: "COMPLETE", taskId: id, archiveId, title: id, now: atMs, requestId});
    const reopen = (page, id, archiveId, atMs, requestId) => page.makeQueuedAction({kind: "REOPEN", taskId: id, archiveId, title: id, now: atMs, requestId});

    it("takes out one action and leaves the rest in order", () => {
      const page = load();
      const queue = [action(page, {requestId: "req-00001"}), action(page, {requestId: "req-00002", taskId: "b"}), action(page, {requestId: "req-00003", taskId: "c"})];
      const result = page.cancelActions(queue, "req-00002");
      assert.deepEqual(result.actions.map((a) => a.requestId), ["req-00001", "req-00003"]);
      assert.deepEqual(result.cancelled.map((a) => a.requestId), ["req-00002"]);
      assert.equal(queue.length, 3, "the input is not changed");
    });
    it("changes nothing for an unknown request id", () => {
      const page = load();
      const queue = [action(page, {requestId: "req-00001"})];
      const result = page.cancelActions(queue, "nope");
      assert.deepEqual(result, {actions: queue, cancelled: []});
      assert.notEqual(result.actions, queue);
      assert.deepEqual(page.cancelActions(undefined, "x"), {actions: [], cancelled: []});
    });
    it("takes a completion's later reopen and edits of its entry with it, and nothing else", () => {
      const page = load();
      const queue = [
        action(page, {requestId: "req-00001", taskId: "x"}),
        complete(page, "a", "archive-0001", T0, "req-00002"),
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "a", fields: {description: "hi"}, now: T0 + 1, requestId: "req-00003"}),
        complete(page, "b", "archive-0002", T0 + 2, "req-00004"),
        reopen(page, "a", "archive-0001", T0 + 3, "req-00005"),
        action(page, {requestId: "req-00006", taskId: "c"}),
      ];
      const result = page.cancelActions(queue, "req-00002");
      assert.deepEqual(result.cancelled.map((a) => a.requestId), ["req-00002", "req-00003", "req-00005"]);
      assert.deepEqual(result.actions.map((a) => a.requestId), ["req-00001", "req-00004", "req-00006"]);
    });
    it("takes what was done to a reopened task with the reopen, through a second completion too", () => {
      const page = load();
      const queue = [
        reopen(page, "a", "archive-0001", T0, "req-00001"),
        action(page, {requestId: "req-00002", taskId: "a"}),
        page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "a", fields: {description: "hi"}, now: T0 + 1, requestId: "req-00003"}),
        complete(page, "a", "archive-0009", T0 + 2, "req-00004"),
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0009", title: "a", fields: {description: "ok"}, now: T0 + 3, requestId: "req-00005"}),
        action(page, {requestId: "req-00006", taskId: "b"}),
      ];
      const result = page.cancelActions(queue, "req-00001");
      assert.deepEqual(result.cancelled.map((a) => a.requestId), ["req-00001", "req-00002", "req-00003", "req-00004", "req-00005"]);
      assert.deepEqual(result.actions.map((a) => a.requestId), ["req-00006"]);
    });
    it("leaves earlier actions on the same task alone", () => {
      const page = load();
      const queue = [action(page, {requestId: "req-00001", taskId: "a"}), complete(page, "a", "archive-0001", T0, "req-00002")];
      assert.deepEqual(page.cancelActions(queue, "req-00002").actions.map((a) => a.requestId), ["req-00001"]);
      const shown = page.withPendingActions(timerTasks(), [], page.cancelActions(queue, "req-00002").actions);
      assert.equal(shown.tasks.find((t) => t.id === "a").timerStartedAt, iso(T0), "the task is back as the earlier start left it");
    });
    it("does not take a timer action or an edit's neighbours with it", () => {
      const page = load();
      const queue = [action(page, {requestId: "req-00001", taskId: "a"}), action(page, {requestId: "req-00002", taskId: "a", fields: {action: "PAUSE"}})];
      assert.deepEqual(page.cancelActions(queue, "req-00001").cancelled.map((a) => a.requestId), ["req-00001"]);
    });
    it("takes a FAILED dependent too", () => {
      const page = load();
      const queue = [complete(page, "a", "archive-0001", T0, "req-00001"), {...reopen(page, "a", "archive-0001", T0 + 1, "req-00002"), status: "FAILED", error: "no"}];
      assert.equal(page.cancelActions(queue, "req-00001").actions.length, 0);
    });
  });

  describe("the page's clock and what is waiting", () => {
    it("keeps the offset it is given and ignores one that is not a number", () => {
      const page = load();
      const before = Date.now();
      page.setClockOffset(5000);
      const shifted = page.serverNow();
      assert.ok(shifted >= before + 5000 && shifted <= Date.now() + 5000);
      page.setClockOffset(NaN);
      page.setClockOffset(undefined);
      page.setClockOffset(null);
      assert.ok(Math.abs(page.serverNow() - (Date.now() + 5000)) < 50, "an unusable offset changes nothing");
    });
    it("measures a running timer on the server's clock", () => {
      const page = load();
      const running = {trackedSeconds: 60, timerStartedAt: iso(Date.now() + 5000 - 120 * 1000)};
      page.setClockOffset(5000);
      assert.ok(Math.abs(page.elapsedSecondsOf(running) - 180) <= 1);
      assert.ok(Math.abs(page.runningSeconds(running) - 120) <= 1);
      page.setClockOffset(0);
      assert.ok(Math.abs(page.runningSeconds(running) - 115) <= 1, "without the offset the same timer reads 5 s short");
      assert.equal(page.elapsedSecondsOf(running, Date.parse(running.timerStartedAt) + 10 * 1000), 70, "an explicit clock still wins");
    });
    it("parses a stored offset: whole milliseconds within a day", () => {
      const page = load();
      assert.equal(page.parseClockOffset("1500"), 1500);
      assert.equal(page.parseClockOffset("-86400000"), -86400000);
      assert.equal(page.parseClockOffset(" 0 "), 0);
      for (const bad of [null, undefined, "", "abc", "1.5", "86400001", "-86400001", "12345678901", 5]) assert.equal(page.parseClockOffset(bad), null, String(bad));
    });
    it("makes an action's time the device's clock plus the offset", () => {
      const page = load();
      assert.equal(action(page, {offset: 2500}).at, T0 + 2500);
      assert.equal(action(page, {offset: -2500}).at, T0 - 2500);
      assert.equal(action(page, {offset: undefined}).at, T0);
    });
    it("lists the tasks with a PENDING action, and not those with a FAILED one", () => {
      const page = load();
      const failed = {...action(page, {taskId: "c"}), status: "FAILED", error: "x"};
      const ids = page.waitingTaskIds([action(page, {taskId: "a"}), action(page, {taskId: "a", fields: {action: "PAUSE"}}), failed, null, {status: "PENDING"}, {status: "PENDING", taskId: ""}]);
      assert.deepEqual([...ids], ["a"]);
      assert.equal(page.waitingTaskIds(undefined).size, 0);
      assert.equal(page.waitingTaskIds([]).size, 0);
    });
    it("knows when something is PENDING", () => {
      const page = load();
      const failed = {...action(page), status: "FAILED", error: "x"};
      assert.equal(page.hasPendingActions([failed, action(page)]), true);
      assert.equal(page.hasPendingActions([failed]), false);
      assert.equal(page.hasPendingActions([]), false);
      assert.equal(page.hasPendingActions(undefined), false);
      assert.equal(page.hasPendingActions([null]), false);
    });
    it("says why a change cannot be kept: no storage, or a full queue", () => {
      const page = load();
      assert.equal(page.actionQueueRefusal(0, true), "");
      assert.equal(page.actionQueueRefusal(page.ACTION_QUEUE_MAX - 1, true), "");
      assert.match(page.actionQueueRefusal(0, false), /cannot keep a change for later/);
      assert.match(page.actionQueueRefusal(page.ACTION_QUEUE_MAX, true), /^50 changes are already waiting/);
      assert.match(page.actionQueueRefusal(page.ACTION_QUEUE_MAX + 5, true), /already waiting/);
    });
    it("shows a held timer change the way the server will make it, from the server's list", () => {
      const page = load();
      const start = action(page, {taskId: "a", now: T0, offset: 3000});
      const pause = action(page, {taskId: "a", fields: {action: "PAUSE"}, now: T0 + 5 * MIN, offset: 3000});
      const shown = page.withPendingActions(timerTasks(), [], [start, pause]).tasks;
      const sent = setTimerInList(setTimerInList(timerTasks(), "a", "START", T0 + 3000).tasks, "a", "PAUSE", T0 + 5 * MIN + 3000).tasks;
      assert.deepEqual(shown, sent);
      assert.equal(shown.find((t) => t.id === "a").trackedSeconds, 300);
      assert.equal(shown.find((t) => t.id === "b").timerStartedAt, undefined, "starting a task pauses the running one");
    });
  });

  describe("cards", () => {
    it("names what each action does", () => {
      const page = load();
      assert.equal(page.actionLabel(action(page, {title: "Fix gate"})), "Start timer for “Fix gate”");
      assert.equal(page.actionLabel(action(page, {title: "Fix gate", fields: {action: "PAUSE"}})), "Pause timer for “Fix gate”");
      assert.equal(page.actionLabel(action(page, {title: "Fix gate", fields: {action: "ABORT"}})), "Abort timer for “Fix gate”");
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Fix gate", now: T0})), "Complete “Fix gate”");
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "REOPEN", taskId: "a", archiveId: "archive-0001", title: "Fix gate", now: T0})), "Reopen “Fix gate”");
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Fix gate", fields: {description: "x"}, now: T0})), "Update description on “Fix gate”");
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Fix gate", fields: {priority: "HIGH", dueDate: "2026-11-02", estimatedMinutes: 20}, now: T0})), "Update priority, due date and estimate on “Fix gate”");
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Fix gate", fields: {snoozedUntil: null}, now: T0})), "Update snooze on “Fix gate”");
      assert.equal(page.actionLabel(undoAction(page, completedFixture().record, {title: "Fix gate"})), "Undo completing “Fix gate”");
      assert.equal(page.actionLabel(action(page, {title: ""})), "Start timer for task");
      assert.equal(page.actionLabel(null), "Change task");
    });
    it("says waiting, sending or the error, as an add's card does", () => {
      const page = load();
      const pending = action(page, {title: "Fix gate"});
      assert.deepEqual(page.actionCardView(pending), {label: "Start timer for “Fix gate”", failed: false, sending: false, text: "Waiting to send"});
      assert.deepEqual(page.actionCardView(pending, true), {label: "Start timer for “Fix gate”", failed: false, sending: true, text: "Sending…"});
      const failed = {...pending, status: "FAILED", error: "Task not found"};
      assert.deepEqual(page.actionCardView(failed), {label: "Start timer for “Fix gate”", failed: true, sending: false, text: "Task not found"});
      assert.equal(page.actionCardView(failed, true).failed, false, "an action on its way is never failed");
      assert.equal(page.actionCardView({...failed, error: ""}).text, "Not sent");
      assert.equal(page.actionCardView(undefined).text, "Waiting to send");
    });
    it("summarises the waiting changes for the closed card, and shows a refusal", () => {
      const page = load();
      assert.equal(page.actionQueueSummary([]), null);
      assert.equal(page.actionQueueSummary(undefined), null);
      const a = action(page, {taskId: "a"});
      const b = action(page, {taskId: "b"});
      const c = action(page, {taskId: "c"});
      assert.deepEqual(page.actionQueueSummary([a]), {label: "1 change", text: "1 waiting to send", failed: false});
      assert.deepEqual(page.actionQueueSummary([a, b, c]), {label: "3 changes", text: "3 waiting to send", failed: false});
      const refused = {...b, status: "FAILED", error: "Task not found"};
      assert.deepEqual(page.actionQueueSummary([a, refused, c]), {label: "3 changes", text: "2 waiting to send, 1 not accepted", failed: true});
      assert.deepEqual(page.actionQueueSummary([refused]), {label: "1 change", text: "1 not accepted", failed: true});
      assert.deepEqual(page.actionQueueSummary([a, refused], a.requestId), {label: "2 changes", text: "1 waiting to send, 1 not accepted", failed: true});
      assert.equal(page.actionQueueSummary([refused], refused.requestId).failed, false, "an action on its way is never counted as refused");
      assert.deepEqual(page.actionQueueSummary([a, null, "x"]), {label: "1 change", text: "1 waiting to send", failed: false});
    });
    it("asks before discarding, and says what goes with it", () => {
      const page = load();
      const pending = action(page, {title: "Fix gate"});
      assert.equal(page.actionDiscardPrompt(pending), "Discard this change (Start timer for “Fix gate”)? It has not been sent, so the change will not be made.");
      assert.match(page.actionDiscardPrompt(pending, 1), /The change made after it on the same task will be discarded too\.$/);
      assert.match(page.actionDiscardPrompt(pending, 3), /The 3 changes made after it on the same task will be discarded too\.$/);
      assert.doesNotMatch(page.actionDiscardPrompt(pending, 0), /discarded too/);
      assert.match(page.actionDiscardPrompt({...pending, status: "FAILED", error: "x"}), /The server did not accept it/);
    });
  });

  describe("completion and undo", () => {
    const completeAction = (page, id, archiveId, atMs, requestId) => page.makeQueuedAction({kind: "COMPLETE", taskId: id, archiveId, title: `Task ${id}`, now: atMs, requestId});

    it("undoInList gives the server's answer for every record", () => {
      const page = load();
      let compared = 0;
      for (const recurrence of [undefined, {frequency: "WEEKLY", interval: 1}]) {
        for (const extra of [{}, {locked: true}, {description: "gate"}]) {
          const {done, record} = completedFixture(extra, recurrence);
          const lists = [done.tasks, [...done.tasks, record.task], [], [task("q")]];
          for (const list of lists) {
            for (const rec of [record, {...record, spawnedId: null}, {...record, spawnedId: "nope"}, {task: null}, {}, null, undefined]) {
              const input = JSON.parse(JSON.stringify(list));
              assert.deepEqual(page.undoInList(input, rec), serverUndoInList(JSON.parse(JSON.stringify(list)), rec), JSON.stringify([extra, recurrence, rec && rec.spawnedId]));
              assert.deepEqual(input, list, "the input is not modified");
              compared++;
            }
          }
        }
      }
      assert.ok(compared > 100);
    });
    it("completionRecord is what the server keeps of a completion", () => {
      const page = load();
      for (const recurrence of [undefined, {frequency: "WEEKLY", interval: 1}]) {
        for (const extra of [{}, {timerStartedAt: undefined, active: undefined}, {trackedSeconds: undefined}]) {
          const {before, done, record} = completedFixture(extra, recurrence);
          const mine = page.completionRecord(before.find((t) => t.id === "a"), T0, "archive-0001", done.spawned && done.spawned.id);
          assert.deepEqual(mine, {task: record.task, archiveId: record.archiveId, spawnedId: record.spawnedId});
        }
      }
      assert.deepEqual(page.completionRecord(task("a"), T0, undefined, undefined), {task: page.settleTimer(task("a"), T0), archiveId: null, spawnedId: null});
    });
    it("shows a sent completion undone as the server leaves the list, the next occurrence gone and the entry out of History", () => {
      const page = load();
      for (const recurrence of [undefined, {frequency: "WEEKLY", interval: 1}]) {
        const {before, done, record} = completedFixture({}, recurrence);
        const entry = page.completedRowOf(before.find((t) => t.id === "a"), T0, "archive-0001");
        const completed = [entry, {archiveId: "archive-0000", title: "Older", completedAt: iso(T0 - 5 * MIN)}];
        const shown = page.withPendingActions(done.tasks, completed, [undoAction(page, record)]);
        assert.deepEqual(shown.tasks, serverUndoInList(done.tasks, record).tasks);
        assert.deepEqual(shown.completed.map((r) => r.archiveId), ["archive-0000"]);
        assert.equal(shown.tasks.some((t) => t.id === "spawn-1"), false, "the next occurrence is taken off");
        const back = shown.tasks.find((t) => t.id === "a");
        assert.equal(back.timerStartedAt, undefined);
        assert.equal(back.active, undefined);
        assert.equal(back.googleCalendarEventId, undefined);
        assert.equal(back.order, 3, "the task keeps its own rank");
      }
    });
    it("shows a completion and its undo, both waiting, as nothing happening to the task", () => {
      const page = load();
      const {before, record} = completedFixture();
      const queue = [completeAction(page, "a", "archive-0001", T0, "req-c0001"), undoAction(page, record, {requestId: "req-u0001"})];
      const shown = page.withPendingActions(before, [], queue);
      assert.deepEqual(shown.completed, []);
      const back = shown.tasks.find((t) => t.id === "a");
      assert.equal(back.trackedSeconds, 120 + 10 * 60, "its timer was settled by the completion, which the undo does not take back");
      assert.deepEqual(shown.tasks.map((t) => t.id).sort(), ["a", "y", "z"]);
    });
    it("does nothing for an undo whose task is already on the list, or that was refused", () => {
      const page = load();
      const {before, record} = completedFixture();
      const history = [{archiveId: "archive-0001", title: "Task a", completedAt: iso(T0)}];
      const undo = undoAction(page, record);
      assert.deepEqual(page.withPendingActions(before, history, [undo]), {tasks: before, completed: history}, "the task is there: the server leaves the archive alone too");
      const {done} = completedFixture();
      assert.deepEqual(page.withPendingActions(done.tasks, history, [{...undo, status: "FAILED", error: "Nothing to undo"}]), {tasks: done.tasks, completed: history});
    });
    it("holds an UNDO only with the task it puts back, its ids and a usable next-occurrence id", () => {
      const page = load();
      const {record} = completedFixture();
      const good = undoAction(page, record, {requestId: "req-u0001"});
      assert.equal(good.kind, "UNDO");
      assert.equal(good.taskId, "a");
      assert.equal(good.archiveId, "archive-0001");
      assert.deepEqual(good.fields.task, record.task);
      assert.notEqual(good.fields.task, record.task, "the task is copied");
      const make = (over) => page.makeQueuedAction({kind: "UNDO", taskId: "a", archiveId: "archive-0001", title: "Task a", fields: {task: record.task}, now: T0, ...over});
      assert.ok(make({}));
      assert.equal(make({fields: undefined}), null);
      assert.equal(make({fields: {}}), null);
      assert.equal(make({fields: {task: null}}), null);
      assert.equal(make({fields: {task: [record.task]}}), null);
      assert.equal(make({fields: {task: {...record.task, id: "b"}}}), null, "the task it carries is the one it names");
      assert.equal(make({fields: {task: {...record.task, title: 5}}}), null);
      assert.equal(make({fields: {task: {...record.task, id: ""}}, taskId: ""}), null);
      assert.equal(make({taskId: undefined}), null);
      assert.equal(make({archiveId: "short"}), null);
      assert.equal(make({archiveId: "__name__"}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: 5}}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: ""}}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: "spawn-1"}}).fields.spawnedId, "spawn-1");
      assert.equal("spawnedId" in make({fields: {task: record.task, spawnedId: null}}).fields, false);
      assert.equal(make({fields: {task: {...record.task, description: "x".repeat(page.UNDO_TASK_MAX_CHARS)}}}), null, "an absurd task is refused");
    });
    it("keeps an UNDO through the stored queue", () => {
      const page = load();
      const {record} = completedFixture({}, {frequency: "WEEKLY", interval: 1});
      const queue = [completeAction(page, "a", "archive-0001", T0, "req-c0001"), undoAction(page, record, {requestId: "req-u0001"})];
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue(queue)), queue);
      assert.deepEqual([...page.waitingTaskIds(queue)], ["a"]);
    });
    it("takes the undo with a completion that is cancelled, and a task's later actions with an undo", () => {
      const page = load();
      const {record} = completedFixture();
      const complete = completeAction(page, "a", "archive-0001", T0, "req-c0001");
      const undo = undoAction(page, record, {requestId: "req-u0001"});
      const timer = page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "Task a", fields: {action: "START"}, now: T0 + 2 * MIN, requestId: "req-t0001"});
      const other = page.makeQueuedAction({kind: "TIMER", taskId: "b", title: "Task b", fields: {action: "START"}, now: T0 + 3 * MIN, requestId: "req-t0002"});
      const queue = [complete, undo, timer, other];
      assert.deepEqual(page.cancelActions(queue, "req-c0001").cancelled.map((a) => a.requestId), ["req-c0001", "req-u0001", "req-t0001"]);
      assert.deepEqual(page.cancelActions(queue, "req-u0001").actions.map((a) => a.requestId), ["req-c0001", "req-t0002"]);
    });
    it("chooses what Undo does for a completion: cancel it while it waits, otherwise send", () => {
      const page = load();
      const waiting = completeAction(page, "a", "archive-0001", T0, "req-c0001");
      assert.equal(page.undoPlan([waiting], "req-c0001", ""), "CANCEL");
      assert.equal(page.undoPlan([waiting], "req-c0001", "req-other"), "CANCEL");
      assert.equal(page.undoPlan([waiting], "req-c0001", "req-c0001"), "SEND", "it is on its way: the server may have it");
      assert.equal(page.undoPlan([], "req-c0001", ""), "SEND", "sent, or never held");
      assert.equal(page.undoPlan(undefined, "req-c0001", ""), "SEND");
      assert.equal(page.undoPlan([{...waiting, status: "FAILED", error: "no"}], "req-c0001", ""), "NONE", "refused: the task is back already");
      assert.equal(page.undoPlan([null, waiting], "req-c0001", ""), "CANCEL");
    });
    it("blocks what follows a change the server refused, and nothing else", () => {
      const page = load();
      const {record} = completedFixture();
      const failed = {...completeAction(page, "a", "archive-0001", T0, "req-c0001"), status: "FAILED", error: "Task not found"};
      const undo = undoAction(page, record, {requestId: "req-u0001"});
      assert.equal(page.blockedBy([failed, undo], undo).requestId, "req-c0001", "an undo would put back some other removal");
      assert.equal(page.blockedBy([{...failed, status: "PENDING", error: undefined}, undo], undo), null, "only a refusal blocks");
      assert.equal(page.blockedBy([undo, failed], undo), null, "only what came before counts");
      const otherTask = completeAction(page, "b", "archive-0002", T0, "req-c0002");
      assert.equal(page.blockedBy([failed, otherTask], otherTask), null);
      const failedUndo = {...undo, status: "FAILED", error: "Nothing to undo"};
      const timer = page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "Task a", fields: {action: "START"}, now: T0 + 2 * MIN, requestId: "req-t0001"});
      assert.equal(page.blockedBy([failedUndo, timer], timer).requestId, "req-u0001", "the task never came back");
      const failedTimer = {...timer, status: "FAILED", error: "Task not found"};
      const complete2 = completeAction(page, "a", "archive-0003", T0 + 3 * MIN, "req-c0003");
      assert.equal(page.blockedBy([failedTimer, complete2], complete2), null, "a refused timer does not stop a completion");
      assert.equal(page.blockedBy(undefined, undo), null);
      assert.equal(page.blockedBy([failed], {requestId: "unknown"}), null);
    });
    it("builds bodies the server accepts", () => {
      const page = load();
      const item = completeAction(page, "a", page.newArchiveId(), T0, undefined);
      const body = page.completeBody(item);
      assert.deepEqual(Object.keys(body).sort(), ["archiveId", "at", "requestId", "taskId"]);
      assert.equal(body.taskId, "a");
      assert.equal(normalizeArchiveId(body.archiveId), body.archiveId);
      assert.equal(normalizeRequestId(body.requestId), body.requestId);
      assert.deepEqual(resolveActionTime(body.at, body.at + 1000), {at: body.at}, "booked at the time it was made");
      assert.deepEqual(Object.keys(page.completeBody(item, false)).sort(), ["archiveId", "requestId", "taskId"], "the first attempt leaves the time to the server");
      const {record} = completedFixture();
      const undo = page.undoBody(undoAction(page, record, {requestId: "req-u0001"}));
      assert.deepEqual(undo, {requestId: "req-u0001"});
      assert.equal(normalizeRequestId(undo.requestId), "req-u0001");
    });
  });
  describe("reopen", () => {
    const entryRow = (extra = {}) => ({id: "e", title: "Task e", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: [], trackedSeconds: 90, description: "was", completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001", completedCount: 1, recentSeconds: [90], ...extra});
    const reopenAction = (page, over = {}) => page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0, requestId: "req-r0001", ...over});
    const editAction = (page, description, over = {}) => page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task e", fields: {description}, now: T0 - MIN, requestId: "req-e0001", ...over});

    it("sends a reopen as the entry's id and its request id, and an entry's edit as updateCompletedTask's body", () => {
      const page = load();
      const body = page.reopenBody(reopenAction(page));
      assert.deepEqual(body, {id: "archive-0001", requestId: "req-r0001"});
      assert.equal(normalizeArchiveId(body.id), body.id);
      assert.equal(normalizeRequestId(body.requestId), body.requestId);
      assert.deepEqual(page.entryEditBody(editAction(page, "new")), {id: "archive-0001", updatedFields: {description: "new"}});
      assert.deepEqual(page.entryEditBody(editAction(page, null)), {id: "archive-0001", updatedFields: {description: null}}, "cleared description are sent as null");
    });
    it("splits a form's changes into the ones that can be held and the names of the rest", () => {
      const page = load();
      assert.deepEqual(page.splitHeldFields({description: "x", trackedSeconds: 600, completedDate: "2026-10-27", completedTime: "09:00", travelKm: 3, materials: ["a"], projectId: "p"}), {held: {description: "x", trackedSeconds: 600, travelKm: 3, projectId: "p"}, other: ["completedDate", "completedTime", "materials"]});
      assert.deepEqual(page.splitHeldFields({description: null}), {held: {description: null}, other: []});
      for (const nothing of [{}, null, undefined, [], "x"]) assert.deepEqual(page.splitHeldFields(nothing), {held: {}, other: []});
    });
    it("names changed fields the way the owner knows them, each once", () => {
      const page = load();
      assert.equal(page.fieldNamesText(["trackedSeconds"]), "time spent");
      assert.equal(page.fieldNamesText(["trackedSeconds", "completedDate", "completedTime"]), "time spent and completion time");
      assert.equal(page.fieldNamesText(["tags", "materials", "trackedSeconds"]), "tags, materials and time spent");
      assert.equal(page.fieldNamesText([]), "");
      assert.equal(page.fieldNamesText(undefined), "");
    });
    it("shows an edit of an entry's description and then its reopen as the task back with those description, in order", () => {
      const page = load();
      const shown = page.withPendingActions(timerTasks(), [entryRow()], [editAction(page, "now"), reopenAction(page)]);
      assert.deepEqual(shown.completed, []);
      const back = shown.tasks[shown.tasks.length - 1];
      assert.equal(back.id, "e");
      assert.equal(back.description, "now");
      assert.equal(back.trackedSeconds, 90);
      assert.equal(back.completedCount, undefined, "its job history goes back to before the completion");
    });
    it("shows a reopen from the entry it names, whatever else History holds", () => {
      const page = load();
      const other = entryRow({id: "f", archiveId: "archive-0002", title: "Task f"});
      const shown = page.withPendingActions([], [other, entryRow()], [reopenAction(page)]);
      assert.deepEqual(shown.completed.map((r) => r.archiveId), ["archive-0002"]);
      assert.deepEqual(shown.tasks.map((t) => t.id), ["e"]);
    });
    it("a waiting reopen makes its task show the Waiting to send chip, and a refused one does not", () => {
      const page = load();
      assert.deepEqual([...page.waitingTaskIds([editAction(page, "x"), reopenAction(page)])], ["e"]);
      assert.deepEqual([...page.waitingTaskIds([{...reopenAction(page), status: "FAILED", error: "Completed task not found"}])], []);
    });
    it("discarding a reopen takes later changes to its task with it, not the edit of the entry made before it", () => {
      const page = load();
      const edit = editAction(page, "x");
      const reopen = reopenAction(page);
      const start = page.makeQueuedAction({kind: "TIMER", taskId: "e", title: "Task e", fields: {action: "START"}, now: T0 + MIN, requestId: "req-t0001"});
      const cut = page.cancelActions([edit, reopen, start], "req-r0001");
      assert.deepEqual(cut.actions.map((a) => a.requestId), ["req-e0001"]);
      assert.deepEqual(cut.cancelled.map((a) => a.requestId), ["req-r0001", "req-t0001"]);
    });
    it("takes back a waiting completion: its entry and what was done to it go, and the task is as it was", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "c", archiveId: "archive-0002", title: "Task c", now: T0, requestId: "req-c0001"});
      const edit = page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0002", title: "Task c", fields: {description: "x"}, now: T0 + MIN, requestId: "req-e0002"});
      const other = page.makeQueuedAction({kind: "TIMER", taskId: "d", title: "Task d", fields: {action: "START"}, now: T0 - MIN, requestId: "req-t0002"});
      const taken = page.takeBackCompletion([other, complete, edit], timerTasks(), [], "req-c0001");
      assert.deepEqual(taken.actions.map((a) => a.requestId), ["req-t0002"]);
      assert.deepEqual(taken.cancelled.map((a) => a.requestId), ["req-c0001", "req-e0002"]);
      assert.equal(taken.pause, null, "its timer was not running");
      const shown = page.withPendingActions(timerTasks(), [], taken.actions);
      assert.deepEqual(shown.tasks.find((t) => t.id === "c"), timerTasks().find((t) => t.id === "c"));
      assert.deepEqual(shown.completed, []);
    });
    it("pauses the timer a taken-back completion stopped, at the instant of the completion, so the task comes back stopped with its time", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "b", archiveId: "archive-0003", title: "Task b", now: T0, requestId: "req-c0001"});
      const taken = page.takeBackCompletion([complete], timerTasks(), [], "req-c0001");
      assert.equal(taken.pause.kind, "TIMER");
      assert.deepEqual(taken.pause.fields, {action: "PAUSE"});
      assert.equal(taken.pause.at, T0);
      assert.deepEqual(taken.actions, [taken.pause]);
      const back = page.withPendingActions(timerTasks(), [], taken.actions).tasks.find((t) => t.id === "b");
      assert.equal(back.timerStartedAt, undefined);
      assert.equal(back.trackedSeconds, 120 + 10 * 60, "the same time the completion would have booked");
    });
    it("takes back nothing for a completion that is not waiting", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "c", archiveId: "archive-0002", title: "Task c", now: T0, requestId: "req-c0001"});
      assert.equal(page.takeBackCompletion([], timerTasks(), [], "req-c0001"), null, "already sent");
      assert.equal(page.takeBackCompletion([{...complete, status: "FAILED", error: "Task not found"}], timerTasks(), [], "req-c0001"), null);
      assert.equal(page.takeBackCompletion([complete], timerTasks(), [], "req-other"), null);
      assert.equal(page.takeBackCompletion(undefined, undefined, undefined, "req-c0001"), null);
    });
  });
  describe("holding the edit of a queued task", () => {
    const samples = {
      snoozedUntil: [null, "", "2026-11-03", "2026-02-30", "2026-13-01", "tomorrow", 5, undefined],
      travelKm: [null, "", " 12.34 ", "0", 0, 0.04, 12.46, -1, "abc", "1e3", 10000, 10000.1, true, undefined, "1234567"],
      phone: [null, "", "  021  555\n1234 ", "x".repeat(40), "x".repeat(41), 5, undefined],
      email: [null, "", " a@b.co ", "not an email", "a@b", "x".repeat(95) + "@b.co", 5, undefined],
      url: [null, "", "  ", " example.com/menu ", "https://example.com/a?b=1", "http://example.com", "localhost:3000", "javascript:alert(1)", "mailto:a@b.co", "ex ample.com", "https://", "x".repeat(501), 5, undefined],
      location: [null, "", "  ", "Orewa", {name: " 12  Beach Rd "}, {name: "x", latitude: -36.5, longitude: 174.7}, {name: "x", latitude: -36.5}, {name: "x", latitude: 91, longitude: 0}, {latitude: 1, longitude: 2}, {name: ""}, {}, {name: 5}, [], undefined, {name: "x".repeat(201)}],
      recurrence: [null, undefined, {frequency: "weekly", interval: 2}, {frequency: "NONE"}, {frequency: "DAILY"}, {frequency: "DAILY", interval: 0}, {frequency: "DAILY", interval: 9999}, {frequency: "HOURLY", interval: 1}, "WEEKLY", [], {interval: 2}],
    };
    it("reads each value as the server does", () => {
      const page = load();
      const server = {snoozedUntil: normalizeSnooze, travelKm: normalizeTravelKm, phone: normalizePhone, email: normalizeEmail, url: normalizeUrl, location: normalizeLocation, recurrence: normalizeRecurrence};
      const copy = {snoozedUntil: page.normalizeSnooze, travelKm: page.normalizeTravelKm, phone: page.normalizePhone, email: page.normalizeEmail, url: page.normalizeUrl, location: page.normalizeLocation, recurrence: page.normalizeRecurrence};
      for (const [key, values] of Object.entries(samples)) {
        for (const value of values) assert.deepEqual(copy[key](value), server[key](value), `${key}: ${JSON.stringify(value)}`);
      }
    });
    it("leaves a task as the server's direct update does, field by field", () => {
      const page = load();
      const olds = [task("a"), task("a", {title: "Old", priority: "LOW", estimatedMinutes: 10, tags: ["x"], dueDate: "2026-11-01", recurrence: {frequency: "DAILY", interval: 1}, travelKm: 3, phone: "021", email: "o@o.nz", url: "https://old.example/x", location: {name: "Old"}, snoozedUntil: "2026-11-02", description: "old"})];
      const fields = [
        {title: "  New title "}, {priority: "HIGH"}, {estimatedMinutes: 45}, {tags: [" a ", "", "b"]}, {tags: []}, {dueDate: "2026-12-25"}, {dueDate: ""},
        ...samples.snoozedUntil.map((v) => ({snoozedUntil: v})), ...samples.travelKm.map((v) => ({travelKm: v})), ...samples.phone.map((v) => ({phone: v})),
        ...samples.email.map((v) => ({email: v})), ...samples.url.map((v) => ({url: v})), ...samples.location.map((v) => ({location: v})), ...samples.recurrence.map((v) => ({recurrence: v})),
        {description: "  hi "}, {description: null}, {title: "T", priority: "LOW", dueDate: "2026-12-25", travelKm: 7.5, phone: "123", location: {name: "Z"}},
      ];
      for (const t of olds) {
        for (const f of fields) {
          const checked = page.checkEditFields(f, page.EDIT_FIELDS);
          if (checked.bad.length > 0) continue; // an unusable value is never held
          assert.deepEqual(page.applyEditFields(t, checked.fields), applyDirectUpdate(t, checked.fields), JSON.stringify(f));
        }
      }
    });
    it("checks the fields of an EDIT and names the bad ones", () => {
      const page = load();
      assert.deepEqual(page.checkEditFields({title: " Fix ", priority: "HIGH", estimatedMinutes: 20, tags: [" a ", ""], dueDate: "", recurrence: {frequency: "weekly"}, travelKm: "2.26", phone: " 1  2 ", email: null, location: {name: " Rd "}, snoozedUntil: "2026-11-03", description: " d "}, page.EDIT_FIELDS),
          {fields: {title: "Fix", priority: "HIGH", estimatedMinutes: 20, tags: ["a"], dueDate: "", recurrence: {frequency: "WEEKLY", interval: 1}, travelKm: 2.3, phone: "1 2", email: null, location: {name: "Rd"}, snoozedUntil: "2026-11-03", description: "d"}, bad: []});
      assert.deepEqual(page.checkEditFields({title: " ", priority: "URGENT", estimatedMinutes: 0, tags: "a", dueDate: "2026-02-30", email: "x", materials: "x"}, page.EDIT_FIELDS).bad, ["title", "priority", "estimatedMinutes", "tags", "dueDate", "email", "materials"]);
      assert.deepEqual(page.checkEditFields({estimatedMinutes: 1.5}, page.EDIT_FIELDS).bad, ["estimatedMinutes"]);
      for (const none of [{}, null, [], "x", undefined]) assert.deepEqual(page.checkEditFields(none, page.EDIT_FIELDS).bad, ["fields"]);
      assert.deepEqual(page.checkEditFields({title: "x"}, page.ENTRY_EDIT_FIELDS).bad, ["title"], "an entry holds only the plain fields of its archive row");
    });
    it("holds a task's EDIT with every changed field and sends exactly those to updateTaskDirect", () => {
      const page = load();
      const edit = page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Task a", fields: {priority: "HIGH", snoozedUntil: null, location: {name: " Rd "}}, now: T0, requestId: "req-00001"});
      assert.deepEqual(edit.fields, {priority: "HIGH", snoozedUntil: null, location: {name: "Rd"}});
      assert.deepEqual(page.taskEditBody(edit), {taskId: "a", action: "UPDATE", updatedFields: {priority: "HIGH", snoozedUntil: null, location: {name: "Rd"}}});
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue([edit])), [edit], "it survives the stored queue");
    });
    it("shows the waiting edits on the task, in order, with the later one winning", () => {
      const page = load();
      const t = task("a", {title: "Old", priority: "LOW", snoozedUntil: "2026-11-02", location: {name: "Here"}, tags: ["x"]});
      const e1 = page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Old", fields: {title: "One", priority: "HIGH", snoozedUntil: null, location: null, tags: ["y", "z"]}, now: T0, requestId: "req-00001"});
      const e2 = page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "One", fields: {title: "Two", dueDate: "2026-12-01"}, now: T0 + 1, requestId: "req-00002"});
      const shown = page.withPendingActions([t, task("b")], [], [e1, e2]).tasks;
      assert.deepEqual(shown[0], applyDirectUpdate(applyDirectUpdate(t, e1.fields), e2.fields));
      assert.equal(shown[0].title, "Two");
      assert.equal(shown[0].snoozedUntil, undefined);
      assert.deepEqual(shown[1], task("b"));
      const failed = {...e1, status: "FAILED", error: "no"};
      assert.deepEqual(page.withPendingActions([t], [], [failed]).tasks, [t], "a refused edit changes nothing");
    });
    it("finds the fields a form changed and leaves out those it did not", () => {
      const page = load();
      const t = task("a", {title: "Fix gate", priority: "HIGH", estimatedMinutes: 30, tags: ["house"], dueDate: "2026-11-01", recurrence: {frequency: "WEEKLY", interval: 2}, travelKm: 4.5, phone: "021 555", email: "a@b.co", description: "d"});
      const same = {title: "Fix gate", priority: "HIGH", estimatedMinutes: 30, tags: ["house"], dueDate: "2026-11-01", recurrence: {frequency: "WEEKLY", interval: 2}, travelKm: 4.5, phone: "021 555", email: "a@b.co", description: "d"};
      assert.deepEqual(page.taskEditChanges(t, same), {});
      assert.deepEqual(page.taskEditChanges(t, {...same, description: "  d  ", phone: " 021   555 "}), {}, "typing the same thing in other spacing is no change");
      assert.deepEqual(page.taskEditChanges(task("a"), {title: "Task a", priority: "MEDIUM", estimatedMinutes: 30, tags: [], dueDate: "", recurrence: null, travelKm: null, phone: "", email: null, description: ""}), {}, "a task with no optional fields");
      assert.deepEqual(page.taskEditChanges(t, {...same, title: "Fix the gate", tags: ["house", "gate"], recurrence: null, travelKm: null, dueDate: "", description: ""}),
          {title: "Fix the gate", tags: ["house", "gate"], recurrence: null, travelKm: null, dueDate: "", description: ""});
      assert.deepEqual(page.taskEditChanges(t, {...same, recurrence: {frequency: "WEEKLY", interval: 3}}), {recurrence: {frequency: "WEEKLY", interval: 3}});
      assert.deepEqual(page.taskEditChanges(t, {...same, phone: "x".repeat(50), email: "nope", travelKm: "abc"}), {phone: "x".repeat(50), email: "nope", travelKm: "abc"}, "unusable values are kept as typed so they are named");
      assert.deepEqual(page.taskEditChanges(t, {...same, location: {name: "Orewa"}}), {location: {name: "Orewa"}}, "a location the form changed is taken as it is");
      assert.deepEqual(page.taskEditChanges(null, null), {});
    });
    it("holds a link as the server stores it, and names an unusable one", () => {
      const page = load();
      assert.deepEqual(page.checkEditFields({url: " example.com/job "}, page.EDIT_FIELDS), {fields: {url: "https://example.com/job"}, bad: []});
      assert.deepEqual(page.checkEditFields({url: ""}, page.EDIT_FIELDS), {fields: {url: null}, bad: []}, "an emptied box removes it");
      assert.deepEqual(page.checkEditFields({url: "javascript:alert(1)"}, page.EDIT_FIELDS).bad, ["url"]);
      assert.deepEqual(page.checkEditFields({url: "https://a.example"}, page.ENTRY_EDIT_FIELDS), {fields: {url: "https://a.example"}, bad: []});
      const t = task("a", {url: "https://a.example/x"});
      assert.deepEqual(page.taskEditChanges(t, {url: "https://a.example/x"}), {}, "the same link is no change");
      assert.deepEqual(page.taskEditChanges(t, {url: " https://a.example/x "}), {}, "other spacing is no change");
      assert.deepEqual(page.taskEditChanges(t, {url: null}), {url: null});
      assert.deepEqual(page.taskEditChanges(task("a"), {url: null}), {}, "none left as none");
      assert.deepEqual(page.taskEditChanges(t, {url: "b.example"}), {url: "b.example"});
      assert.deepEqual(page.taskEditChanges(t, {url: "no way"}), {url: "no way"}, "an unusable link is kept as typed so it is named");
      assert.equal(page.fieldNamesText(["url", "email"]), "link and email");
    });
    it("names the changes that need the server: project, order number, task number", () => {
      const page = load();
      const t = task("a", {projectId: "p1", projectOrder: 2, materials: [{id: "m1", text: "Screws", checked: false, cost: 3}]});
      const form = {materials: [{id: "m1", text: "Screws", checked: false, cost: 3}], projectId: "p1", projectOrder: 2, title: "x"};
      assert.deepEqual(page.serverOnlyEditChanges(t, form), []);
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, materials: [{id: "m1", text: "Screws", checked: true, cost: 3}]}), [], "materials are held");
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, materials: null}), [], "materials are held");
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, projectId: "p2"}), ["projectId"]);
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, projectId: null, projectOrder: null}), ["projectId", "projectOrder"]);
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, projectOrder: 3}), ["projectOrder"]);
      assert.deepEqual(page.serverOnlyEditChanges(t, {...form, queueNumber: 1}), ["queueNumber"]);
      assert.deepEqual(page.serverOnlyEditChanges(task("b"), {materials: null, projectId: null, projectOrder: null}), [], "a task with none, left with none");
      assert.deepEqual(page.serverOnlyEditChanges(task("b"), {}), []);
      assert.equal(page.fieldNamesText(["projectId", "projectOrder", "queueNumber", "materials"]), "project, order number, task number and materials");
    });
  });
  describe("holding a task's materials", () => {
    const list = () => [{id: "m1", text: "Screws", checked: false, cost: 3.5}, {id: "m2", text: "Paint", checked: false}, {id: "m3", text: "Brush", checked: true}];
    const withList = (extra = {}) => task("a", {materials: list(), ...extra});
    const materialsEdit = (page, materials, over = {}) => page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Task a", fields: {materials}, now: T0, requestId: "req-m0001", ...over});
    it("reads a cost and a list as the server does", () => {
      const page = load();
      for (const cost of [null, "", " 12.5 ", "12.345", 12.345, 0, "0", -1, "abc", "1e3", 1000000, 1000000.01, "1234567890", true, undefined, {}, "7.1234567"]) {
        assert.deepEqual(page.normalizeMaterialCost(cost), serverNormalizeMaterialCost(cost), JSON.stringify(cost));
      }
      let n = 0;
      const makeId = () => `new-${++n}`;
      const many = Array.from({length: 35}, (_, i) => ({id: `x${i}`, text: `Item ${i}`, checked: i % 2 === 0}));
      const lists = [null, undefined, [], "x", {}, list(), [{text: "  Nails  "}], [{id: "m1", text: "A"}, {id: "m1", text: "B"}], [{id: "bad id", text: "A"}, {id: "", text: "B", cost: "4"}], [{id: "m1", text: " "}, null, 5, {text: 5}], [{id: "m1", text: "x".repeat(150), checked: "yes", cost: "2.50"}], many, [{id: "m1", text: "A", cost: -1}, {id: "m2", text: "B", cost: "abc"}]];
      for (const value of lists) {
        n = 0;
        const expected = serverNormalizeMaterials(value, makeId);
        n = 0;
        assert.deepEqual(page.normalizeMaterials(value, makeId), expected, JSON.stringify(value));
      }
      assert.equal(page.MAX_MATERIALS, 30);
    });
    it("holds only a list in which every kept item has an id of its own", () => {
      const page = load();
      assert.deepEqual(page.heldMaterials(list()), list());
      assert.equal(page.heldMaterials(null), null);
      assert.equal(page.heldMaterials([]), null, "an empty list is no materials");
      assert.equal(page.heldMaterials([{id: "m1", text: " "}]), null, "an item with no text is dropped, whatever its id");
      assert.deepEqual(page.heldMaterials([{text: " "}, {id: "m1", text: " Nails ", checked: "no", cost: "2"}]), [{id: "m1", text: "Nails", checked: false, cost: 2}]);
      for (const bad of [[{text: "Nails"}], [{id: "", text: "Nails"}], [{id: "a b", text: "Nails"}], [{id: "m1", text: "A"}, {id: "m1", text: "B"}], "x", {}, undefined, 5]) assert.equal(page.heldMaterials(bad), undefined, JSON.stringify(bad));
      const shown = page.checkEditFields({materials: list()}, page.EDIT_FIELDS);
      assert.deepEqual(shown, {fields: {materials: list()}, bad: []});
      assert.deepEqual(page.checkEditFields({materials: [{text: "Nails"}]}, page.EDIT_FIELDS).bad, ["materials"]);
      assert.deepEqual(page.checkEditFields({materials: list()}, page.ENTRY_EDIT_FIELDS).bad, ["materials"], "an entry does not hold materials");
    });
    it("gives every item an id of its own, keeping the ones it has", () => {
      const page = load();
      let n = 0;
      const made = page.withMaterialIds([{id: "m1", text: "A"}, {id: "", text: "B"}, {text: "C"}, {id: "m1", text: "D"}, {id: "a b", text: "E"}], () => `n${++n}`);
      assert.deepEqual(made.map((m) => m.id), ["m1", "n1", "n2", "n3", "n4"]);
      assert.deepEqual(made.map((m) => m.text), ["A", "B", "C", "D", "E"]);
      const input = [{id: "m1", text: "A"}];
      assert.equal(page.withMaterialIds(input, () => "x")[0], input[0], "an item that has its id is the same object");
      assert.equal(page.withMaterialIds(null, () => "x"), null);
      assert.deepEqual(page.heldMaterials(page.withMaterialIds([{text: "A"}, {text: "B", cost: 2}], () => `q${++n}`)).map((m) => m.text), ["A", "B"], "what it makes can be held");
    });
    it("leaves a task as the server's direct update does", () => {
      const page = load();
      const olds = [task("a"), withList()];
      const lists = [list(), [{id: "m1", text: "Screws", checked: true, cost: 3.5}, ...list().slice(1)], null, [], [{id: "n1", text: " New ", checked: false, cost: "4.20"}], [{id: "m1", text: "x".repeat(150), checked: true}], list().slice(1), [{id: "m3", text: "Brush", checked: true}]];
      for (const t of olds) {
        for (const materials of lists) {
          const checked = page.checkEditFields({materials}, page.EDIT_FIELDS);
          assert.deepEqual(checked.bad, []);
          assert.deepEqual(page.applyEditFields(t, checked.fields), applyDirectUpdate(t, checked.fields), JSON.stringify(materials));
        }
      }
      assert.equal(page.applyEditFields(withList(), {materials: null}).materials, undefined, "null takes the list away");
    });
    it("finds a changed list in a form and leaves an untouched one out, ignoring ids", () => {
      const page = load();
      const t = withList();
      assert.deepEqual(page.taskEditChanges(t, {materials: list()}), {});
      assert.deepEqual(page.taskEditChanges(t, {materials: list().map((m) => ({...m, id: ""}))}), {}, "a form's new rows have no ids yet");
      assert.deepEqual(page.taskEditChanges(task("b"), {materials: null}), {}, "none, left with none");
      const ticked = list().map((m) => (m.id === "m2" ? {...m, checked: true} : m));
      assert.deepEqual(page.taskEditChanges(t, {materials: ticked}), {materials: ticked});
      assert.deepEqual(page.taskEditChanges(t, {materials: null}), {materials: null}, "every item removed");
      const added = [...list(), {id: "", text: "Glue", checked: false}];
      assert.deepEqual(page.taskEditChanges(t, {materials: added}), {materials: added});
      assert.deepEqual(page.taskEditChanges(t, {materials: list().map((m) => (m.id === "m1" ? {...m, cost: 4} : m))}).materials[0].cost, 4, "a changed cost");
      assert.deepEqual(page.taskEditChanges(task("b"), {materials: [{id: "n1", text: "Glue", checked: false}]}), {materials: [{id: "n1", text: "Glue", checked: false}]}, "a first list");
    });
    it("shows a waiting check-off on the card at once, as the server will have it", () => {
      const page = load();
      const t = withList();
      assert.deepEqual(page.openMaterialGroups([t]).map((g) => g.materials.map((m) => m.id)), [["m1", "m2"]]);
      const edit = materialsEdit(page, page.withMaterialChecked(t, "m2", true));
      const shown = page.withPendingActions([t, task("b")], [], [edit]).tasks;
      assert.deepEqual(shown[0], applyDirectUpdate(t, {materials: edit.fields.materials}));
      assert.deepEqual(page.openMaterialGroups(shown).map((g) => g.materials.map((m) => m.id)), [["m1"]]);
      assert.equal(page.openMaterialCount(shown), 1);
      const all = materialsEdit(page, page.withMaterialChecked({materials: page.withMaterialChecked(t, "m2", true)}, "m1", true));
      assert.equal(page.openMaterialCount(page.withPendingActions([t], [], [all]).tasks), 0, "a task with every material ticked leaves the card");
      assert.deepEqual(page.withPendingActions([t], [], [{...edit, status: "FAILED", error: "no"}]).tasks, [t], "a refused edit changes nothing");
      assert.deepEqual(shown[1], task("b"));
    });
    it("sends the whole list to updateTaskDirect and names it on the card", () => {
      const page = load();
      const edit = materialsEdit(page, list());
      assert.deepEqual(page.taskEditBody(edit), {taskId: "a", action: "UPDATE", updatedFields: {materials: list()}});
      assert.equal(page.actionLabel(edit), "Update materials on “Task a”");
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue([edit])), [edit], "it survives the stored queue");
      assert.equal(page.actionLabel(materialsEdit(page, null)), "Update materials on “Task a”");
      assert.deepEqual(materialsEdit(page, null).fields, {materials: null}, "an emptied list is held as none");
    });
    it("merges a tick into the last waiting materials edit of the same task and nowhere else", () => {
      const page = load();
      const first = materialsEdit(page, list());
      const ticked = page.withMaterialChecked({materials: list()}, "m1", true);
      const merged = page.coalesceMaterialsEdit([first], "a", ticked, "");
      assert.equal(merged.length, 1);
      assert.equal(merged[0].requestId, first.requestId);
      assert.deepEqual(merged[0].fields, {materials: ticked});
      assert.deepEqual(first.fields, {materials: list()}, "the queue passed in is not modified");
      const other = page.makeQueuedAction({kind: "TIMER", taskId: "b", title: "Task b", fields: {action: "START"}, now: T0, requestId: "req-t0001"});
      assert.equal(page.coalesceMaterialsEdit([first, other], "a", ticked, ""), null, "not the last action");
      assert.equal(page.coalesceMaterialsEdit([other, first], "b", ticked, ""), null, "another task");
      assert.equal(page.coalesceMaterialsEdit([first], "a", ticked, first.requestId), null, "one on its way");
      assert.equal(page.coalesceMaterialsEdit([{...first, status: "FAILED", error: "no"}], "a", ticked, ""), null, "a refused one");
      const more = materialsEdit(page, list(), {fields: {materials: list(), priority: "HIGH"}});
      assert.equal(page.coalesceMaterialsEdit([more], "a", ticked, ""), null, "an edit that holds other fields too");
      assert.equal(page.coalesceMaterialsEdit([page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Task a", fields: {priority: "HIGH"}, now: T0, requestId: "req-p0001"})], "a", ticked, ""), null, "an edit of something else");
      assert.equal(page.coalesceMaterialsEdit([], "a", ticked, ""), null);
      assert.equal(page.coalesceMaterialsEdit(undefined, "a", ticked, ""), null);
      assert.equal(page.coalesceMaterialsEdit([first], "a", [{text: "no id"}], ""), null, "a list that cannot be held");
    });
  });
  describe("holding the edit of a History entry", () => {
    const entry = (extra = {}) => ({id: "e", title: "Task e", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: ["old"], trackedSeconds: 90, description: "was", completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001", completedCount: 1, recentSeconds: [90], ...extra});
    const serverEntry = (row, fields) => {
      const result = applyCompletedEdit(row, fields, {timeZone: "Pacific/Auckland", now: new Date(T0), projectIds: ["p1", "p2"]});
      if (result.error === "Nothing to change") return row; // a no-op the server refuses leaves the row as it is
      assert.ok(!result.error, `${JSON.stringify(fields)}: ${result.error}`);
      const next = {...row, ...result.set};
      for (const key of result.remove) delete next[key];
      return next;
    };
    const editEntry = (page, fields, over = {}) => page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task e", fields, now: T0, requestId: "req-n0001", ...over});

    it("checks an entry's fields as the server's correction does", () => {
      const page = load();
      assert.equal(page.MAX_TRACKED_SECONDS, 3600000);
      assert.equal(page.MAX_ENTRY_TAGS, 20);
      assert.deepEqual(page.checkEditFields({trackedSeconds: 125.4, priority: "HIGH", tags: [" a ", "A", "", "b"]}, page.ENTRY_EDIT_FIELDS), {fields: {trackedSeconds: 125, priority: "HIGH", tags: ["a", "b"]}, bad: []});
      assert.deepEqual(page.checkEditFields({trackedSeconds: 0}, page.ENTRY_EDIT_FIELDS).fields, {trackedSeconds: 0}, "0 makes the estimate count");
      assert.deepEqual(page.checkEditFields({trackedSeconds: 3600000}, page.ENTRY_EDIT_FIELDS).bad, []);
      for (const bad of [-1, 3600001, NaN, Infinity, "60", null, undefined]) assert.deepEqual(page.checkEditFields({trackedSeconds: bad}, page.ENTRY_EDIT_FIELDS).bad, ["trackedSeconds"], String(bad));
      assert.deepEqual(page.checkEditFields({trackedSeconds: 60}, page.EDIT_FIELDS).bad, ["trackedSeconds"], "a queued task's time is the timer's, never edited");
      const many = Array.from({length: 30}, (_, i) => `tag${i}`);
      assert.equal(page.cleanEntryTags([...many, "x".repeat(41)]).length, 20);
      assert.deepEqual(page.cleanEntryTags(["x".repeat(41), "ok", "OK", 5, " "]), ["ok"]);
      assert.deepEqual(page.cleanEntryTags("nope"), []);
    });
    it("leaves an entry as the server's correction does, field by field", () => {
      const page = load();
      const olds = [entry(), entry({priority: "HIGH", tags: ["x", "y"], trackedSeconds: 0, travelKm: 3, phone: "021", email: "o@o.nz", url: "https://old.example/x", location: {name: "Old", latitude: -36.6, longitude: 174.7}}), entry({projectId: "p1", projectOrder: 3})];
      const fields = [
        {priority: "MEDIUM"}, {trackedSeconds: 600}, {trackedSeconds: 0}, {trackedSeconds: 125.6}, {tags: [" a ", "A", "", "b"]}, {tags: []},
        {tags: Array.from({length: 25}, (_, i) => `t${i}`)}, {travelKm: 2.26}, {travelKm: null}, {travelKm: 0}, {phone: " 1  2 "}, {phone: null},
        {email: "a@b.co"}, {email: null}, {url: " example.com/job "}, {url: null}, {url: ""}, {location: {name: " Rd "}}, {location: null}, {location: {name: "P", latitude: -36.6, longitude: 174.7}},
        {description: "  hi "}, {description: null}, {description: ""},
        {projectId: "p1"}, {projectId: "p2"}, {projectId: null}, {projectId: ""}, {projectId: "p2", priority: "HIGH"},
        {priority: "LOW", trackedSeconds: 30, tags: ["q"], travelKm: 7.5, phone: "123", email: "z@z.nz", url: "https://z.example", location: {name: "Z"}, description: "all"},
      ];
      for (const row of olds) {
        for (const f of fields) {
          const checked = page.checkEditFields(f, page.ENTRY_EDIT_FIELDS);
          if (checked.bad.length > 0) continue; // an unusable value is never held
          assert.deepEqual(page.applyEditFields(row, checked.fields, page.ENTRY_EDIT_FIELDS), serverEntry(row, checked.fields), JSON.stringify(f));
        }
      }
    });
    it("shows a held project change in History as the server's correction leaves the row, and drops the order number", () => {
      const page = load();
      const row = entry({projectId: "p1", projectOrder: 3});
      const to = (fields) => page.withPendingActions([], [row], [editEntry(page, fields)]).completed[0];
      assert.equal(to({projectId: "p2"}).projectId, "p2");
      assert.equal("projectOrder" in to({projectId: "p2"}), false, "another project drops the order number");
      assert.equal(to({projectId: "p1"}).projectOrder, 3, "the same project changes nothing");
      const none = to({projectId: null});
      assert.equal("projectId" in none || "projectOrder" in none, false, "none drops both");
      const second = page.withPendingActions([], [entry()], [editEntry(page, {projectId: "p1"}), editEntry(page, {projectId: "p2"}, {requestId: "req-n0002"})]).completed[0];
      assert.equal(second.projectId, "p2", "held changes apply in order");
    });
    it("sends a held project change to updateCompletedTask, with None as null", () => {
      const page = load();
      assert.deepEqual(page.entryEditBody(editEntry(page, {projectId: "p1"})), {id: "archive-0001", updatedFields: {projectId: "p1"}});
      assert.deepEqual(page.entryEditBody(editEntry(page, {projectId: ""})), {id: "archive-0001", updatedFields: {projectId: null}});
    });
    it("replays an entry's EDIT in History and on the entry a REOPEN brings back", () => {
      const page = load();
      const edit = editEntry(page, {trackedSeconds: 600, tags: ["new"], priority: "HIGH"});
      const shown = page.withPendingActions([], [entry()], [edit]);
      assert.equal(shown.completed[0].trackedSeconds, 600);
      assert.deepEqual(shown.completed[0].tags, ["new"]);
      assert.equal(shown.completed[0].priority, "HIGH");
      assert.equal(shown.completed[0].estimatedMinutes, 10, "what was not edited stays");
      const reopen = page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0 + 1, requestId: "req-n0002"});
      const back = page.withPendingActions([], [entry()], [edit, reopen]);
      assert.equal(back.completed.length, 0);
      assert.equal(back.tasks[0].trackedSeconds, 600, "the task comes back with the corrected time");
      assert.deepEqual(back.tasks[0].tags, ["new"]);
      const failed = {...edit, status: "FAILED", error: "no"};
      assert.deepEqual(page.withPendingActions([], [entry()], [failed]).completed, [entry()], "a refused edit changes nothing");
    });
    it("replays an EDIT behind the COMPLETE of a waiting entry and drops it with that completion", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0007", title: "Task a", now: T0, requestId: "req-n0003"});
      const edit = page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0007", title: "Task a", fields: {trackedSeconds: 1800, phone: "021 555"}, now: T0 + 1, requestId: "req-n0004"});
      const shown = page.withPendingActions([task("a", {trackedSeconds: 60})], [], [complete, edit]);
      assert.equal(shown.completed.length, 1);
      assert.equal(shown.completed[0].waitingRequestId, "req-n0003");
      assert.equal(shown.completed[0].trackedSeconds, 1800);
      assert.equal(shown.completed[0].phone, "021 555");
      const gone = page.cancelActions([complete, edit], "req-n0003");
      assert.deepEqual(gone.actions, []);
      assert.deepEqual(gone.cancelled.map((a) => a.requestId), ["req-n0003", "req-n0004"]);
      const failedComplete = {...complete, status: "FAILED", error: "no"};
      assert.equal(page.blockedBy([failedComplete, edit], edit).requestId, "req-n0003", "an edit is not sent behind a refused completion");
    });
    it("sends every held field to updateCompletedTask and names them on the card", () => {
      const page = load();
      const edit = editEntry(page, {trackedSeconds: 600, tags: ["a"], description: null});
      assert.deepEqual(page.entryEditBody(edit), {id: "archive-0001", updatedFields: {trackedSeconds: 600, tags: ["a"], description: null}});
      assert.equal(page.actionLabel(edit), "Update time spent, tags and description on “Task e”");
      const held = page.splitHeldFields({priority: "HIGH", trackedSeconds: 60, tags: [], travelKm: 1, phone: "1", email: "a@b.co", url: "https://a.example", location: null, description: "d", materials: ["m"], projectId: "p", completedDate: "2026-10-27", completedTime: "09:00"});
      assert.deepEqual(Object.keys(held.held), ["priority", "trackedSeconds", "tags", "travelKm", "phone", "email", "url", "location", "description", "projectId"]);
      assert.deepEqual(held.other, ["materials", "completedDate", "completedTime"]);
      assert.equal(page.fieldNamesText(held.other), "materials and completion time");
      assert.equal(page.actionLabel(editEntry(page, {projectId: "p"})), "Update project on “Task e”");
    });
  });
  describe("holding a comment", () => {
    const entry = (extra = {}) => ({id: "e", title: "Task e", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: [], trackedSeconds: 90, completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001", completedCount: 1, recentSeconds: [90], ...extra});
    const comment = (page, over = {}) => page.makeQueuedAction({kind: "COMMENT", taskId: "a", title: "Task a", fields: {id: "comment-0001", text: "  Called the client  "}, now: T0, requestId: "req-c0001", ...over});

    it("holds a COMMENT of a task or an entry with the page's comment id and the trimmed text, and nothing else", () => {
      const page = load();
      const held = comment(page);
      assert.deepEqual(held, {requestId: "req-c0001", kind: "COMMENT", taskId: "a", title: "Task a", fields: {id: "comment-0001", text: "Called the client"}, at: T0, status: "PENDING"});
      const forEntry = comment(page, {taskId: undefined, archiveId: "archive-0001", requestId: "req-c0010"});
      assert.equal(forEntry.archiveId, "archive-0001");
      assert.equal(forEntry.taskId, undefined);
      assert.equal(comment(page, {fields: {id: "comment-0001", text: "x".repeat(2500)}}).fields.text.length, 2000);
      const bad = [{fields: undefined}, {fields: {}}, {fields: {id: "short", text: "x"}}, {fields: {id: "has space 1", text: "x"}}, {fields: {id: "comment-0001", text: "   "}}, {fields: {id: "comment-0001"}}, {fields: {id: 5, text: "x"}}, {fields: [1]}, {taskId: undefined}, {archiveId: "archive-0001"}];
      for (const over of bad) assert.equal(comment(page, over), null, JSON.stringify(over));
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue([held, forEntry])).map((a) => a.fields), [held.fields, forEntry.fields], "kept across a reload");
    });
    it("adds a comment to a list as the server's addComment does", () => {
      const page = load();
      const many = Array.from({length: 200}, (_, i) => ({id: `comment-${String(i).padStart(4, "0")}`, at: 1000 + i, text: "t"}));
      const lists = [undefined, [], [{id: "comment-0001", at: 5000, text: "later"}], [{id: "comment-0001", at: 1000, text: "a"}, {id: "comment-0002", at: 3000, text: "b"}], many, "nope"];
      const given = [
        {id: "comment-0009", text: "  hi  ", at: 2000}, {id: "comment-0001", text: "again", at: 2000}, {id: "comment-0010", text: "x".repeat(2100), at: 9000},
        {id: "comment-0011", text: "same time", at: 3000}, {id: "short", text: "x", at: 2000}, {id: "comment-0012", text: " ", at: 2000}, {id: "comment-0013", text: "x", at: 0},
        {id: "comment-0014", text: "x", at: 1.5}, {id: "comment-0015", text: "x"}, null,
      ];
      for (const list of lists) {
        for (const c of given) assert.deepEqual(page.addCommentToList(list, c), serverAddComment(list, c), JSON.stringify([list && list.length, c]));
      }
      assert.equal(page.MAX_COMMENTS, 200);
    });
    it("shows a held comment on its task and entry at once, in the order written, and leaves a refused one out", () => {
      const page = load();
      const old = {id: "comment-0000", at: T0 - 10 * MIN, text: "earlier"};
      const tasks = [task("a", {comments: [old]}), task("b")];
      const shown = page.withPendingActions(tasks, [entry()], [comment(page), comment(page, {taskId: undefined, archiveId: "archive-0001", requestId: "req-c0002", fields: {id: "comment-0002", text: "on the entry"}})]);
      assert.deepEqual(shown.tasks[0].comments, [old, {id: "comment-0001", at: T0, text: "Called the client"}]);
      assert.equal(shown.tasks[1].comments, undefined, "another task is untouched");
      assert.deepEqual(shown.completed[0].comments, [{id: "comment-0002", at: T0, text: "on the entry"}]);
      const failed = {...comment(page), status: "FAILED", error: "no"};
      assert.deepEqual(page.withPendingActions(tasks, [], [failed]).tasks, tasks);
      assert.equal(page.withPendingActions(tasks, [], [comment(page), comment(page, {requestId: "req-c0003"})]).tasks[0].comments.length, 2, "a repeat of the same comment id adds nothing");
      assert.equal(page.withPendingActions([task("z")], [], [comment(page)]).tasks[0].comments, undefined, "a task that is not there is skipped");
      assert.deepEqual([...page.waitingCommentIds([comment(page), failed, page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "t", fields: {action: "START"}, now: T0})])], ["comment-0001"]);
    });
    it("puts a comment written on a waiting entry behind its COMPLETE, and it goes with that completion", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0007", title: "Task a", now: T0, requestId: "req-c0004"});
      const onEntry = page.makeQueuedAction({kind: "COMMENT", archiveId: "archive-0007", title: "Task a", fields: {id: "comment-0007", text: "done well"}, now: T0 + 1, requestId: "req-c0005"});
      const shown = page.withPendingActions([task("a", {comments: [{id: "comment-0000", at: T0 - MIN, text: "before"}]})], [], [complete, onEntry]);
      assert.deepEqual(shown.completed[0].comments.map((c) => c.text), ["before", "done well"], "the task's comments went to the entry");
      const gone = page.cancelActions([complete, onEntry], "req-c0004");
      assert.deepEqual(gone.cancelled.map((a) => a.requestId), ["req-c0004", "req-c0005"]);
      assert.equal(page.blockedBy([{...complete, status: "FAILED", error: "no"}, onEntry], onEntry).requestId, "req-c0004");
    });
    it("brings a comment along when its entry is reopened and when a removal is undone", () => {
      const page = load();
      const onEntry = page.makeQueuedAction({kind: "COMMENT", archiveId: "archive-0001", title: "Task e", fields: {id: "comment-0003", text: "kept"}, now: T0, requestId: "req-c0006"});
      const reopen = page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0 + 1, requestId: "req-c0007"});
      const back = page.withPendingActions([], [entry()], [onEntry, reopen]);
      assert.deepEqual(back.tasks[0].comments.map((c) => c.text), ["kept"]);
      const onTask = comment(page, {taskId: "e", requestId: "req-c0008"});
      assert.deepEqual(page.withPendingActions(back.tasks.map((t) => ({...t})), [], [onTask]).tasks[0].comments.map((c) => c.text), ["kept", "Called the client"], "a comment on the reopened task follows the reopen");
      // Undo puts back the task with the comments its entry holds now, as the server's undoInList does
      const removed = task("u", {comments: [{id: "comment-0020", at: 1000, text: "at removal"}]});
      const record = {task: removed, spawnedId: null};
      const held = [{id: "comment-0020", at: 1000, text: "at removal"}, {id: "comment-0021", at: 2000, text: "added after"}];
      assert.deepEqual(page.undoInList([], record, held), serverUndoInList([], record, held));
      assert.deepEqual(page.undoInList([], record, []), serverUndoInList([], record, []));
      assert.deepEqual(page.undoInList([], record), serverUndoInList([], record));
      const undo = page.makeQueuedAction({kind: "UNDO", taskId: "u", archiveId: "archive-0005", title: "u", fields: {task: removed}, now: T0, requestId: "req-c0009"});
      const row = entry({id: "u", archiveId: "archive-0005", comments: held});
      assert.deepEqual(page.withPendingActions([], [row], [undo]).tasks[0].comments, held);
    });
    it("sends a held comment to addComment with its own id and the time it was written, and names it on the card", () => {
      const page = load();
      assert.deepEqual(page.commentBody(comment(page)), {taskId: "a", id: "comment-0001", text: "Called the client", at: T0});
      assert.deepEqual(page.commentBody(comment(page, {taskId: undefined, archiveId: "archive-0001"})), {archiveId: "archive-0001", id: "comment-0001", text: "Called the client", at: T0});
      assert.equal(page.actionLabel(comment(page)), "Add comment to “Task a”");
    });
  });
  describe("holding the deletion of a comment", () => {
    const entry = (extra = {}) => ({id: "e", title: "Task e", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: [], trackedSeconds: 90, completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001", completedCount: 1, recentSeconds: [90], ...extra});
    const c = (id, at, text = "t") => ({id, at, text});
    const del = (page, over = {}) => page.makeQueuedAction({kind: "COMMENT_DELETE", taskId: "a", title: "Task a", fields: {id: "comment-0001"}, now: T0, requestId: "req-d0001", ...over});

    it("holds a COMMENT_DELETE of a task or an entry with the comment's id, and nothing else", () => {
      const page = load();
      assert.deepEqual(del(page), {requestId: "req-d0001", kind: "COMMENT_DELETE", taskId: "a", title: "Task a", fields: {id: "comment-0001"}, at: T0, status: "PENDING"});
      assert.deepEqual(del(page, {fields: {id: "comment-0001", text: "ignored"}}).fields, {id: "comment-0001"});
      assert.equal(del(page, {taskId: undefined, archiveId: "archive-0001"}).archiveId, "archive-0001");
      for (const over of [{fields: undefined}, {fields: {}}, {fields: {id: ""}}, {fields: {id: 5}}, {fields: {id: "x".repeat(201)}}, {fields: [1]}, {taskId: undefined}, {archiveId: "archive-0001"}]) assert.equal(del(page, over), null, JSON.stringify(over));
      const held = [del(page), del(page, {taskId: undefined, archiveId: "archive-0001", requestId: "req-d0002"})];
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue(held)).map((a) => a.fields), [{id: "comment-0001"}, {id: "comment-0001"}], "kept across a reload");
    });
    it("takes a comment out of a list as the server's removeComment does", () => {
      const page = load();
      const lists = [undefined, [], "nope", [c("comment-0001", 1000)], [c("comment-0001", 1000), c("comment-0002", 2000), c("comment-0003", 3000)]];
      for (const list of lists) {
        for (const id of ["comment-0001", "comment-0002", "missing", "", undefined]) assert.deepEqual(page.removeCommentFromList(list, id), serverRemoveComment(list, id), JSON.stringify([list, id]));
      }
    });
    it("hides a comment at once on its task and entry, and leaves the item alone when it is not there or the action was refused", () => {
      const page = load();
      const tasks = [task("a", {comments: [c("comment-0001", 1000), c("comment-0002", 2000)]}), task("b", {comments: [c("comment-0001", 1000)]})];
      const rows = [entry({comments: [c("comment-0001", 1000)]})];
      const shown = page.withPendingActions(tasks, rows, [del(page), del(page, {taskId: undefined, archiveId: "archive-0001", requestId: "req-d0002"})]);
      assert.deepEqual(shown.tasks[0].comments.map((x) => x.id), ["comment-0002"]);
      assert.deepEqual(shown.tasks[1].comments.map((x) => x.id), ["comment-0001"], "another task keeps its comment");
      assert.equal(shown.completed[0].comments, undefined, "the key goes with the last comment");
      assert.deepEqual(page.withPendingActions(tasks, rows, [del(page, {fields: {id: "nope-nope"}})]).tasks, tasks);
      assert.deepEqual(page.withPendingActions(tasks, rows, [{...del(page), status: "FAILED", error: "no"}]).tasks, tasks);
    });
    it("goes behind the COMPLETE or REOPEN it depends on, and is not sent behind a refused one", () => {
      const page = load();
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0007", title: "Task a", now: T0, requestId: "req-d0003"});
      const removal = del(page, {taskId: undefined, archiveId: "archive-0007", requestId: "req-d0004", now: T0 + 1});
      const shown = page.withPendingActions([task("a", {comments: [c("comment-0001", 1000), c("comment-0002", 2000)]})], [], [complete, removal]);
      assert.deepEqual(shown.completed[0].comments.map((x) => x.id), ["comment-0002"]);
      assert.deepEqual(page.cancelActions([complete, removal], "req-d0003").cancelled.map((a) => a.requestId), ["req-d0003", "req-d0004"]);
      assert.equal(page.blockedBy([{...complete, status: "FAILED", error: "no"}, removal], removal).requestId, "req-d0003");
      const reopen = page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0, requestId: "req-d0005"});
      const onTask = del(page, {taskId: "e", requestId: "req-d0006", now: T0 + 1});
      const back = page.withPendingActions([], [entry({comments: [c("comment-0001", 1000), c("comment-0002", 2000)]})], [reopen, onTask]);
      assert.deepEqual(back.tasks[0].comments.map((x) => x.id), ["comment-0002"], "the reopened task has the comment gone");
      assert.equal(page.blockedBy([{...reopen, status: "FAILED", error: "no"}, onTask], onTask).requestId, "req-d0005");
    });
    it("is undone with the comments the entry holds after the deletion, and sent to deleteComment", () => {
      const page = load();
      const removed = task("u", {comments: [c("comment-0020", 1000), c("comment-0021", 2000)]});
      const undo = page.makeQueuedAction({kind: "UNDO", taskId: "u", archiveId: "archive-0005", title: "u", fields: {task: removed}, now: T0 + 2, requestId: "req-d0007"});
      const row = entry({id: "u", archiveId: "archive-0005", comments: [c("comment-0020", 1000), c("comment-0021", 2000)]});
      const removal = del(page, {taskId: undefined, archiveId: "archive-0005", fields: {id: "comment-0020"}, requestId: "req-d0008"});
      assert.deepEqual(page.withPendingActions([], [row], [removal, undo]).tasks[0].comments.map((x) => x.id), ["comment-0021"]);
      assert.deepEqual(page.commentDeleteBody(del(page)), {taskId: "a", id: "comment-0001"});
      assert.deepEqual(page.commentDeleteBody(removal), {archiveId: "archive-0005", id: "comment-0020"});
      assert.equal(page.actionLabel(del(page)), "Delete comment on “Task a”");
    });
  });
  describe("holding a delete", () => {
    const del = (page, over = {}) => page.makeQueuedAction({kind: "DELETE", taskId: "b", title: "Task b", now: T0, requestId: "req-x0001", ...over});
    // What the server holds after deleting `id` at `atMs`, and the record it keeps for Undo (updateTaskDirect's DELETE).
    function deleted(id, atMs, tasks = timerTasks()) {
      const removed = tasks.find((t) => t.id === id);
      return {rest: tasks.filter((t) => t.id !== id), record: removalRecord("DELETE", settleTimerForDelete(removed, atMs), null, null, atMs)};
    }
    const settleTimerForDelete = (t, atMs) => require("../timer").pauseTimer(t, atMs);
    const undoOf = (page, record, over = {}) => page.makeQueuedAction({kind: "UNDO", taskId: record.task.id, title: record.task.title, fields: {task: record.task}, now: T0 + MIN, requestId: "req-x0002", ...over});

    it("holds a DELETE of a task with no fields and no entry, and keeps it across a reload", () => {
      const page = load();
      assert.deepEqual(del(page), {requestId: "req-x0001", kind: "DELETE", taskId: "b", title: "Task b", at: T0, status: "PENDING"});
      assert.equal("fields" in del(page, {fields: {action: "START"}}), false, "fields are ignored");
      assert.equal("archiveId" in del(page, {archiveId: "archive-0001"}), false, "a delete names a task only");
      for (const over of [{taskId: undefined}, {taskId: ""}, {taskId: 5}, {now: NaN}, {requestId: "short"}]) assert.equal(del(page, over), null, JSON.stringify(over));
      const queue = [del(page), del(page, {taskId: "c", requestId: "req-x0003"})];
      assert.deepEqual(page.parseActionQueue(page.serializeActionQueue(queue)), queue);
    });
    it("takes the task off the Queue at once, and leaves the lists alone when it is missing or the delete was refused", () => {
      const page = load();
      const history = [{archiveId: "archive-0001", title: "Done", completedAt: iso(T0 - MIN)}];
      const shown = page.withPendingActions(timerTasks(), history, [del(page)]);
      assert.deepEqual(shown.tasks.map((t) => t.id), ["a", "c", "d"]);
      assert.deepEqual(shown.completed, history);
      assert.deepEqual(page.withPendingActions(timerTasks(), history, [del(page, {taskId: "missing"})]).tasks, timerTasks());
      assert.deepEqual(page.withPendingActions(timerTasks(), history, [{...del(page), status: "FAILED", error: "Task not found"}]).tasks, timerTasks());
      const input = timerTasks();
      page.withPendingActions(input, history, [del(page)]);
      assert.deepEqual(input, timerTasks(), "the input is not modified");
    });
    it("replays on top of the changes waiting before it, and a task added again by Undo comes back as the server restores it", () => {
      const page = load();
      const pause = page.makeQueuedAction({kind: "TIMER", taskId: "b", title: "Task b", fields: {action: "PAUSE"}, now: T0 - 5 * MIN, requestId: "req-x0004"});
      const edit = page.makeQueuedAction({kind: "EDIT", taskId: "b", title: "Task b", fields: {description: "gate"}, now: T0 - 4 * MIN, requestId: "req-x0005"});
      assert.deepEqual(page.withPendingActions(timerTasks(), [], [pause, edit, del(page)]).tasks.map((t) => t.id), ["a", "c", "d"]);
      for (const running of [true, false]) {
        const tasks = running ? timerTasks() : timerTasks().map((t) => (t.id === "b" ? {...t, timerStartedAt: undefined, active: undefined} : t));
        const {rest, record} = deleted("b", T0, tasks);
        const mine = page.deletionRecord(tasks.find((t) => t.id === "b"), T0);
        assert.deepEqual(mine, {task: record.task, archiveId: null, spawnedId: null}, "the record the page keeps is the server's");
        const undo = undoOf(page, mine);
        assert.equal("archiveId" in undo, false);
        const server = serverUndoInList(rest, record, undefined);
        const shown = page.withPendingActions(tasks, [], [del(page), undo]);
        assert.deepEqual(shown.tasks, server.tasks, "the replay gives the list the server gives");
        assert.equal(shown.tasks.find((t) => t.id === "b").timerStartedAt, undefined);
      }
    });
    it("stops a running timer at the instant of the delete, never later", () => {
      const page = load();
      const b = timerTasks()[1];
      const later = page.deletionRecord(b, T0 + 10 * MIN).task;
      const sooner = page.deletionRecord(b, T0).task;
      assert.equal(later.trackedSeconds - sooner.trackedSeconds, 600);
      assert.equal(sooner.trackedSeconds, 120 + 10 * 60 + 0, "10 minutes ran before T0 plus the 2 saved");
      assert.equal(page.deletionRecord(task("z"), T0).task.trackedSeconds, undefined, "a task with no timer is as it was");
      assert.equal(page.deletionRecord(b, T0 - 60 * MIN).task.trackedSeconds, 120, "a stretch is never negative");
    });
    it("builds the body the server accepts, with the time only when it is held", () => {
      const page = load();
      const item = del(page);
      assert.deepEqual(page.deleteBody(item), {taskId: "b", action: "DELETE", at: T0});
      assert.deepEqual(page.deleteBody(item, false), {taskId: "b", action: "DELETE"});
      assert.deepEqual(page.removalBody(item, false), {taskId: "b", action: "DELETE"});
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Task a", now: T0, requestId: "req-x0006"});
      assert.deepEqual(page.removalBody(complete, false), page.completeBody(complete, false));
      assert.deepEqual(resolveActionTime(page.deleteBody(item).at, T0 + 1000), {at: T0}, "booked as made");
    });
    it("takes the Undo behind it along when discarded, and does not send an Undo behind a refused delete", () => {
      const page = load();
      const {record} = deleted("b", T0);
      const undo = undoOf(page, record);
      const other = del(page, {taskId: "c", requestId: "req-x0007"});
      const edit = page.makeQueuedAction({kind: "EDIT", taskId: "b", title: "Task b", fields: {description: "x"}, now: T0 - MIN, requestId: "req-x0008"});
      const removal = del(page);
      assert.deepEqual(page.cancelActions([edit, removal, other, undo], "req-x0001").cancelled.map((a) => a.requestId), ["req-x0001", "req-x0002"]);
      assert.deepEqual(page.cancelActions([edit, removal, other, undo], "req-x0001").actions.map((a) => a.requestId), ["req-x0008", "req-x0007"], "the earlier edit and the other task stay");
      const failed = {...removal, status: "FAILED", error: "Task not found"};
      assert.equal(page.blockedBy([failed, undo], undo).requestId, "req-x0001");
      assert.equal(page.blockedBy([failed, other], other), null);
      const later = page.makeQueuedAction({kind: "TIMER", taskId: "b", title: "Task b", fields: {action: "START"}, now: T0 + 2 * MIN, requestId: "req-x0009"});
      assert.equal(page.blockedBy([failed, undo, later], later), null, "only a refused change blocks: the Undo is still waiting");
      assert.equal(page.blockedBy([undo, {...undo, requestId: "req-x0010", status: "FAILED", error: "Nothing to undo"}, later], later).requestId, "req-x0010", "the task never came back");
      assert.equal(page.undoPlan([removal], "req-x0001", ""), "CANCEL");
      assert.equal(page.undoPlan([failed], "req-x0001", ""), "NONE");
      assert.equal(page.undoPlan([], "req-x0001", ""), "SEND");
    });
    it("is labelled as a delete, and its Undo as undoing a delete", () => {
      const page = load();
      const {record} = deleted("b", T0);
      assert.equal(page.actionLabel(del(page)), "Delete “Task b”");
      assert.equal(page.actionLabel(undoOf(page, record)), "Undo deleting “Task b”");
      assert.equal(page.actionCardView(del(page), false).text, "Waiting to send");
      assert.match(page.actionDiscardPrompt(del(page), 1), /Discard this change \(Delete “Task b”\)\?.*The change made after it on the same task will be discarded too\./);
      const complete = completedFixture();
      assert.equal(page.actionLabel(undoAction(page, complete.record)), "Undo completing “Task a”");
    });
  });
});

describe("Miscellaneous list actions", () => {
  const page = load();
  const add = (text, over = {}) => page.makeQueuedAction({kind: "SHOPPING_ADD", title: text, fields: {text}, now: T0, offset: 0, ...over});
  const remove = (id, text, over = {}) => page.makeQueuedAction({kind: "SHOPPING_REMOVE", title: text, fields: {id, text}, now: T0, offset: 0, ...over});
  const list = (...pairs) => pairs.map(([id, text]) => ({id, text}));

  describe("the stored action", () => {
    it("an add holds the cleaned text and names no task or entry", () => {
      const a = add("  Duct   tape ");
      assert.equal(a.kind, "SHOPPING_ADD");
      assert.deepEqual(a.fields, {text: "Duct tape"});
      assert.equal(a.title, "Duct tape");
      assert.equal(a.taskId, undefined);
      assert.equal(a.archiveId, undefined);
      assert.equal(a.status, "PENDING");
    });
    it("a removal holds the item's id and text", () => {
      const a = remove("i1", "Nails");
      assert.deepEqual(a.fields, {id: "i1", text: "Nails"});
      assert.equal(a.title, "Nails");
    });
    it("refuses a blank or too long text, a missing id and a task or entry", () => {
      assert.equal(add("   "), null);
      assert.equal(add("x".repeat(page.MAX_SHOPPING_TEXT + 1)), null);
      assert.equal(add("x".repeat(page.MAX_SHOPPING_TEXT)).fields.text.length, page.MAX_SHOPPING_TEXT);
      assert.equal(remove("", "Nails"), null);
      assert.equal(page.makeQueuedAction({kind: "SHOPPING_REMOVE", fields: {text: "Nails"}, now: T0}), null);
      assert.equal(add("Nails", {taskId: "a"}), null);
      assert.equal(add("Nails", {archiveId: "entry-0001"}), null);
      assert.equal(page.makeQueuedAction({kind: "SHOPPING_ADD", now: T0}), null);
    });
    it("survives the stored text, and a FAILED one keeps its error", () => {
      const a = add("Nails");
      const b = {...remove("i1", "Glue"), status: "FAILED", error: "Nope"};
      const back = page.parseActionQueue(page.serializeActionQueue([a, b]));
      assert.deepEqual(back, [a, b]);
    });
    it("is told apart from the task kinds", () => {
      assert.equal(page.isShoppingKind("SHOPPING_ADD"), true);
      assert.equal(page.isShoppingKind("SHOPPING_REMOVE"), true);
      assert.equal(page.isShoppingKind("EDIT"), false);
      assert.equal(page.waitingTaskIds([add("Nails"), remove("i1", "Glue")]).size, 0);
    });
  });

  describe("withPendingShopping", () => {
    it("shows a held add at the end under its temporary id", () => {
      const a = add("Nails");
      assert.deepEqual(page.withPendingShopping(list(["i1", "Glue"]), [a]), list(["i1", "Glue"], [page.shoppingTempId(a.requestId), "Nails"]));
    });
    it("adds nothing for a text already on the list (ignoring case) or a full list", () => {
      assert.deepEqual(page.withPendingShopping(list(["i1", "Nails"]), [add("NAILS")]), list(["i1", "Nails"]));
      const full = Array.from({length: page.MAX_SHOPPING_ITEMS}, (_, i) => ({id: `i${i}`, text: `Item ${i}`}));
      assert.equal(page.withPendingShopping(full, [add("One more")]).length, page.MAX_SHOPPING_ITEMS);
    });
    it("takes a ticked item off the list, and an id that is not there changes nothing", () => {
      assert.deepEqual(page.withPendingShopping(list(["i1", "Nails"], ["i2", "Glue"]), [remove("i1", "Nails")]), list(["i2", "Glue"]));
      assert.deepEqual(page.withPendingShopping(list(["i2", "Glue"]), [remove("gone", "Nails")]), list(["i2", "Glue"]));
    });
    it("takes a held add off again when its removal follows, under the temporary id", () => {
      const a = add("Nails");
      const r = remove(page.shoppingTempId(a.requestId), "Nails");
      assert.deepEqual(page.withPendingShopping(list(["i1", "Glue"]), [a, r]), list(["i1", "Glue"]));
    });
    it("finds a held add the server has saved since by its text, when the removal names the temporary id", () => {
      const r = remove("pending-abcdef123456", "Nails");
      assert.deepEqual(page.withPendingShopping(list(["real1", "nails"], ["i2", "Glue"]), [r]), list(["i2", "Glue"]));
    });
    it("replays in order, skips FAILED actions and other kinds, and does not change its inputs", () => {
      const server = list(["i1", "Nails"]);
      const copy = JSON.parse(JSON.stringify(server));
      const failed = {...add("Paint"), status: "FAILED", error: "x"};
      const timer = page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "A", fields: {action: "START"}, now: T0, offset: 0});
      const out = page.withPendingShopping(server, [remove("i1", "Nails"), failed, timer, add("Glue")]);
      assert.deepEqual(out.map((i) => i.text), ["Glue"]);
      assert.deepEqual(server, copy);
      assert.deepEqual(page.withPendingShopping(undefined, undefined), []);
    });
    it("agrees with the server's rules for an add", () => {
      const {addShoppingItem} = require("../shopping");
      const items = list(["i1", "Nails"]);
      for (const text of ["Glue", "nails", "  Wood   screws "]) {
        const mine = page.withPendingShopping(items, [add(text)]);
        const theirs = addShoppingItem(items, text, () => "x").items;
        assert.deepEqual(mine.map((i) => i.text), theirs.map((i) => i.text), text);
      }
    });
  });

  describe("order, waiting marks and what is sent", () => {
    it("a removal of a held add depends on it, so discarding the add takes both", () => {
      const a = add("Nails");
      const r = remove(page.shoppingTempId(a.requestId), "Nails");
      const other = remove("i9", "Glue");
      const out = page.cancelActions([a, r, other], a.requestId);
      assert.deepEqual(out.actions, [other]);
      assert.equal(out.cancelled.length, 2);
      assert.deepEqual(page.cancelActions([a, r, other], other.requestId).actions, [a, r]);
    });
    it("blocks a removal behind a refused add of the same item", () => {
      const a = {...add("Nails"), status: "FAILED", error: "full"};
      const r = remove(page.shoppingTempId(a.requestId), "Nails");
      assert.equal(page.blockedBy([a, r], r), a);
      assert.equal(page.blockedBy([a, remove("i1", "Glue")], remove("i1", "Glue", {requestId: "other-request-1"})), null);
    });
    it("marks the held adds as waiting", () => {
      const a = add("Nails");
      const failed = {...add("Paint"), status: "FAILED", error: "x"};
      assert.deepEqual([...page.waitingShoppingIds([a, failed, remove("i1", "Glue")])], [page.shoppingTempId(a.requestId)]);
    });
    it("a pending shopping action makes the next change wait behind it", () => {
      assert.equal(page.hasPendingShopping([add("Nails")]), true);
      assert.equal(page.hasPendingShopping([{...add("Nails"), status: "FAILED", error: "x"}]), false);
      assert.equal(page.hasPendingShopping([page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "A", fields: {action: "START"}, now: T0})]), false);
      assert.equal(page.hasPendingShopping(undefined), false);
    });
    it("sends an add's text and a removal's server id to updateShoppingList", () => {
      assert.deepEqual(page.shoppingBody(add("Nails")), {action: "ADD", text: "Nails"});
      assert.deepEqual(page.shoppingBody(remove("i1", "Nails"), "i1"), {action: "REMOVE", itemId: "i1"});
    });
    it("finds the server's id for a removal: its own, the one learned when the add was sent, or the same text on the server's list", () => {
      const own = remove("i1", "Nails");
      assert.equal(page.shoppingRemovalId(own, new Map(), []), "i1");
      const temp = remove("pending-abc123456", "Nails");
      assert.equal(page.shoppingRemovalId(temp, new Map([["pending-abc123456", "srv1"]]), []), "srv1");
      assert.equal(page.shoppingRemovalId(temp, new Map(), list(["srv2", "NAILS"])), "srv2");
      assert.equal(page.shoppingRemovalId(temp, new Map(), list(["srv3", "Glue"])), null, "not on the server: already gone, nothing to send");
      assert.equal(page.shoppingRemovalId(temp, null, null), null);
    });
    it("words the cards", () => {
      assert.equal(page.actionLabel(add("Nails")), "Add “Nails” to Miscellaneous");
      assert.equal(page.actionLabel(remove("i1", "Nails")), "Take “Nails” off Miscellaneous");
      assert.match(page.actionDiscardPrompt(add("Nails"), 1), /same item/);
      assert.match(page.actionDiscardPrompt(page.makeQueuedAction({kind: "TIMER", taskId: "a", title: "A", fields: {action: "START"}, now: T0}), 1), /same task/);
    });
  });
});

describe("Multi-Select (BATCH) actions", () => {
  const page = load();
  const list = () => [
    task("a", {order: 1, projectId: "p1", projectOrder: 2, dueDate: "2026-11-01"}),
    task("b", {order: 2, snoozedUntil: "2026-11-05"}),
    task("c", {order: 3, projectId: "p2", projectOrder: 1}),
    task("d", {order: 4}),
  ];
  const batch = (fields, over = {}) => page.makeQueuedAction({kind: "BATCH", title: "", fields: {taskIds: ["b", "d"], ...fields}, now: T0, offset: 0, ...over});
  const top = (ids = ["b", "d"], over = {}) => batch({action: "MOVE_TO_TOP", taskIds: ids}, over);

  describe("the action", () => {
    it("is a kind of its own, naming its tasks in its fields and no single target", () => {
      const a = top();
      assert.equal(a.kind, "BATCH");
      assert.equal(a.taskId, undefined);
      assert.equal(a.archiveId, undefined);
      assert.deepEqual(a.fields, {action: "MOVE_TO_TOP", taskIds: ["b", "d"]});
      assert.equal(a.status, "PENDING");
      assert.deepEqual(page.BATCH_ACTIONS, ["MOVE_TO_TOP", "SET_PROJECT", "SET_DUE", "SNOOZE"]);
    });
    it("holds each action's value as batchUpdateTasks takes it", () => {
      assert.deepEqual(batch({action: "SET_PROJECT", projectId: "p1"}, {title: "Kitchen"}).fields, {action: "SET_PROJECT", taskIds: ["b", "d"], projectId: "p1"});
      assert.equal(batch({action: "SET_PROJECT", projectId: "p1"}, {title: "Kitchen"}).title, "Kitchen");
      assert.deepEqual(batch({action: "SET_DUE", dueDate: "2026-11-09"}).fields.dueDate, "2026-11-09");
      assert.equal(batch({action: "SET_DUE", dueDate: ""}).fields.dueDate, null, "an empty date clears it");
      assert.equal(batch({action: "SET_DUE", dueDate: null}).fields.dueDate, null);
      assert.equal(batch({action: "SNOOZE", snoozedUntil: "2026-11-09"}).fields.snoozedUntil, "2026-11-09");
      assert.equal(batch({action: "SNOOZE", snoozedUntil: null}).fields.snoozedUntil, null);
    });
    it("refuses what the server would refuse", () => {
      assert.equal(batch({action: "NOPE"}), null);
      assert.equal(batch({action: "MOVE_TO_TOP", taskIds: []}), null);
      assert.equal(batch({action: "MOVE_TO_TOP", taskIds: "b"}), null);
      assert.equal(batch({action: "MOVE_TO_TOP", taskIds: ["b", 7]}), null);
      assert.equal(batch({action: "MOVE_TO_TOP", taskIds: [""]}), null);
      assert.equal(batch({action: "MOVE_TO_TOP", taskIds: Array.from({length: page.MAX_BATCH + 1}, (_, i) => "t" + i)}), null);
      assert.notEqual(batch({action: "MOVE_TO_TOP", taskIds: Array.from({length: page.MAX_BATCH}, (_, i) => "t" + i)}), null);
      assert.equal(batch({action: "SET_PROJECT"}), null, "a project needs its id");
      assert.equal(batch({action: "SET_PROJECT", projectId: ""}), null);
      assert.deepEqual(batch({action: "SET_PROJECT", projectId: null}).fields, {action: "SET_PROJECT", taskIds: ["b", "d"], projectId: null}, "null takes the tasks out of their project");
      assert.equal(batch({action: "SET_PROJECT", newProject: "Kitchen"}), null, "a new project needs the server");
      assert.equal(batch({action: "SET_DUE"}), null, "a due date change names its value");
      assert.equal(batch({action: "SET_DUE", dueDate: "2026-02-31"}), null);
      assert.equal(batch({action: "SNOOZE"}), null);
      assert.equal(batch({action: "SNOOZE", snoozedUntil: "tomorrow"}), null);
      assert.equal(page.makeQueuedAction({kind: "BATCH", title: "", fields: null, now: T0}), null);
    });
    it("names a target of neither kind", () => {
      const a = top();
      assert.equal(page.normalizeQueuedAction({...a, taskId: "b"}), null);
      assert.equal(page.normalizeQueuedAction({...a, archiveId: "arch-12345"}), null);
    });
    it("drops a repeated task id and survives storage", () => {
      const a = batch({action: "MOVE_TO_TOP", taskIds: ["b", "d", "b"]});
      assert.deepEqual(a.fields.taskIds, ["b", "d"]);
      const failed = {...batch({action: "SNOOZE", snoozedUntil: "2026-11-09"}), status: "FAILED", error: "No matching tasks"};
      const back = page.parseActionQueue(page.serializeActionQueue([a, failed]));
      assert.deepEqual(back, [a, failed]);
    });
    it("marks every task it names as waiting, until it is refused", () => {
      const failed = {...top(["a"]), status: "FAILED", error: "x"};
      assert.deepEqual([...page.waitingTaskIds([top(), failed])].sort(), ["b", "d"]);
      assert.deepEqual([...page.waitingTaskIds([failed])], []);
    });
    it("depends on nothing and nothing depends on it", () => {
      const a = top();
      const edit = page.makeQueuedAction({kind: "EDIT", taskId: "b", title: "Task b", fields: {priority: "HIGH"}, now: T0});
      assert.deepEqual(page.cancelActions([a, edit], a.requestId).actions, [edit]);
      assert.deepEqual(page.cancelActions([edit, a], edit.requestId).actions, [a]);
      assert.equal(page.blockedBy([{...edit, status: "FAILED", error: "x"}, a], a), null);
    });
    it("is sent as the body batchUpdateTasks takes", () => {
      assert.deepEqual(page.batchActionBody(top()), {action: "MOVE_TO_TOP", taskIds: ["b", "d"]});
      assert.deepEqual(page.batchActionBody(batch({action: "SET_PROJECT", projectId: "p1"})), {action: "SET_PROJECT", taskIds: ["b", "d"], projectId: "p1"});
      assert.deepEqual(page.batchActionBody(batch({action: "SET_PROJECT", projectId: null})), {action: "SET_PROJECT", taskIds: ["b", "d"], projectId: null});
      assert.deepEqual(page.batchActionBody(batch({action: "SET_DUE", dueDate: ""})), {action: "SET_DUE", taskIds: ["b", "d"], dueDate: null});
      assert.deepEqual(page.batchActionBody(batch({action: "SNOOZE", snoozedUntil: "2026-11-09"})), {action: "SNOOZE", taskIds: ["b", "d"], snoozedUntil: "2026-11-09"});
    });
    it("cannot be held for a task a waiting Reopen brought back", () => {
      assert.equal(page.unheldBatchId(["a", "pending-abc12345"]), "pending-abc12345");
      assert.equal(page.unheldBatchId(["a", "b"]), "");
      assert.equal(page.unheldBatchId(undefined), "");
    });
  });

  describe("the replay equals the server's applyBatch", () => {
    const projectIds = ["p1", "p2"];
    const cases = [
      ["MOVE_TO_TOP", {action: "MOVE_TO_TOP", taskIds: ["c", "b"]}],
      ["MOVE_TO_TOP of tasks already first", {action: "MOVE_TO_TOP", taskIds: ["a"]}],
      ["SET_PROJECT to a new one (loses its order number)", {action: "SET_PROJECT", taskIds: ["a", "d"], projectId: "p2"}],
      ["SET_PROJECT to the same one (keeps its order number)", {action: "SET_PROJECT", taskIds: ["a", "c"], projectId: "p1"}],
      ["SET_PROJECT to none (loses project and order number)", {action: "SET_PROJECT", taskIds: ["a", "c", "d"], projectId: null}],
      ["SET_DUE", {action: "SET_DUE", taskIds: ["b", "c"], dueDate: "2026-12-24"}],
      ["SET_DUE cleared", {action: "SET_DUE", taskIds: ["a", "b"], dueDate: null}],
      ["SNOOZE", {action: "SNOOZE", taskIds: ["a", "d"], snoozedUntil: "2026-11-30"}],
      ["SNOOZE removed", {action: "SNOOZE", taskIds: ["b", "d"], snoozedUntil: null}],
      ["ids that match no task are ignored", {action: "SNOOZE", taskIds: ["d", "zzz"], snoozedUntil: "2026-11-30"}],
    ];
    for (const [name, fields] of cases) {
      it(name, () => {
        const request = {...fields};
        if ("dueDate" in request && request.dueDate === null) request.dueDate = "";
        if ("snoozedUntil" in request && request.snoozedUntil === null) request.snoozedUntil = "";
        const server = applyBatch(list(), request, projectIds);
        assert.equal(server.error, undefined);
        assert.deepEqual(page.batchInList(list(), fields, projectIds), server.tasks);
        assert.deepEqual(page.batchInList(list(), fields, null), server.tasks, "with the projects unknown");
      });
    }
    it("returns null where the server finds no task or an unusable value", () => {
      assert.equal(page.batchInList(list(), {action: "SNOOZE", taskIds: ["zzz"], snoozedUntil: "2026-11-30"}, null), null);
      assert.equal(page.batchInList(list(), {action: "SET_PROJECT", taskIds: ["a"], projectId: "gone"}, projectIds), null, "a project that no longer exists");
      assert.equal(page.batchInList(list(), {action: "SET_DUE", taskIds: ["a"], dueDate: "soon"}, null), null);
      assert.equal(page.batchInList(list(), null, null), null);
      assert.equal(page.batchInList(list(), {action: "NOPE", taskIds: ["a"]}, null), null);
    });
    it("does not modify its input", () => {
      const tasks = list();
      const copy = JSON.parse(JSON.stringify(tasks));
      page.batchInList(tasks, {action: "MOVE_TO_TOP", taskIds: ["d"]}, null);
      page.batchInList(tasks, {action: "SET_PROJECT", taskIds: ["a"], projectId: "p2"}, null);
      page.batchInList(tasks, {action: "SNOOZE", taskIds: ["b"], snoozedUntil: null}, null);
      assert.deepEqual(tasks, copy);
    });
  });

  describe("withPendingActions", () => {
    it("shows a waiting batch on top of the server's list", () => {
      const shown = page.withPendingActions(list(), [], [top(["d"])]);
      assert.deepEqual(shown.tasks.map((t) => t.id), ["d", "a", "b", "c"]);
      assert.deepEqual(shown.tasks.map((t) => t.order), [1, 2, 3, 4]);
    });
    it("replays batches and other changes in the order they were made", () => {
      const edit = page.makeQueuedAction({kind: "EDIT", taskId: "b", title: "Task b", fields: {dueDate: "2026-11-02"}, now: T0});
      const clear = batch({action: "SET_DUE", dueDate: null, taskIds: ["a", "b"]});
      const snooze = batch({action: "SNOOZE", snoozedUntil: "2026-12-01", taskIds: ["b"]});
      const shown = page.withPendingActions(list(), [], [edit, clear, snooze, top(["c"])]).tasks;
      assert.deepEqual(shown.map((t) => t.id), ["c", "a", "b", "d"]);
      assert.equal(shown.find((t) => t.id === "b").dueDate, "", "the clear came after the edit");
      assert.equal(shown.find((t) => t.id === "b").snoozedUntil, "2026-12-01");
      assert.equal(shown.find((t) => t.id === "a").dueDate, "");
    });
    it("ignores a refused batch and one whose tasks are gone", () => {
      const failed = {...top(["d"]), status: "FAILED", error: "x"};
      assert.deepEqual(page.withPendingActions(list(), [], [failed]).tasks, list());
      assert.deepEqual(page.withPendingActions(list(), [], [top(["gone"])]).tasks, list());
    });
    it("leaves a task a waiting completion took off the list alone and moves the rest", () => {
      const complete = page.makeQueuedAction({kind: "COMPLETE", taskId: "d", archiveId: "arch-d-123456", title: "Task d", now: T0});
      const shown = page.withPendingActions(list(), [], [complete, top(["b", "d"])]).tasks;
      assert.deepEqual(shown.map((t) => t.id), ["b", "a", "c"]);
    });
    it("takes a project only if the page knows it", () => {
      const move = batch({action: "SET_PROJECT", projectId: "p9", taskIds: ["a"]});
      assert.equal(page.withPendingActions(list(), [], [move], {projectIds: ["p1"]}).tasks.find((t) => t.id === "a").projectId, "p1");
      assert.equal(page.withPendingActions(list(), [], [move], {projectIds: ["p1", "p9"]}).tasks.find((t) => t.id === "a").projectId, "p9");
    });
  });

  describe("the cards", () => {
    it("word what each change does", () => {
      assert.equal(page.actionLabel(top()), "Move 2 tasks to the top");
      assert.equal(page.actionLabel(top(["b"])), "Move 1 task to the top");
      assert.equal(page.actionLabel(batch({action: "SET_PROJECT", projectId: "p1"}, {title: "Kitchen reno"})), "Add 2 tasks to “Kitchen reno”");
      assert.equal(page.actionLabel(batch({action: "SET_PROJECT", projectId: "p1"})), "Add 2 tasks to a project");
      assert.equal(page.actionLabel(batch({action: "SET_PROJECT", projectId: null})), "Take 2 tasks out of their project");
      assert.equal(page.actionLabel(batch({action: "SET_DUE", dueDate: "2026-11-09"})), "Set the due date of 2 tasks to 2026-11-09");
      assert.equal(page.actionLabel(batch({action: "SET_DUE", dueDate: ""})), "Clear the due date of 2 tasks");
      assert.equal(page.actionLabel(batch({action: "SNOOZE", snoozedUntil: "2026-11-09"})), "Snooze 2 tasks until 2026-11-09");
      assert.equal(page.actionLabel(batch({action: "SNOOZE", snoozedUntil: null})), "Unsnooze 2 tasks");
    });
    it("show waiting, sending and the server's refusal", () => {
      const a = top();
      assert.equal(page.actionCardView(a, false).text, "Waiting to send");
      assert.equal(page.actionCardView(a, true).text, "Sending…");
      const failed = {...a, status: "FAILED", error: "No matching tasks"};
      assert.deepEqual([page.actionCardView(failed, false).failed, page.actionCardView(failed, false).text], [true, "No matching tasks"]);
      assert.match(page.actionDiscardPrompt(a, 0), /Move 2 tasks to the top/);
    });
  });
});

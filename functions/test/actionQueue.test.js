/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {setTimerInList, settleTimer} = require("../timer");
const {completeInList, applyDirectUpdate, removalRecord, undoInList: serverUndoInList} = require("../tasks");
const {reopenTask} = require("../reopen");
const {recordCompletion} = require("../history");
const {normalizeComments} = require("../comments");
const {applyCompletedEdit} = require("../completedEdit");
const {normalizeArchiveId, resolveActionTime} = require("../clientTime");
const {normalizeRequestId} = require("../addRequests");

// The page's pure helpers sit between two marker comments in public/index.html; load them as the page does.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
assert.ok(start > 0 && end > start, "pure-helpers markers not found in public/index.html");
const block = html.slice(start, end);

function load() {
  return new Function(`${block}
    return {setClockOffset, serverNow, parseClockOffset, waitingTaskIds, hasPendingActions, actionQueueRefusal, elapsedSecondsOf, runningSeconds, ACTION_QUEUE_KEY, ACTION_QUEUE_MAX, ACTION_KINDS, EDIT_FIELDS, UNDO_TASK_MAX_CHARS, completionRecord, undoInList, blockedBy, undoPlan, completeBody, undoBody, reopenBody, entryEditBody, splitHeldFields, fieldNamesText, takeBackCompletion, newArchiveId, usableArchiveId, clockOffsetFrom, normalizeSamples, normalizeCount, recordCompletion, setTimerInList, settleTimer, completedRowOf, reopenTask, normalizeComments, applyEditFields, normalizeQueuedAction, makeQueuedAction, cleanActionQueue, parseActionQueue, serializeActionQueue, withPendingActions, cancelActions, actionLabel, actionCardView, actionQueueSummary, actionDiscardPrompt};
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
      const cases = [task("a"), repeating, task("c", {trackedSeconds: 45, comments: "note", projectId: "p1", projectOrder: 2, materials: [{id: "m1", text: "Nails", checked: true, cost: 3.5}]}), task("d", {locked: true, googleCalendarEventId: "ev", scheduledStart: iso(T0 + MIN), scheduledEnd: iso(T0 + 31 * MIN)})];
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
      const finished = completeInList([task("a", {trackedSeconds: 90, completedCount: 2, recentSeconds: [60, 90], projectId: "p1", projectOrder: 1, travelKm: 4, location: {name: "Gate"}, comments: "c", recurrence: {frequency: "DAILY", interval: 1}, dueDate: "2026-10-26"}), task("b")], "a", "2026-10-27", () => "new-id", iso(T0), 7);
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
    it("an EDIT of comments leaves a task and an entry as the server's edits do", () => {
      const page = load();
      for (const comments of ["  hi  ", "", "   ", null, "x".repeat(2500), 5, undefined]) {
        assert.equal(page.normalizeComments(comments), normalizeComments(comments));
        for (const t of [task("a"), task("a", {comments: "old"})]) {
          if (normalizeComments(comments) === undefined) continue;
          assert.deepEqual(page.applyEditFields(t, {comments}), applyDirectUpdate(t, {comments}));
          const edit = applyCompletedEdit(t, {comments}, {timeZone: "Pacific/Auckland"});
          const expected = edit.error ? {...t} : {...t, ...edit.set}; // the server refuses an edit that changes nothing, which leaves the entry as it is
          for (const key of edit.remove || []) delete expected[key];
          assert.deepEqual(page.applyEditFields(t, {comments}), expected);
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
      assert.deepEqual(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Task a", fields: {comments: "  hi "}, now: T0, requestId: "req-00005"}).fields, {comments: "hi"});
      assert.deepEqual(page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task a", fields: {comments: ""}, now: T0, requestId: "req-00006"}).fields, {comments: null});
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
        {fields: {action: "PAUSE", capSeconds: -1}}, {fields: {action: "PAUSE", capSeconds: 1.5}}, {kind: "DELETE"}, {kind: "UNDO"}, {kind: "timer"}, {kind: undefined},
      ];
      for (const over of bad) assert.equal(action(page, over), null, JSON.stringify(over));
      const base = {title: "T", now: T0, requestId: "req-00001"};
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", taskId: "a"}), null, "no archive id");
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", taskId: "a", archiveId: "__name__"}), null);
      assert.equal(page.makeQueuedAction({...base, kind: "COMPLETE", archiveId: "archive-0001"}), null, "no task");
      assert.equal(page.makeQueuedAction({...base, kind: "REOPEN", archiveId: "archive-0001"}), null, "no task");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", fields: {comments: "x"}}), null, "no target");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", archiveId: "archive-0001", fields: {comments: "x"}}), null, "two targets");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {priority: "HIGH"}}), null, "a field that cannot be held");
      assert.equal(page.makeQueuedAction({...base, kind: "EDIT", taskId: "a", fields: {comments: 5}}), null);
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
      const queue = [action(page, {requestId: "req-00001"}), page.makeQueuedAction({kind: "COMPLETE", taskId: "a", archiveId: "archive-0001", title: "Task a", now: T0 + 1, requestId: "req-00002"}), page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task a", fields: {comments: "hi"}, now: T0 + 2, requestId: "req-00003"})];
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
      const list = [good, null, 5, "x", [], {...good, requestId: "req-00002", status: "SENT"}, {...good, requestId: "req-00003", kind: "DELETE"}, {...good, requestId: "req-00004", at: 1.5}, {...good, requestId: "req-00005", fields: {action: "NOPE"}}, {...good, title: "again"}, {...good, requestId: "req-00006", taskId: ""}];
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
      assert.deepEqual(page.ACTION_KINDS, ["TIMER", "COMPLETE", "REOPEN", "EDIT", "UNDO"]);
      assert.deepEqual(page.EDIT_FIELDS, ["comments"]);
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
      const actions = [timer(page, "a", "START", T0), page.makeQueuedAction({kind: "COMPLETE", taskId: "b", archiveId: "archive-0002", title: "B", now: T0 + MIN}), page.makeQueuedAction({kind: "REOPEN", taskId: "old", archiveId: "archive-0001", title: "Old", now: T0 + 2 * MIN}), page.makeQueuedAction({kind: "EDIT", taskId: "c", title: "C", fields: {comments: "hi"}, now: T0 + 3 * MIN})];
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
        page.makeQueuedAction({kind: "EDIT", taskId: "gone", title: "G", fields: {comments: "hi"}, now: T0}),
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0009", title: "G", fields: {comments: "hi"}, now: T0}),
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
    it("edits comments on a task, and on an entry, including one that is itself waiting", () => {
      const page = load();
      const row = {archiveId: "archive-0001", title: "Old", comments: "was", completedAt: iso(T0 - MIN)};
      const edit = (target, comments, atMs) => page.makeQueuedAction({kind: "EDIT", ...target, title: "t", fields: {comments}, now: atMs});
      const shown = page.withPendingActions(timerTasks(), [row], [edit({taskId: "c"}, "  new ", T0), edit({archiveId: "archive-0001"}, "", T0 + 1)]);
      assert.equal(shown.tasks.find((t) => t.id === "c").comments, "new");
      assert.equal("comments" in shown.completed[0], false);
      const waiting = page.withPendingActions(timerTasks(), [], [
        page.makeQueuedAction({kind: "COMPLETE", taskId: "c", archiveId: "archive-0002", title: "C", now: T0}),
        edit({archiveId: "archive-0002"}, "done well", T0 + 1),
      ]);
      assert.equal(waiting.completed[0].comments, "done well");
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
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "a", fields: {comments: "hi"}, now: T0 + 1, requestId: "req-00003"}),
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
        page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "a", fields: {comments: "hi"}, now: T0 + 1, requestId: "req-00003"}),
        complete(page, "a", "archive-0009", T0 + 2, "req-00004"),
        page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0009", title: "a", fields: {comments: "ok"}, now: T0 + 3, requestId: "req-00005"}),
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
      assert.equal(page.actionLabel(page.makeQueuedAction({kind: "EDIT", taskId: "a", title: "Fix gate", fields: {comments: "x"}, now: T0})), "Update comments on “Fix gate”");
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
        for (const extra of [{}, {locked: true}, {comments: "gate"}]) {
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
      assert.equal(make({archiveId: undefined}), null);
      assert.equal(make({archiveId: "short"}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: 5}}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: ""}}), null);
      assert.equal(make({fields: {task: record.task, spawnedId: "spawn-1"}}).fields.spawnedId, "spawn-1");
      assert.equal("spawnedId" in make({fields: {task: record.task, spawnedId: null}}).fields, false);
      assert.equal(make({fields: {task: {...record.task, comments: "x".repeat(page.UNDO_TASK_MAX_CHARS)}}}), null, "an absurd task is refused");
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
    const entryRow = (extra = {}) => ({id: "e", title: "Task e", status: "PENDING", priority: "LOW", estimatedMinutes: 10, tags: [], trackedSeconds: 90, comments: "was", completedAt: iso(T0 - 5 * MIN), archiveId: "archive-0001", completedCount: 1, recentSeconds: [90], ...extra});
    const reopenAction = (page, over = {}) => page.makeQueuedAction({kind: "REOPEN", taskId: "e", archiveId: "archive-0001", title: "Task e", now: T0, requestId: "req-r0001", ...over});
    const editAction = (page, comments, over = {}) => page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0001", title: "Task e", fields: {comments}, now: T0 - MIN, requestId: "req-e0001", ...over});

    it("sends a reopen as the entry's id and its request id, and an entry's edit as updateCompletedTask's body", () => {
      const page = load();
      const body = page.reopenBody(reopenAction(page));
      assert.deepEqual(body, {id: "archive-0001", requestId: "req-r0001"});
      assert.equal(normalizeArchiveId(body.id), body.id);
      assert.equal(normalizeRequestId(body.requestId), body.requestId);
      assert.deepEqual(page.entryEditBody(editAction(page, "new")), {id: "archive-0001", updatedFields: {comments: "new"}});
      assert.deepEqual(page.entryEditBody(editAction(page, null)), {id: "archive-0001", updatedFields: {comments: null}}, "cleared comments are sent as null");
    });
    it("splits a form's changes into the ones that can be held and the names of the rest", () => {
      const page = load();
      assert.deepEqual(page.splitHeldFields({comments: "x", trackedSeconds: 600, completedDate: "2026-10-27", completedTime: "09:00", travelKm: 3}), {held: {comments: "x"}, other: ["trackedSeconds", "completedDate", "completedTime", "travelKm"]});
      assert.deepEqual(page.splitHeldFields({comments: null}), {held: {comments: null}, other: []});
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
    it("shows an edit of an entry's comments and then its reopen as the task back with those comments, in order", () => {
      const page = load();
      const shown = page.withPendingActions(timerTasks(), [entryRow()], [editAction(page, "now"), reopenAction(page)]);
      assert.deepEqual(shown.completed, []);
      const back = shown.tasks[shown.tasks.length - 1];
      assert.equal(back.id, "e");
      assert.equal(back.comments, "now");
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
      const edit = page.makeQueuedAction({kind: "EDIT", archiveId: "archive-0002", title: "Task c", fields: {comments: "x"}, now: T0 + MIN, requestId: "req-e0002"});
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
});

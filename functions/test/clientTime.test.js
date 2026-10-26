/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {MAX_ACTION_AGE_MS, resolveActionTime, normalizeArchiveId} = require("../clientTime");
const {setTimerInList, runningSeconds, elapsedSeconds} = require("../timer");
const {completeInList} = require("../tasks");
const {isRepeatedRequest, recordRequest} = require("../addRequests");

const NOW = Date.parse("2026-10-27T10:00:00.000Z");
const MIN = 60 * 1000;

describe("clientTime.js", () => {
  describe("resolveActionTime", () => {
    it("keeps a time in the past", () => {
      assert.deepEqual(resolveActionTime(NOW - 5 * MIN, NOW), {at: NOW - 5 * MIN});
    });
    it("clamps a time in the future (a device clock ahead of the server's) to now", () => {
      assert.deepEqual(resolveActionTime(NOW + 10 * MIN, NOW), {at: NOW});
      assert.deepEqual(resolveActionTime(NOW, NOW), {at: NOW});
    });
    it("uses now for a missing or unusable time", () => {
      for (const v of [undefined, null, "", "123", NaN, Infinity, 1.5, 0, -5, {}, [], true]) {
        assert.deepEqual(resolveActionTime(v, NOW), {at: NOW}, String(v));
      }
    });
    it("accepts a change up to 14 days old and refuses an older one", () => {
      assert.equal(MAX_ACTION_AGE_MS, 14 * 24 * 60 * MIN);
      assert.deepEqual(resolveActionTime(NOW - MAX_ACTION_AGE_MS, NOW), {at: NOW - MAX_ACTION_AGE_MS});
      const refused = resolveActionTime(NOW - MAX_ACTION_AGE_MS - 1, NOW);
      assert.match(refused.error, /14 days/);
      assert.equal(refused.at, undefined);
    });
  });

  describe("normalizeArchiveId", () => {
    it("accepts 8 to 64 letters, digits, hyphens and underscores", () => {
      assert.equal(normalizeArchiveId("abcd1234"), "abcd1234");
      assert.equal(normalizeArchiveId("3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f"), "3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f");
      assert.equal(normalizeArchiveId("a".repeat(64)), "a".repeat(64));
    });
    it("rejects anything else, including Firestore's reserved __name__ form", () => {
      for (const v of ["abcd123", "a".repeat(65), "has space1", "slash/abc1", "dot.dot.1", "__reserved__", "", undefined, null, 12345678, {}]) {
        assert.equal(normalizeArchiveId(v), null, JSON.stringify(v));
      }
      assert.equal(normalizeArchiveId("_ok_but_not_reserved"), "_ok_but_not_reserved");
    });
  });

  describe("a change booked at the time it was made", () => {
    const started = new Date(NOW - 3 * 60 * MIN).toISOString();
    const running = {id: "a", title: "Fix gate", priority: "HIGH", estimatedMinutes: 30, tags: [], status: "PENDING", order: 1, timerStartedAt: started, active: true, trackedSeconds: 60};

    it("a pause sent late counts the time up to when it was pressed, not up to when it arrived", () => {
      const at = NOW - 2 * 60 * MIN; // pressed an hour after the start, sent two hours later
      const when = resolveActionTime(at, NOW);
      const {tasks} = setTimerInList([running], "a", "PAUSE", when.at);
      assert.equal(tasks[0].trackedSeconds, 60 + 3600);
      assert.equal(tasks[0].timerStartedAt, undefined);
    });
    it("a start sent late starts the clock at the time it was pressed", () => {
      const idle = {...running, timerStartedAt: undefined, active: undefined, trackedSeconds: 0};
      delete idle.timerStartedAt;
      delete idle.active;
      const when = resolveActionTime(NOW - 30 * MIN, NOW);
      const {tasks} = setTimerInList([idle], "a", "START", when.at);
      assert.equal(Date.parse(tasks[0].timerStartedAt), NOW - 30 * MIN);
      assert.equal(elapsedSeconds(tasks[0], NOW), 30 * 60);
    });
    it("a start pauses the other running timer at the same instant", () => {
      const other = {...running, id: "b", order: 2};
      const idle = {...running, id: "c", order: 3, trackedSeconds: 0};
      delete idle.timerStartedAt;
      delete idle.active;
      const at = NOW - 60 * MIN;
      const {tasks} = setTimerInList([other, idle], "c", "START", at);
      assert.equal(tasks.find((t) => t.id === "b").trackedSeconds, 60 + 2 * 3600);
      assert.equal(tasks.find((t) => t.id === "c").timerStartedAt, new Date(at).toISOString());
    });
    it("never counts a negative stretch when the time precedes the recorded start", () => {
      assert.equal(runningSeconds(running, Date.parse(started) - 10 * MIN), 0);
      const {tasks} = setTimerInList([running], "a", "PAUSE", Date.parse(started) - 10 * MIN);
      assert.equal(tasks[0].trackedSeconds, 60);
    });
    it("a completion sent late is booked at the time it was made: its timer stops there and the next occurrence starts from that day", () => {
      const at = NOW - 26 * 60 * MIN; // 2026-10-26 08:00Z
      const longAgo = new Date(NOW - 30 * 60 * MIN).toISOString(); // started before `at`
      const repeating = {...running, timerStartedAt: longAgo, recurrence: {frequency: "DAILY", interval: 1}, dueDate: "2026-10-20"};
      const done = completeInList([repeating], "a", "2026-10-26", () => "new-id", new Date(at).toISOString(), 4);
      assert.equal(done.completedTask.trackedSeconds, 60 + 4 * 3600);
      assert.equal(done.spawned.addedAt, new Date(at).toISOString());
      assert.equal(done.spawned.dueDate, "2026-10-27"); // the first date after the day it was completed
    });
  });

  describe("a repeated request", () => {
    it("is recognised once it has been recorded, so the second attempt changes nothing", () => {
      const id = "complete-0001";
      const data = recordRequest(undefined, id);
      assert.equal(isRepeatedRequest(data, id), true);
      assert.equal(isRepeatedRequest(data, "complete-0002"), false);
      assert.equal(isRepeatedRequest(undefined, id), false);
    });
  });

  describe("the endpoints", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
    const body = (name) => {
      const start = source.indexOf(`exports.${name} = onRequest(`);
      assert.ok(start > 0, name);
      const next = source.indexOf("\nexports.", start + 10);
      return source.slice(start, next > 0 ? next : undefined);
    };
    it("toggleTimer books the client's time, never the server clock", () => {
      const fn = body("toggleTimer");
      assert.match(fn, /resolveActionTime\(\(req\.body \|\| \{\}\)\.at, Date\.now\(\)\)/);
      assert.match(fn, /setTimerInList\(tasks, taskId, verb, when\.at,/);
      assert.match(fn, /serverTime: Date\.now\(\)/);
    });
    it("completeTask books the client's time and archive id and records its request id with the completion", () => {
      const fn = body("completeTask");
      assert.match(fn, /resolveActionTime\(req\.body\.at/);
      assert.match(fn, /localDate\(\(await readSettings\(\)\)\.timeZone, new Date\(when\.at\)\)/);
      assert.match(fn, /Timestamp\.fromMillis\(when\.at\)/);
      assert.match(fn, /doc\(archiveId\)/);
      assert.match(fn, /addRequestId: requestId/);
      assert.match(fn, /withAddRequests: true/);
      assert.match(fn, /err\.code === 6/);
      assert.doesNotMatch(fn, /serverTimestamp/);
    });
    it("completeTask, reopenCompletedTask and undoRemove answer a repeated request as a success", () => {
      for (const name of ["completeTask", "reopenCompletedTask", "undoRemove"]) {
        assert.match(body(name), /duplicate: true/, name);
        assert.match(body(name), /isRepeatedRequest\(\{ids: addRequests\}, requestId\)/, name);
        assert.match(body(name), /addRequestId: requestId/, name);
      }
    });
    it("a removal's undo window still runs from the server's own clock", () => {
      assert.match(body("completeTask"), /removalRecord\("COMPLETE", done\.completedTask, archiveRef\.id, done\.spawned, Date\.now\(\)\)/);
    });
    it("getTasks and each of these endpoints respond with the server's time", () => {
      for (const name of ["getTasks", "toggleTimer", "completeTask", "reopenCompletedTask", "undoRemove"]) {
        assert.match(body(name), /serverTime: Date\.now\(\)/, name);
      }
    });
  });
});

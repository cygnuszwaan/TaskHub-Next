/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {toMs, planBackfill} = require("../backfill");
const {run} = require("../scripts/backfillJobNumbers");

const ts = (iso) => ({toMillis: () => Date.parse(iso)});
const ids = (plan) => plan.assignments.map((a) => `${a.collection}:${a.id}=${a.jobNumber}`);

describe("backfill.js", () => {
  it("reads Timestamps, Dates and ISO text as milliseconds, and nothing else", () => {
    assert.equal(toMs(ts("2026-01-01T00:00:00Z")), Date.parse("2026-01-01T00:00:00Z"));
    assert.equal(toMs(new Date("2026-01-01T00:00:00Z")), Date.parse("2026-01-01T00:00:00Z"));
    assert.equal(toMs("2026-01-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z"));
    for (const v of [undefined, null, "junk", 5, {}, new Date("x")]) assert.equal(toMs(v), null);
  });
  it("numbers oldest first, queued and completed together, carrying on from the counter", () => {
    const plan = planBackfill({
      last: 10,
      tasks: [{id: "q1", addedAt: "2026-03-01T00:00:00Z", order: 1}, {id: "q2", addedAt: "2026-01-01T00:00:00Z", order: 2}],
      completed: [{id: "c1", addedAt: "2026-02-01T00:00:00Z", completedAt: ts("2026-02-05T00:00:00Z")}, {id: "c2", completedAt: ts("2026-01-15T00:00:00Z")}],
    });
    assert.deepEqual(ids(plan), ["tasks:q2=11", "completed_tasks:c2=12", "completed_tasks:c1=13", "tasks:q1=14"]);
    assert.equal(plan.last, 14);
    assert.equal(plan.error, null);
  });
  it("puts rows with no dates first, completed before queued, then by queue rank and id", () => {
    const plan = planBackfill({
      tasks: [{id: "b", order: 2}, {id: "a", order: 1}, {id: "z", addedAt: "2026-01-01T00:00:00Z"}],
      completed: [{id: "old"}],
    });
    assert.deepEqual(ids(plan), ["completed_tasks:old=1", "tasks:a=2", "tasks:b=3", "tasks:z=4"]);
  });
  it("leaves numbered rows alone and gives the same plan on every run", () => {
    const input = {last: 5, tasks: [{id: "a", jobNumber: 5}, {id: "b"}], completed: [{id: "c", jobNumber: 3}, {id: "d"}]};
    const plan = planBackfill(input);
    assert.equal(plan.alreadyNumbered, 2);
    assert.deepEqual(ids(plan), ["tasks:b=6", "completed_tasks:d=7"]);
    assert.deepEqual(planBackfill(input), plan);
  });
  it("treats an unusable job number as none, and plans nothing for nothing to do", () => {
    assert.deepEqual(ids(planBackfill({tasks: [{id: "a", jobNumber: "7"}, {id: "b", jobNumber: 0}]})), ["tasks:a=1", "tasks:b=2"]);
    assert.deepEqual(planBackfill({}), {assignments: [], last: 0, alreadyNumbered: 0, error: null});
  });
  it("refuses when an existing number is above the counter", () => {
    const plan = planBackfill({last: 2, tasks: [{id: "a", jobNumber: 9}, {id: "b"}]});
    assert.match(plan.error, /above the counter/);
    assert.deepEqual(plan.assignments, []);
  });
});

function fakeDb(data, counter) {
  const store = {...data};
  const docs = (name) => Object.entries(store[name]).map(([id, d]) => ({id, data: () => d}));
  const writes = [];
  const counterSnap = () => ({exists: db.counter !== undefined, data: () => ({last: db.counter})});
  const db = {
    store,
    writes,
    counter,
    collection: (name) => ({select: () => ({get: async () => ({docs: docs(name)})}), doc: (id) => ({name, id})}),
    doc: () => ({get: async () => counterSnap()}),
    runTransaction: async (fn) => {
      const tx = {
        get: async () => counterSnap(),
        set: (ref, d) => {
          db.counter = d.last;
        },
      };
      return fn(tx);
    },
    batch: () => {
      const pending = [];
      return {
        update: (ref, d) => pending.push([ref, d]),
        commit: async () => {
          for (const [ref, d] of pending) {
            store[ref.name][ref.id] = {...store[ref.name][ref.id], ...d};
            writes.push(`${ref.name}/${ref.id}`);
          }
        },
      };
    },
  };
  return db;
}

describe("scripts/backfillJobNumbers.js", () => {
  const data = () => ({tasks: {t1: {title: "A", addedAt: "2026-02-01T00:00:00Z"}}, completed_tasks: {c1: {title: "B", completedAt: ts("2026-01-01T00:00:00Z")}, c2: {title: "C", jobNumber: 1, completedAt: ts("2026-01-02T00:00:00Z")}}});
  const quiet = () => {};
  it("writes nothing in a dry run", async () => {
    const db = fakeDb(data(), 1);
    assert.deepEqual(await run({db, apply: false, log: quiet}), {numbered: 0});
    assert.equal(db.writes.length, 0);
    assert.equal(db.counter, 1);
  });
  it("numbers what has none, moves the counter and is a no-op the second time", async () => {
    const db = fakeDb(data(), 1);
    assert.deepEqual(await run({db, apply: true, log: quiet}), {numbered: 2});
    assert.equal(db.store.completed_tasks.c1.jobNumber, 2);
    assert.equal(db.store.tasks.t1.jobNumber, 3);
    assert.equal(db.store.completed_tasks.c2.jobNumber, 1);
    assert.equal(db.counter, 3);
    assert.deepEqual(await run({db, apply: true, log: quiet}), {numbered: 0});
    assert.equal(db.counter, 3);
  });
  it("starts at 1 when there is no counter document", async () => {
    const db = fakeDb({tasks: {t1: {title: "A"}}, completed_tasks: {}}, undefined);
    await run({db, apply: true, log: quiet});
    assert.equal(db.store.tasks.t1.jobNumber, 1);
    assert.equal(db.counter, 1);
  });
  it("throws when a number is above the counter", async () => {
    await assert.rejects(run({db: fakeDb({tasks: {t1: {jobNumber: 9}, t2: {}}, completed_tasks: {}}, 2), apply: true, log: quiet}), /above the counter/);
  });
});

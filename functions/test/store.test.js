/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {checkTaskIds, sortTasks, diffTasks, planMigration, makeTaskStore, makeSettingsStore} = require("../store");

const task = (id, order, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order, ...extra});

// Minimal in-memory stand-in for the parts of Firestore the store uses. Writes apply only when the transaction
// function resolves, as in a real transaction; `log` records them in order.
function fakeDb(initial = {}) {
  const data = {tasks: new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)])), other: new Map()};
  const log = [];
  const collection = (name) => ({
    name,
    doc: (id = `auto-${data[name].size}`) => ({collection: name, id}),
    get: async () => ({docs: [...data[name].entries()].map(([id, v]) => ({id, data: () => structuredClone(v)}))}),
  });
  return {
    data,
    log,
    collection,
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, value) => writes.push({op: "set", ref, value}),
        create: (ref, value) => writes.push({op: "create", ref, value}),
        delete: (ref) => writes.push({op: "delete", ref}),
      };
      const result = await fn(tx);
      for (const w of writes) {
        log.push(`${w.op} ${w.ref.collection}/${w.ref.id}`);
        if (w.op === "delete") data[w.ref.collection].delete(w.ref.id);
        else data[w.ref.collection].set(w.ref.id, structuredClone(w.value));
      }
      return result;
    },
  };
}

describe("store.js", () => {
  describe("checkTaskIds", () => {
    it("accepts unique, usable ids", () => {
      checkTaskIds([task("a", 1), task("b", 2)]);
      checkTaskIds([]);
    });
    it("rejects missing, empty, non-string, slashed and reserved ids", () => {
      for (const id of [undefined, "", 7, "a/b", ".", ".."]) {
        assert.throws(() => checkTaskIds([{id}]), /Invalid task id/);
      }
      assert.throws(() => checkTaskIds([null]), /Invalid task id/);
    });
    it("rejects duplicate ids", () => {
      assert.throws(() => checkTaskIds([task("a", 1), task("a", 2)]), /Duplicate task id: a/);
    });
  });

  describe("sortTasks", () => {
    it("orders by rank, then id, without modifying the input", () => {
      const input = [task("c", 2), task("b", 2), task("a", 3), task("z", 1)];
      assert.deepEqual(sortTasks(input).map((t) => t.id), ["z", "b", "c", "a"]);
      assert.deepEqual(input.map((t) => t.id), ["c", "b", "a", "z"]);
    });
    it("treats a missing rank as 0", () => {
      assert.deepEqual(sortTasks([task("a", 1), {id: "b"}]).map((t) => t.id), ["b", "a"]);
    });
  });

  describe("diffTasks", () => {
    it("is empty when nothing changed, even if the list order differs", () => {
      const before = [task("a", 1), task("b", 2)];
      assert.deepEqual(diffTasks(before, [task("b", 2), task("a", 1)]), {upserts: [], deletes: []});
    });
    it("upserts new and changed tasks and deletes removed ones", () => {
      const before = [task("a", 1), task("b", 2), task("c", 3)];
      const after = [task("a", 1), task("b", 2, {title: "Renamed"}), task("d", 3)];
      const {upserts, deletes} = diffTasks(before, after);
      assert.deepEqual(upserts.map((t) => t.id), ["b", "d"]);
      assert.deepEqual(deletes, ["c"]);
    });
    it("sees nested changes and cleared fields", () => {
      const before = [task("a", 1, {tags: ["x"], dueDate: "2026-10-30"})];
      assert.equal(diffTasks(before, [task("a", 1, {tags: ["x", "y"], dueDate: "2026-10-30"})]).upserts.length, 1);
      assert.equal(diffTasks(before, [task("a", 1, {tags: ["x"], dueDate: ""})]).upserts.length, 1);
    });
    it("rejects a list with duplicate or invalid ids", () => {
      assert.throws(() => diffTasks([], [task("a", 1), task("a", 2)]), /Duplicate/);
      assert.throws(() => diffTasks([], [{title: "no id"}]), /Invalid task id/);
    });
  });

  describe("planMigration", () => {
    it("returns the tasks in rank order for an empty collection", () => {
      const plan = planMigration([task("b", 2), task("a", 1)], []);
      assert.deepEqual(plan.tasks.map((t) => t.id), ["a", "b"]);
      assert.equal(plan.error, undefined);
    });
    it("refuses a collection that already has tasks unless forced", () => {
      assert.match(planMigration([task("a", 1)], ["a"]).error, /already has 1 document/);
      assert.equal(planMigration([task("a", 1)], ["a"], {force: true}).tasks.length, 1);
    });
    it("handles an empty old list and rejects bad ids", () => {
      assert.deepEqual(planMigration([], []).tasks, []);
      assert.throws(() => planMigration([task("a", 1), task("a", 2)], []), /Duplicate/);
    });
  });

  describe("makeTaskStore", () => {
    it("getTasks returns the stored tasks in rank order with their ids", async () => {
      const db = fakeDb({b: task("b", 2), a: task("a", 1)});
      const tasks = await makeTaskStore(db).getTasks();
      assert.deepEqual(tasks.map((t) => t.id), ["a", "b"]);
    });
    it("getTasks returns an empty list for an empty collection", async () => {
      assert.deepEqual(await makeTaskStore(fakeDb()).getTasks(), []);
    });
    it("updateTaskList passes the sorted list to mutate and returns mutate's result", async () => {
      const db = fakeDb({b: task("b", 2), a: task("a", 1)});
      let seen;
      const result = await makeTaskStore(db).updateTaskList((tasks) => {
        seen = tasks.map((t) => t.id);
        return {current: tasks, extra: 42};
      });
      assert.deepEqual(seen, ["a", "b"]);
      assert.equal(result.extra, 42);
      assert.deepEqual(db.log, []);
    });
    it("writes only the tasks that changed, and deletes removed ones", async () => {
      const db = fakeDb({a: task("a", 1), b: task("b", 2), c: task("c", 3)});
      await makeTaskStore(db).updateTaskList((tasks) => ({
        tasks: [tasks[0], {...tasks[1], title: "Renamed"}, task("d", 3)],
      }));
      assert.deepEqual(db.log.sort(), ["delete tasks/c", "set tasks/b", "set tasks/d"]);
      assert.equal(db.data.tasks.get("b").title, "Renamed");
      assert.equal(db.data.tasks.has("c"), false);
    });
    it("creating the first task in an empty collection works", async () => {
      const db = fakeDb();
      await makeTaskStore(db).updateTaskList(() => ({tasks: [task("a", 1)]}));
      assert.deepEqual([...db.data.tasks.keys()], ["a"]);
    });
    it("lets mutate write to other collections through tx", async () => {
      const db = fakeDb({a: task("a", 1)});
      await makeTaskStore(db).updateTaskList((tasks, tx) => {
        tx.create(db.collection("other").doc("x"), {...tasks[0], completedAt: "now"});
        return {tasks: []};
      });
      assert.deepEqual(db.log.sort(), ["create other/x", "delete tasks/a"]);
    });
    it("writes nothing when mutate throws or returns an invalid list", async () => {
      const db = fakeDb({a: task("a", 1)});
      const store = makeTaskStore(db);
      await assert.rejects(store.updateTaskList(() => {
        throw new Error("boom");
      }), /boom/);
      await assert.rejects(store.updateTaskList(() => ({tasks: [task("a", 1), task("a", 2)]})), /Duplicate/);
      assert.deepEqual(db.log, []);
      assert.equal(db.data.tasks.size, 1);
    });
  });
});

// Stand-in for a one-document store: db.doc("settings/app") plus transactions, writing only when the transaction
// function resolves.
function fakeDocDb(initial) {
  const state = {value: initial === undefined ? undefined : structuredClone(initial), writes: 0, path: null};
  const ref = {
    get: async () => ({exists: state.value !== undefined, data: () => structuredClone(state.value)}),
  };
  return {
    state,
    doc: (path) => {
      state.path = path;
      return ref;
    },
    async runTransaction(fn) {
      const pending = [];
      const result = await fn({get: (r) => r.get(), set: (r, v) => pending.push(v)});
      for (const v of pending) {
        state.value = structuredClone(v);
        state.writes++;
      }
      return result;
    },
  };
}

describe("makeSettingsStore", () => {
  it("uses the document settings/app", async () => {
    const db = fakeDocDb();
    makeSettingsStore(db);
    assert.equal(db.state.path, "settings/app");
  });
  it("getSettings returns the defaults when nothing is stored", async () => {
    const s = await makeSettingsStore(fakeDocDb()).getSettings();
    assert.equal(s.timeZone, "Pacific/Auckland");
    assert.deepEqual(s.schedule, {enabled: true, frequency: "DAILY", time: "20:00", intervalMinutes: 60});
  });
  it("getSettings fills missing fields of a partial document", async () => {
    const s = await makeSettingsStore(fakeDocDb({timeZone: "Australia/Sydney"})).getSettings();
    assert.equal(s.timeZone, "Australia/Sydney");
    assert.equal(s.schedule.time, "20:00");
  });
  it("updateSettings saves the merged settings and returns them", async () => {
    const db = fakeDocDb();
    const r = await makeSettingsStore(db).updateSettings({schedule: {frequency: "INTERVAL", intervalMinutes: 30}});
    assert.equal(r.settings.schedule.frequency, "INTERVAL");
    assert.equal(db.state.writes, 1);
    assert.deepEqual(db.state.value, r.settings);
    assert.equal((await makeSettingsStore(db).getSettings()).schedule.intervalMinutes, 30);
  });
  it("updateSettings keeps earlier settings and the run state", async () => {
    const db = fakeDocDb({timeZone: "Australia/Sydney", lastAutoRunAt: "2026-10-22T07:00:00.000Z", lastRunFingerprint: "abc"});
    const r = await makeSettingsStore(db).updateSettings({schedule: {time: "06:00"}});
    assert.equal(r.settings.timeZone, "Australia/Sydney");
    assert.equal(r.settings.schedule.time, "06:00");
    assert.equal(db.state.value.lastAutoRunAt, "2026-10-22T07:00:00.000Z");
    assert.equal(db.state.value.lastRunFingerprint, "abc");
  });
  it("updateSettings writes nothing and returns the error for an invalid update", async () => {
    const db = fakeDocDb({timeZone: "Australia/Sydney"});
    const r = await makeSettingsStore(db).updateSettings({timeZone: "Nowhere/Land"});
    assert.match(r.error, /timeZone/);
    assert.equal(db.state.writes, 0);
    assert.deepEqual(db.state.value, {timeZone: "Australia/Sydney"});
    assert.match((await makeSettingsStore(db).updateSettings(undefined)).error, /object/);
    assert.equal(db.state.writes, 0);
  });

  describe("setRunFingerprint", () => {
    it("records the fingerprint and keeps everything else", async () => {
      const db = fakeDocDb({timeZone: "Australia/Sydney", lastAutoRunAt: "2026-10-22T07:00:00.000Z"});
      await makeSettingsStore(db).setRunFingerprint("abc123");
      assert.equal(db.state.writes, 1);
      assert.equal(db.state.value.lastRunFingerprint, "abc123");
      assert.equal(db.state.value.timeZone, "Australia/Sydney");
      assert.equal(db.state.value.lastAutoRunAt, "2026-10-22T07:00:00.000Z");
      assert.equal((await makeSettingsStore(db).getSettings()).lastRunFingerprint, "abc123");
    });
    it("works when the settings document does not exist yet", async () => {
      const db = fakeDocDb();
      await makeSettingsStore(db).setRunFingerprint("abc123");
      assert.equal((await makeSettingsStore(db).getSettings()).lastRunFingerprint, "abc123");
    });
    it("survives a later settings update", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      await store.setRunFingerprint("abc123");
      await store.updateSettings({schedule: {time: "06:00"}});
      assert.equal(db.state.value.lastRunFingerprint, "abc123");
    });
  });

  describe("claimAutoRun", () => {
    // 2026-10-22 is NZDT (+13:00): the defaults run daily at 20:00 Pacific/Auckland.
    const nz = (hhmm, date = "2026-10-22") => new Date(`${date}T${hhmm}:00+13:00`);

    it("writes nothing and returns due: false when no run is due", async () => {
      const db = fakeDocDb({timeZone: "Pacific/Auckland"});
      const r = await makeSettingsStore(db).claimAutoRun(nz("19:45"));
      assert.equal(r.due, false);
      assert.equal(db.state.writes, 0);
    });
    it("works with no settings document yet: the defaults apply and the claim creates it", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      assert.equal((await store.claimAutoRun(nz("12:00"))).due, false);
      assert.equal(db.state.writes, 0);
      const r = await store.claimAutoRun(nz("20:00"));
      assert.equal(r.due, true);
      assert.equal(db.state.writes, 1);
      assert.equal(db.state.value.lastAutoRunAt, nz("20:00").toISOString());
      assert.equal(db.state.value.schedule.time, "20:00");
    });
    it("records lastAutoRunAt and keeps the rest of the settings", async () => {
      const db = fakeDocDb({timeZone: "Australia/Sydney", schedule: {frequency: "INTERVAL", intervalMinutes: 30}, lastRunFingerprint: "abc"});
      const r = await makeSettingsStore(db).claimAutoRun(new Date("2026-10-22T00:00:00Z")); // 11:00 Sydney
      assert.equal(r.due, true);
      assert.deepEqual(db.state.value, r.settings);
      assert.equal(db.state.value.lastAutoRunAt, "2026-10-22T00:00:00.000Z");
      assert.equal(db.state.value.timeZone, "Australia/Sydney");
      assert.equal(db.state.value.schedule.intervalMinutes, 30);
      assert.equal(db.state.value.lastRunFingerprint, "abc");
    });
    it("hands a slot to only one of two successive ticks", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      assert.equal((await store.claimAutoRun(nz("20:00"))).due, true);
      assert.equal((await store.claimAutoRun(nz("20:00"))).due, false);
      assert.equal((await store.claimAutoRun(nz("20:15"))).due, false);
      assert.equal(db.state.writes, 1);
      assert.equal((await store.claimAutoRun(nz("20:00", "2026-10-23"))).due, true);
      assert.equal(db.state.writes, 2);
    });
    it("does not touch updateSettings' view of the run state", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      await store.claimAutoRun(nz("20:00"));
      const r = await store.updateSettings({schedule: {time: "06:00"}});
      assert.equal(r.settings.lastAutoRunAt, nz("20:00").toISOString());
    });
    it("follows a settings change made between ticks", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      assert.equal((await store.claimAutoRun(nz("10:00"))).due, false);
      await store.updateSettings({schedule: {frequency: "INTERVAL", intervalMinutes: 60}});
      assert.equal((await store.claimAutoRun(nz("10:15"))).due, true);
      assert.equal((await store.claimAutoRun(nz("10:30"))).due, false);
      assert.equal((await store.claimAutoRun(nz("11:15"))).due, true);
      await store.updateSettings({schedule: {enabled: false}});
      assert.equal((await store.claimAutoRun(nz("12:30"))).due, false);
    });
  });
});

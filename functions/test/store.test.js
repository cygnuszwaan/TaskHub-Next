/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {checkTaskIds, sortTasks, diffTasks, makeTaskStore, makeProjectStore, makeClientStore, makeShoppingStore, makeTemplateStore, makeSettingsStore} = require("../store");

const task = (id, order, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order, ...extra});

// Minimal in-memory stand-in for the parts of Firestore the store uses. Writes apply only when the transaction
// function resolves, as in a real transaction; `log` records them in order.
function fakeDb(initial = {}, projects = {}, clients = {}) {
  const data = {tasks: new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)])), other: new Map(), settings: new Map(), projects: new Map(Object.entries(projects).map(([k, v]) => [k, structuredClone(v)])), clients: new Map(Object.entries(clients).map(([k, v]) => [k, structuredClone(v)]))};
  const log = [];
  const collection = (name) => ({
    name,
    doc: (id = `auto-${data[name].size}`) => ({collection: name, id}),
    get: async () => ({docs: [...data[name].entries()].map(([id, v]) => ({id, data: () => structuredClone(v)}))}),
  });
  const doc = (path) => {
    const [name, id] = path.split("/");
    return {collection: name, id, get: async () => ({exists: data[name].has(id), data: () => structuredClone(data[name].get(id))})};
  };
  return {
    data,
    log,
    collection,
    doc,
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

  describe("device tokens", () => {
    const t1 = "token-001:APA91b-abcdefghijklmnop_1";
    const t2 = "token-002:APA91b-abcdefghijklmnop_2";
    it("addDeviceToken stores the token and keeps the rest of the document", async () => {
      const db = fakeDocDb({timeZone: "Australia/Sydney", lastAutoRunAt: "2026-10-22T07:00:00.000Z"});
      const r = await makeSettingsStore(db).addDeviceToken(t1);
      assert.deepEqual(r.tokens, [t1]);
      assert.deepEqual(db.state.value.pushTokens, [t1]);
      assert.equal(db.state.value.timeZone, "Australia/Sydney");
      assert.equal(db.state.value.lastAutoRunAt, "2026-10-22T07:00:00.000Z");
    });
    it("addDeviceToken works on a missing document and adds a second device", async () => {
      const db = fakeDocDb();
      const store = makeSettingsStore(db);
      await store.addDeviceToken(t1);
      const r = await store.addDeviceToken(t2);
      assert.deepEqual(r.tokens, [t1, t2]);
      assert.equal(db.state.writes, 2);
    });
    it("addDeviceToken writes nothing for an unusable token", async () => {
      const db = fakeDocDb({pushTokens: [t1]});
      const r = await makeSettingsStore(db).addDeviceToken("nope");
      assert.match(r.error, /token/);
      assert.equal(db.state.writes, 0);
    });
    it("removeDeviceTokens drops only the named ones and skips the write when nothing changes", async () => {
      const db = fakeDocDb({pushTokens: [t1, t2]});
      const store = makeSettingsStore(db);
      assert.deepEqual((await store.removeDeviceTokens([t1])).tokens, [t2]);
      assert.deepEqual(db.state.value.pushTokens, [t2]);
      assert.equal(db.state.writes, 1);
      assert.deepEqual((await store.removeDeviceTokens([null])).tokens, [t2]);
      assert.equal(db.state.writes, 1);
    });
    it("tokens survive updateSettings, claimAutoRun and setRunFingerprint", async () => {
      const db = fakeDocDb({pushTokens: [t1], schedule: {enabled: true, frequency: "INTERVAL", time: "20:00", intervalMinutes: 15}});
      const store = makeSettingsStore(db);
      await store.updateSettings({gapMinutes: 10});
      assert.deepEqual(db.state.value.pushTokens, [t1]);
      await store.claimAutoRun(new Date("2026-10-25T00:00:00.000Z"));
      assert.deepEqual(db.state.value.pushTokens, [t1]);
      await store.setRunFingerprint("abc");
      assert.deepEqual(db.state.value.pushTokens, [t1]);
    });
  });

  describe("claimReminderWindow", () => {
    const now = new Date("2026-10-27T09:00:00+13:00");
    it("returns the stretch since the last check and records now", async () => {
      const db = fakeDocDb({lastReminderAt: "2026-10-27T08:45:00+13:00"});
      const {window, settings} = await makeSettingsStore(db).claimReminderWindow(now);
      assert.deepEqual(window, {from: Date.parse("2026-10-27T08:45:00+13:00"), to: now.getTime()});
      assert.equal(settings.notify.leadMinutes, 30);
      assert.equal(db.state.value.lastReminderAt, now.toISOString());
      assert.equal(db.state.writes, 1);
    });
    it("works with no document and looks back one tick", async () => {
      const db = fakeDocDb();
      const {window} = await makeSettingsStore(db).claimReminderWindow(now);
      assert.equal(window.to - window.from, 15 * 60 * 1000);
      assert.equal(db.state.value.lastReminderAt, now.toISOString());
    });
    it("a second claim at the same moment covers nothing new, and the rest of the document is kept", async () => {
      const db = fakeDocDb({timeZone: "Australia/Sydney", pushTokens: ["token-001:APA91b-abcdefghijklmnop_1"]});
      const store = makeSettingsStore(db);
      await store.claimReminderWindow(now);
      const again = await store.claimReminderWindow(now);
      assert.equal(again.window.from, now.getTime());
      assert.equal(again.window.to, now.getTime());
      assert.equal(db.state.value.timeZone, "Australia/Sydney");
      assert.deepEqual(db.state.value.pushTokens, ["token-001:APA91b-abcdefghijklmnop_1"]);
    });
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

describe("makeTaskStore: withProjects", () => {
  const projects = {p2: {name: "beta"}, p1: {name: "Alpha"}};

  it("passes the projects, sorted by name with their ids, as the third argument", async () => {
    const db = fakeDb({a: task("a", 1)}, projects);
    let seen;
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.projects;
      return {};
    }, {withProjects: true});
    assert.deepEqual(seen, [{id: "p1", name: "Alpha"}, {id: "p2", name: "beta"}]);
  });
  it("passes no projects unless asked", async () => {
    const db = fakeDb({a: task("a", 1)}, projects);
    let seen = "unset";
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.projects;
      return {};
    });
    assert.equal(seen, undefined);
  });
  it("passes an empty list when there are no projects", async () => {
    const db = fakeDb({a: task("a", 1)});
    let seen;
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.projects;
      return {};
    }, {withProjects: true});
    assert.deepEqual(seen, []);
  });
});

describe("makeTaskStore: withJobCounter", () => {
  it("passes the last number issued (0 at the start) and passes none unless asked", async () => {
    const db = fakeDb({a: task("a", 1)});
    let seen = "unset";
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.jobCounter;
      return {};
    }, {withJobCounter: true});
    assert.equal(seen, 0);
    db.data.settings.set("jobCounter", {last: 41});
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.jobCounter;
      return {};
    }, {withJobCounter: true});
    assert.equal(seen, 41);
    await makeTaskStore(db).updateTaskList((tasks, tx, extra) => {
      seen = extra.jobCounter;
      return {};
    });
    assert.equal(seen, undefined);
  });
  it("stores a larger counter in the same commit as the tasks, and never moves it back or writes it unchanged", async () => {
    const db = fakeDb({a: task("a", 1)});
    const store = makeTaskStore(db);
    await store.updateTaskList((tasks) => ({tasks: [...tasks, task("b", 2, {jobNumber: 1})], jobCounter: 1}), {withJobCounter: true});
    assert.deepEqual(db.data.settings.get("jobCounter"), {last: 1});
    assert.deepEqual([...db.log].sort(), ["set settings/jobCounter", "set tasks/b"]); // one transaction: the order within it does not matter
    db.log.length = 0;
    await store.updateTaskList((tasks) => ({tasks, jobCounter: 1}), {withJobCounter: true});
    await store.updateTaskList((tasks) => ({tasks, jobCounter: 0}), {withJobCounter: true});
    assert.deepEqual(db.log, []);
    assert.deepEqual(db.data.settings.get("jobCounter"), {last: 1});
  });
  it("ignores a counter in the result when the counter was not asked for", async () => {
    const db = fakeDb({a: task("a", 1)});
    await makeTaskStore(db).updateTaskList((tasks) => ({tasks, jobCounter: 9}));
    assert.equal(db.data.settings.has("jobCounter"), false);
  });
});

describe("makeProjectStore", () => {
  const seeded = () => fakeDb({a: task("a", 1, {projectId: "p1", projectOrder: 1}), b: task("b", 2, {projectId: "p2"}), c: task("c", 3)}, {p1: {id: "p1", name: "Alpha"}, p2: {id: "p2", name: "Beta"}});

  it("getProjects returns the projects sorted by name with their ids", async () => {
    const db = fakeDb({}, {z: {name: "Zed"}, a: {name: "alpha"}});
    assert.deepEqual(await makeProjectStore(db).getProjects(), [{id: "a", name: "alpha"}, {id: "z", name: "Zed"}]);
  });
  it("getProjects returns an empty list when there are none", async () => {
    assert.deepEqual(await makeProjectStore(fakeDb()).getProjects(), []);
  });

  it("createProject stores {id, name} under the generated id", async () => {
    const db = fakeDb();
    const r = await makeProjectStore(db).createProject("  Kitchen reno ", () => "new1");
    assert.deepEqual(r.project, {id: "new1", name: "Kitchen reno"});
    assert.deepEqual(db.data.projects.get("new1"), {id: "new1", name: "Kitchen reno"});
    assert.deepEqual(db.log, ["set projects/new1"]);
  });
  it("createProject writes nothing for a taken or unusable name", async () => {
    const db = seeded();
    const store = makeProjectStore(db);
    assert.match((await store.createProject("alpha", () => "x")).error, /already exists/);
    assert.match((await store.createProject("  ", () => "x")).error, /non-empty/);
    assert.deepEqual(db.log, []);
  });

  it("renameProject updates the stored name", async () => {
    const db = seeded();
    const r = await makeProjectStore(db).renameProject("p1", "Gamma");
    assert.deepEqual(r.project, {id: "p1", name: "Gamma"});
    assert.deepEqual(db.data.projects.get("p1"), {id: "p1", name: "Gamma"});
    assert.deepEqual(db.log, ["set projects/p1"]);
  });
  it("renameProject reports an unknown id or a taken name without writing", async () => {
    const db = seeded();
    const store = makeProjectStore(db);
    assert.deepEqual(await store.renameProject("zzz", "Gamma"), {notFound: true});
    assert.match((await store.renameProject("p1", "beta")).error, /already exists/);
    assert.deepEqual(db.log, []);
  });

  it("deleteProject removes the project and takes its members out of it, in one transaction", async () => {
    const db = seeded();
    const r = await makeProjectStore(db).deleteProject("p1");
    assert.deepEqual(r.projects, [{id: "p2", name: "Beta"}]);
    assert.deepEqual(r.tasks.map((t) => [t.id, t.projectId, t.projectOrder]), [["a", undefined, undefined], ["b", "p2", undefined], ["c", undefined, undefined]]);
    assert.deepEqual(db.log.sort(), ["delete projects/p1", "set tasks/a"]);
    assert.equal(db.data.projects.has("p1"), false);
    assert.equal("projectId" in db.data.tasks.get("a"), false);
    assert.equal("projectOrder" in db.data.tasks.get("a"), false);
    assert.equal(db.data.tasks.get("a").title, "Task a");
    assert.equal(db.data.tasks.get("b").projectId, "p2");
  });
  it("deleteProject of an empty project writes only the project delete", async () => {
    const db = fakeDb({a: task("a", 1)}, {p1: {id: "p1", name: "Alpha"}});
    await makeProjectStore(db).deleteProject("p1");
    assert.deepEqual(db.log, ["delete projects/p1"]);
  });
  it("deleteProject reports an unknown id and writes nothing", async () => {
    const db = seeded();
    assert.deepEqual(await makeProjectStore(db).deleteProject("zzz"), {notFound: true});
    assert.deepEqual(db.log, []);
  });
});

describe("clients in the stores", () => {
  const smith = {id: "c1", name: "Smith", address: "1 Beach Rd", phone: "", email: ""};
  const seeded = () => fakeDb({}, {p1: {id: "p1", name: "Alpha", clientId: "c1"}, p2: {id: "p2", name: "Beta", clientId: "c1"}, p3: {id: "p3", name: "Gamma"}}, {c1: smith, c2: {id: "c2", name: "acme", address: "", phone: "", email: ""}});

  it("getClients returns the clients sorted by name with their ids", async () => {
    assert.deepEqual((await makeClientStore(seeded()).getClients()).map((c) => c.id), ["c2", "c1"]);
    assert.deepEqual(await makeClientStore(fakeDb()).getClients(), []);
  });
  it("createClient stores the cleaned client under the generated id", async () => {
    const db = seeded();
    const r = await makeClientStore(db).createClient({name: " Jo  Bloggs ", email: "jo@x.nz"}, () => "c9");
    assert.deepEqual(r.client, {id: "c9", name: "Jo Bloggs", address: "", phone: "", email: "jo@x.nz"});
    assert.deepEqual(db.data.clients.get("c9"), r.client);
    assert.deepEqual(db.log, ["set clients/c9"]);
  });
  it("createClient writes nothing for a taken or unusable client", async () => {
    const db = seeded();
    const store = makeClientStore(db);
    assert.match((await store.createClient({name: "SMITH"}, () => "x")).error, /already exists/);
    assert.match((await store.createClient({name: "x", email: "bad"}, () => "x")).error, /not a valid/);
    assert.deepEqual(db.log, []);
  });
  it("updateClient replaces the stored fields; an unknown id or taken name writes nothing", async () => {
    const db = seeded();
    const store = makeClientStore(db);
    await store.updateClient("c1", {name: "Smith", phone: "021"});
    assert.equal(db.data.clients.get("c1").phone, "021");
    assert.equal(db.data.clients.get("c1").address, "");
    assert.deepEqual(db.log, ["set clients/c1"]);
    db.log.length = 0;
    assert.deepEqual(await store.updateClient("zzz", {name: "x"}), {notFound: true});
    assert.match((await store.updateClient("c1", {name: "ACME"})).error, /already exists/);
    assert.deepEqual(db.log, []);
  });
  it("deleteClient removes the client and takes it off its projects, in one transaction", async () => {
    const db = seeded();
    const r = await makeClientStore(db).deleteClient("c1");
    assert.deepEqual(r.clients.map((c) => c.id), ["c2"]);
    assert.deepEqual(r.projects.map((p) => [p.id, p.clientId]), [["p1", undefined], ["p2", undefined], ["p3", undefined]]);
    assert.deepEqual(db.log.sort(), ["delete clients/c1", "set projects/p1", "set projects/p2"]);
    assert.equal(db.data.clients.has("c1"), false);
    assert.equal("clientId" in db.data.projects.get("p1"), false);
    assert.equal(db.data.projects.get("p1").name, "Alpha");
  });
  it("deleteClient of a client with no projects writes only the client delete; an unknown id writes nothing", async () => {
    const db = seeded();
    await makeClientStore(db).deleteClient("c2");
    assert.deepEqual(db.log, ["delete clients/c2"]);
    db.log.length = 0;
    assert.deepEqual(await makeClientStore(db).deleteClient("zzz"), {notFound: true});
    assert.deepEqual(db.log, []);
  });
  it("renameProject keeps the project's client", async () => {
    const db = seeded();
    const r = await makeProjectStore(db).renameProject("p1", "Delta");
    assert.deepEqual(r.project, {id: "p1", name: "Delta", clientId: "c1"});
    assert.deepEqual(db.data.projects.get("p1"), {id: "p1", name: "Delta", clientId: "c1"});
  });
  it("setProjectClient stores or clears the client, checking it against the stored clients", async () => {
    const db = seeded();
    const store = makeProjectStore(db);
    assert.equal((await store.setProjectClient("p3", "c2")).project.clientId, "c2");
    assert.equal(db.data.projects.get("p3").clientId, "c2");
    assert.equal("clientId" in (await store.setProjectClient("p1", null)).project, false);
    assert.equal("clientId" in db.data.projects.get("p1"), false);
    db.log.length = 0;
    assert.deepEqual(await store.setProjectClient("zzz", "c1"), {notFound: true});
    assert.deepEqual(await store.setProjectClient("p1", "zzz"), {error: "Client not found"});
    assert.deepEqual(db.log, []);
  });
});

describe("store.js makeTemplateStore", () => {
  function seeded() {
    const db = fakeDb({
      t1: task("t1", 2, {projectId: "p1", projectOrder: 2, materials: [{id: "m", text: "Paint", checked: true, cost: 10}]}),
      t2: task("t2", 1, {projectId: "p1", projectOrder: 1, trackedSeconds: 300, jobNumber: 7}),
      t3: task("t3", 3),
    }, {p1: {name: "Kitchen"}, p2: {name: "Empty"}});
    db.data.project_templates = new Map();
    return db;
  }
  let n = 0;
  const makeId = () => `tpl${++n}`;

  it("saves a project's tasks as a template, in order, without history, named after the project when no name is given", async () => {
    const db = seeded();
    const r = await makeTemplateStore(db).saveTemplate("p1", undefined, makeId);
    assert.equal(r.template.name, "Kitchen");
    assert.deepEqual(r.template.steps.map((s) => s.title), ["Task t2", "Task t1"]);
    assert.deepEqual(r.template.steps[1].materials, [{text: "Paint", cost: 10}]);
    assert.equal(r.template.steps[0].trackedSeconds, undefined);
    assert.deepEqual(db.log, [`set project_templates/${r.template.id}`]);
    assert.deepEqual((await makeTemplateStore(db).getTemplates()).map((t) => t.name), ["Kitchen"]);
  });
  it("uses the name given, and refuses a taken one with nothing written", async () => {
    const db = seeded();
    const store = makeTemplateStore(db);
    assert.equal((await store.saveTemplate("p1", " Reno ", makeId)).template.name, "Reno");
    db.log.length = 0;
    assert.match((await store.saveTemplate("p1", "reno", makeId)).error, /already exists/);
    assert.deepEqual(db.log, []);
  });
  it("reports an unknown project and a project with no tasks, writing nothing", async () => {
    const db = seeded();
    const store = makeTemplateStore(db);
    assert.deepEqual(await store.saveTemplate("nope", "X", makeId), {notFound: true});
    assert.match((await store.saveTemplate("p2", "X", makeId)).error, /no tasks/);
    assert.deepEqual(db.log, []);
  });
  it("renames and deletes", async () => {
    const db = seeded();
    const store = makeTemplateStore(db);
    const {template} = await store.saveTemplate("p1", "Reno", makeId);
    const other = (await store.saveTemplate("p1", "Alpha", makeId)).template;
    assert.match((await store.renameTemplate(template.id, "alpha")).error, /already exists/);
    assert.deepEqual(await store.renameTemplate("nope", "Z"), {notFound: true});
    const renamed = await store.renameTemplate(template.id, "Zed");
    assert.deepEqual(renamed.templates.map((t) => t.name), ["Alpha", "Zed"]);
    assert.equal(renamed.template.steps.length, 2);
    assert.deepEqual(await store.deleteTemplate("nope"), {notFound: true});
    const left = await store.deleteTemplate(other.id);
    assert.deepEqual(left.templates.map((t) => t.id), [template.id]);
    assert.deepEqual((await store.getTemplates()).map((t) => t.id), [template.id]);
  });
});

describe("store.js makeShoppingStore", () => {
  const seeded = () => {
    const db = fakeDb();
    db.data.settings.set("shoppingList", {items: [{id: "a", text: "Milk"}, {id: "b", text: "Duct tape"}]});
    return db;
  };

  it("getItems reads the items in order, an empty list when the document is absent", async () => {
    assert.deepEqual((await makeShoppingStore(seeded()).getItems()).map((i) => i.id), ["a", "b"]);
    assert.deepEqual(await makeShoppingStore(fakeDb()).getItems(), []);
  });
  it("addItem creates the document on the first item and appends after that, in one write each", async () => {
    const db = fakeDb();
    const store = makeShoppingStore(db);
    const first = await store.addItem(" Milk ", () => "n1");
    assert.deepEqual(first.item, {id: "n1", text: "Milk"});
    await store.addItem("Eggs", () => "n2");
    assert.deepEqual(db.data.settings.get("shoppingList"), {items: [{id: "n1", text: "Milk"}, {id: "n2", text: "Eggs"}]});
    assert.deepEqual(db.log, ["set settings/shoppingList", "set settings/shoppingList"]);
  });
  it("addItem writes nothing for a duplicate or an unusable text", async () => {
    const db = seeded();
    const store = makeShoppingStore(db);
    const dup = await store.addItem("milk", () => "n");
    assert.equal(dup.added, false);
    assert.deepEqual(dup.items.map((i) => i.id), ["a", "b"]);
    assert.match((await store.addItem("   ", () => "n")).error, /1 to 100/);
    assert.deepEqual(db.log, []);
  });
  it("removeItem takes the item off; an unknown id writes nothing", async () => {
    const db = seeded();
    const store = makeShoppingStore(db);
    const r = await store.removeItem("a");
    assert.deepEqual(r.items, [{id: "b", text: "Duct tape"}]);
    assert.deepEqual(db.data.settings.get("shoppingList"), {items: [{id: "b", text: "Duct tape"}]});
    db.log.length = 0;
    assert.equal((await store.removeItem("zzz")).removed, false);
    assert.deepEqual(db.log, []);
  });
  it("leaves the settings document alone", async () => {
    const db = seeded();
    db.data.settings.set("app", {timeZone: "Pacific/Auckland"});
    await makeShoppingStore(db).addItem("Eggs", () => "n");
    assert.deepEqual(db.data.settings.get("app"), {timeZone: "Pacific/Auckland"});
  });
});

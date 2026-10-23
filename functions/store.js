/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {isDeepStrictEqual} = require("node:util");
const {mergeSettings, applySettingsUpdate, claimRun} = require("./settings");

const COLLECTION = "tasks";
const SETTINGS_DOC = "settings/app";

// Doc ids are task ids: non-empty strings, no "/" and not "." or ".." (Firestore rules), and unique within a list.
function checkTaskIds(tasks) {
  const seen = new Set();
  for (const task of tasks) {
    const id = task && task.id;
    if (typeof id !== "string" || !id || id.includes("/") || id === "." || id === "..") {
      throw new Error(`Invalid task id: ${JSON.stringify(id)}`);
    }
    if (seen.has(id)) throw new Error(`Duplicate task id: ${id}`);
    seen.add(id);
  }
}

// Tasks in rank order (`order`), then by id so the result is stable. Pure: returns a new array.
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => ((a.order || 0) - (b.order || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// What must be written to turn the stored list `before` into `after`: tasks that are new or changed (`upserts`)
// and ids that are gone (`deletes`). Unchanged tasks are left out, and list order alone is not a change.
function diffTasks(before, after) {
  checkTaskIds(before);
  checkTaskIds(after);
  const old = new Map(before.map((t) => [t.id, t]));
  const kept = new Set(after.map((t) => t.id));
  return {
    upserts: after.filter((t) => !old.has(t.id) || !isDeepStrictEqual(old.get(t.id), t)),
    deletes: before.filter((t) => !kept.has(t.id)).map((t) => t.id),
  };
}

// Plan for the one-off copy of the old array document into the tasks collection. Refuses to run over a
// collection that already has tasks (unless `force`), so a re-run cannot overwrite newer edits.
function planMigration(oldTasks, existingIds, {force = false} = {}) {
  checkTaskIds(oldTasks);
  if (existingIds.length > 0 && !force) {
    return {error: `The tasks collection already has ${existingIds.length} document(s); re-run with --force to overwrite matching ids.`};
  }
  return {tasks: sortTasks(oldTasks)};
}

// Same interface as the array-document `updateTaskList`, over a `tasks/{id}` collection. `db` is a Firestore
// instance. `mutate(tasks, tx)` is synchronous and returns {tasks, ...extra} to save the new list, or {...extra}
// without `tasks` to leave it alone. Reads happen first, and only the tasks that changed are written, all in one
// transaction. The transaction may retry, so mutate must not perform side effects other than tx writes.
function makeTaskStore(db) {
  const collection = db.collection(COLLECTION);
  const fromSnapshot = (snap) => sortTasks(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function updateTaskList(mutate) {
    return db.runTransaction(async (tx) => {
      const before = fromSnapshot(await tx.get(collection));
      const result = mutate(before, tx);
      if (result.tasks) {
        const {upserts, deletes} = diffTasks(before, result.tasks);
        for (const task of upserts) tx.set(collection.doc(task.id), task);
        for (const id of deletes) tx.delete(collection.doc(id));
      }
      return result;
    });
  }

  async function getTasks() {
    return fromSnapshot(await collection.get());
  }

  return {updateTaskList, getTasks};
}

// Runtime settings in the single document `settings/app`. `db` is a Firestore instance.
//   getSettings()          -> full settings (defaults fill anything missing; see settings.js)
//   updateSettings(patch)  -> {settings} after a transactional merge of the editable fields in `patch`, or {error}
//                             when a field is invalid (nothing is written then). Run state is preserved.
//   claimAutoRun(now)      -> {due, settings}: in one transaction, checks whether the automatic run is due (see
//                             `isRunDue`) and, if so, records `lastAutoRunAt`. Of several concurrent callers (a
//                             duplicate scheduler delivery, say) at most one gets `due: true` for a given slot.
function makeSettingsStore(db) {
  const ref = db.doc(SETTINGS_DOC);

  async function getSettings() {
    const snap = await ref.get();
    return mergeSettings(snap.exists ? snap.data() : undefined);
  }

  async function updateSettings(patch) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = applySettingsUpdate(mergeSettings(snap.exists ? snap.data() : undefined), patch);
      if (result.settings) tx.set(ref, result.settings);
      return result;
    });
  }

  async function claimAutoRun(now = new Date()) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = claimRun(mergeSettings(snap.exists ? snap.data() : undefined), now);
      if (result.due) tx.set(ref, result.settings);
      return result;
    });
  }

  return {getSettings, updateSettings, claimAutoRun};
}

module.exports = {COLLECTION, SETTINGS_DOC, checkTaskIds, sortTasks, diffTasks, planMigration, makeTaskStore, makeSettingsStore};

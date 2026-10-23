/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {isDeepStrictEqual} = require("node:util");
const {mergeSettings, applySettingsUpdate, claimRun} = require("./settings");
const {sortProjects, addProject, renameProject, removeProjectFromTasks} = require("./projects");

const COLLECTION = "tasks";
const PROJECTS_COLLECTION = "projects";
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

// Transactional store over the `tasks/{id}` collection. `db` is a Firestore instance. `mutate(tasks, tx)` is
// synchronous and returns {tasks, ...extra} to save the new list, or {...extra} without `tasks` to leave it alone.
// Reads happen first, and only the tasks that changed are written, all in one transaction. The transaction may retry, so mutate must not perform side effects other than tx writes.
// With `{withProjects: true}` the transaction also reads the `projects` collection and passes `{projects}` (sorted by name)
// to mutate as a third argument, so a task can be checked against the projects that exist at commit time.
function makeTaskStore(db) {
  const collection = db.collection(COLLECTION);
  const fromSnapshot = (snap) => sortTasks(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function updateTaskList(mutate, {withProjects = false} = {}) {
    return db.runTransaction(async (tx) => {
      const before = fromSnapshot(await tx.get(collection));
      const projects = withProjects ? sortProjects((await tx.get(db.collection(PROJECTS_COLLECTION))).docs.map((d) => ({...d.data(), id: d.id}))) : undefined;
      const result = mutate(before, tx, {projects});
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

// Projects in `projects/{id}` ({id, name}, the doc id being the project's id). `db` is a Firestore instance.
//   getProjects()                -> all projects, sorted by name
//   createProject(name, makeId)  -> {projects, project}, or {error} for an unusable or taken name (nothing is written then)
//   renameProject(id, name)      -> {projects, project}, {notFound: true} or {error}
//   deleteProject(id)            -> {projects, tasks} or {notFound: true}: in one transaction removes the project and
//                                   takes every member task out of it (projectId and projectOrder removed); the tasks
//                                   are otherwise untouched. `tasks` is the full list afterwards.
// Names are unique ignoring case; the check and the write share one transaction.
function makeProjectStore(db) {
  const projectsRef = db.collection(PROJECTS_COLLECTION);
  const tasksRef = db.collection(COLLECTION);
  const projectsFrom = (snap) => sortProjects(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function getProjects() {
    return projectsFrom(await projectsRef.get());
  }

  async function createProject(name, makeId) {
    return db.runTransaction(async (tx) => {
      const result = addProject(projectsFrom(await tx.get(projectsRef)), name, makeId);
      if (result.project) tx.set(projectsRef.doc(result.project.id), result.project);
      return result;
    });
  }

  async function renameProjectById(projectId, name) {
    return db.runTransaction(async (tx) => {
      const result = renameProject(projectsFrom(await tx.get(projectsRef)), projectId, name);
      if (result.project) tx.set(projectsRef.doc(projectId), result.project);
      return result;
    });
  }

  async function deleteProject(projectId) {
    return db.runTransaction(async (tx) => {
      const projects = projectsFrom(await tx.get(projectsRef));
      const tasks = sortTasks((await tx.get(tasksRef)).docs.map((d) => ({...d.data(), id: d.id})));
      if (!projects.some((p) => p.id === projectId)) return {notFound: true};
      const after = removeProjectFromTasks(tasks, projectId);
      for (const task of diffTasks(tasks, after).upserts) tx.set(tasksRef.doc(task.id), task);
      tx.delete(projectsRef.doc(projectId));
      return {projects: projects.filter((p) => p.id !== projectId), tasks: after};
    });
  }

  return {getProjects, createProject, renameProject: renameProjectById, deleteProject};
}

// Runtime settings in the single document `settings/app`. `db` is a Firestore instance.
//   getSettings()          -> full settings (defaults fill anything missing; see settings.js)
//   updateSettings(patch)  -> {settings} after a transactional merge of the editable fields in `patch`, or {error}
//                             when a field is invalid (nothing is written then). Run state is preserved.
//   setRunFingerprint(fp)  -> records `lastRunFingerprint` (a string) after a successful full run; nothing else changes.
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

  async function setRunFingerprint(fingerprint) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      tx.set(ref, {...mergeSettings(snap.exists ? snap.data() : undefined), lastRunFingerprint: fingerprint});
    });
  }

  return {getSettings, updateSettings, claimAutoRun, setRunFingerprint};
}

module.exports = {COLLECTION, PROJECTS_COLLECTION, SETTINGS_DOC, checkTaskIds, sortTasks, diffTasks, makeTaskStore, makeProjectStore, makeSettingsStore};

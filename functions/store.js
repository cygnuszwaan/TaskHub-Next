/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {isDeepStrictEqual} = require("node:util");
const {mergeSettings, applySettingsUpdate, claimRun} = require("./settings");
const {addPushToken, removePushTokens} = require("./push");
const {reminderWindow} = require("./alerts");
const {lastIssued} = require("./jobNumber");
const {requestIdsOf, normalizeRequestId, recordRequest} = require("./addRequests");
const {sortProjects, addProject, renameProject, setProjectLocation, setProjectUrl, removeProjectFromTasks} = require("./projects");
const {buildTemplateSteps, sortTemplates, addTemplate, renameTemplate} = require("./projectTemplates");
const {normalizeShoppingItems, addShoppingItem, removeShoppingItem} = require("./shopping");
const {sortClients, addClient, updateClient, removeClientFromProjects, setProjectClient} = require("./clients");

const COLLECTION = "tasks";
const PROJECTS_COLLECTION = "projects";
const CLIENTS_COLLECTION = "clients";
const TEMPLATES_COLLECTION = "project_templates";
const SETTINGS_DOC = "settings/app";
const JOB_COUNTER_DOC = "settings/jobCounter";
const ADD_REQUESTS_DOC = "settings/addRequests";
const SHOPPING_DOC = "settings/shoppingList";

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
// With `{withJobCounter: true}` it also reads the job number counter (`settings/jobCounter`) and passes `{jobCounter}`, the last number
// issued (0 at the start); when the result carries a larger `jobCounter` it is stored in the same transaction (see jobNumber.js).
// With `{withAddRequests: true}` it also reads the add request ids (`settings/addRequests`) and passes `{addRequests}`, the ids used so far (oldest first);
// when the result carries an `addRequestId` that is usable and not yet there, it is recorded in the same transaction (see addRequests.js).
function makeTaskStore(db) {
  const collection = db.collection(COLLECTION);
  const fromSnapshot = (snap) => sortTasks(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function updateTaskList(mutate, {withProjects = false, withJobCounter = false, withAddRequests = false} = {}) {
    return db.runTransaction(async (tx) => {
      const before = fromSnapshot(await tx.get(collection));
      const projects = withProjects ? sortProjects((await tx.get(db.collection(PROJECTS_COLLECTION))).docs.map((d) => ({...d.data(), id: d.id}))) : undefined;
      const counterRef = withJobCounter ? db.doc(JOB_COUNTER_DOC) : null;
      const counterSnap = counterRef ? await tx.get(counterRef) : null;
      const jobCounter = counterSnap ? lastIssued(counterSnap.exists ? counterSnap.data() : undefined) : undefined;
      const requestsRef = withAddRequests ? db.doc(ADD_REQUESTS_DOC) : null;
      const requestsSnap = requestsRef ? await tx.get(requestsRef) : null;
      const requestsData = requestsSnap && requestsSnap.exists ? requestsSnap.data() : undefined;
      const addRequests = requestsRef ? requestIdsOf(requestsData) : undefined;
      const result = mutate(before, tx, {projects, jobCounter, addRequests});
      // The counter only ever moves forward, in the same commit as the tasks that use the numbers
      if (counterRef && Number.isSafeInteger(result.jobCounter) && result.jobCounter > jobCounter) tx.set(counterRef, {last: result.jobCounter});
      // The id of an add is recorded in the commit that makes the add, so a second attempt finds it
      const requestId = requestsRef ? normalizeRequestId(result.addRequestId) : null;
      if (requestId && !addRequests.includes(requestId)) tx.set(requestsRef, recordRequest(requestsData, requestId));
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

// Projects in `projects/{id}` ({id, name, clientId?, location?, url?}, the doc id being the project's id). `db` is a Firestore instance.
//   getProjects()                -> all projects, sorted by name
//   createProject(name, makeId)  -> {projects, project}, or {error} for an unusable or taken name (nothing is written then)
//   renameProject(id, name)      -> {projects, project}, {notFound: true} or {error}; the project's other fields (its client) stay
//   setProjectClient(id, clientId) -> {projects, project}, {notFound: true} (project) or {error} (client not stored); null or ""
//                                   takes the client off. The client is checked in the same transaction.
//   setProjectLocation(id, location) -> {projects, project}, {notFound: true} or {error}; null removes the project's own location
//   setProjectUrl(id, url)       -> {projects, project}, {notFound: true} or {error}; null or blank text removes the project's own link
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

  async function setClientOf(projectId, clientId) {
    return db.runTransaction(async (tx) => {
      const projects = projectsFrom(await tx.get(projectsRef));
      const clients = sortClients((await tx.get(db.collection(CLIENTS_COLLECTION))).docs.map((d) => ({...d.data(), id: d.id})));
      const result = setProjectClient(projects, clients, projectId, clientId);
      if (result.project) tx.set(projectsRef.doc(projectId), result.project);
      return result;
    });
  }

  async function setLocationOf(projectId, location) {
    return db.runTransaction(async (tx) => {
      const result = setProjectLocation(projectsFrom(await tx.get(projectsRef)), projectId, location);
      if (result.project) tx.set(projectsRef.doc(projectId), result.project);
      return result;
    });
  }

  async function setUrlOf(projectId, url) {
    return db.runTransaction(async (tx) => {
      const result = setProjectUrl(projectsFrom(await tx.get(projectsRef)), projectId, url);
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

  return {getProjects, createProject, renameProject: renameProjectById, setProjectClient: setClientOf, setProjectLocation: setLocationOf, setProjectUrl: setUrlOf, deleteProject};
}

// Clients in `clients/{id}` ({id, name, phone, email, hourlyRate?, useWhatsApp?, location?, url?}, the doc id being the client's id). `db` is a Firestore instance.
//   getClients()                  -> all clients, sorted by name
//   createClient(fields, makeId)  -> {clients, client}, or {error} (nothing is written then)
//   updateClient(id, fields)      -> {clients, client}, {notFound: true} or {error}
//   deleteClient(id)              -> {clients, projects} or {notFound: true}: in one transaction removes the client and takes it
//                                    off every project that had it (the projects stay). `projects` is the full list afterwards.
// Names are unique ignoring case; the check and the write share one transaction.
function makeClientStore(db) {
  const clientsRef = db.collection(CLIENTS_COLLECTION);
  const projectsRef = db.collection(PROJECTS_COLLECTION);
  const clientsFrom = (snap) => sortClients(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function getClients() {
    return clientsFrom(await clientsRef.get());
  }

  async function createClient(fields, makeId) {
    return db.runTransaction(async (tx) => {
      const result = addClient(clientsFrom(await tx.get(clientsRef)), fields, makeId);
      if (result.client) tx.set(clientsRef.doc(result.client.id), result.client);
      return result;
    });
  }

  async function updateClientById(clientId, fields) {
    return db.runTransaction(async (tx) => {
      const result = updateClient(clientsFrom(await tx.get(clientsRef)), clientId, fields);
      if (result.client) tx.set(clientsRef.doc(clientId), result.client);
      return result;
    });
  }

  async function deleteClient(clientId) {
    return db.runTransaction(async (tx) => {
      const clients = clientsFrom(await tx.get(clientsRef));
      const projects = sortProjects((await tx.get(projectsRef)).docs.map((d) => ({...d.data(), id: d.id})));
      if (!clients.some((c) => c.id === clientId)) return {notFound: true};
      const after = removeClientFromProjects(projects, clientId);
      after.forEach((p, i) => {
        if (p !== projects[i]) tx.set(projectsRef.doc(p.id), p);
      });
      tx.delete(clientsRef.doc(clientId));
      return {clients: clients.filter((c) => c.id !== clientId), projects: after};
    });
  }

  return {getClients, createClient, updateClient: updateClientById, deleteClient};
}

// The Miscellaneous shopping list in one document, `settings/shoppingList` ({items: [{id, text}]}; absent until the first item). `db` is a Firestore instance.
//   getItems()               -> the items in the order added
//   addItem(text, makeId)    -> {items, item, added} or {error}: the read and the write share one transaction, and an item already there (ignoring case) is not added twice
//   removeItem(id)           -> {items, removed}: an id that is not there changes nothing
function makeShoppingStore(db) {
  const ref = db.doc(SHOPPING_DOC);
  const itemsFrom = (snap) => normalizeShoppingItems(snap.exists ? snap.data().items : []);

  async function getItems() {
    return itemsFrom(await ref.get());
  }

  async function addItem(text, makeId) {
    return db.runTransaction(async (tx) => {
      const result = addShoppingItem(itemsFrom(await tx.get(ref)), text, makeId);
      if (result.added) tx.set(ref, {items: result.items});
      return result;
    });
  }

  async function removeItem(id) {
    return db.runTransaction(async (tx) => {
      const result = removeShoppingItem(itemsFrom(await tx.get(ref)), id);
      if (result.removed) tx.set(ref, {items: result.items});
      return result;
    });
  }

  return {getItems, addItem, removeItem};
}

// Project templates in `project_templates/{id}` ({id, name, steps}, the doc id being the template's id). `db` is a Firestore instance.
//   getTemplates()                          -> all templates, sorted by name
//   saveTemplate(projectId, name, makeId)   -> {templates, template}, {notFound: true} (project) or {error}: in one transaction
//                                              reads the project's queued tasks and stores their steps (see buildTemplateSteps);
//                                              `name` empty or missing means the project's own name
//   renameTemplate(id, name)                -> {templates, template}, {notFound: true} or {error}
//   deleteTemplate(id)                      -> {templates} or {notFound: true}
// Names are unique ignoring case; the check and the write share one transaction.
function makeTemplateStore(db) {
  const templatesRef = db.collection(TEMPLATES_COLLECTION);
  const projectsRef = db.collection(PROJECTS_COLLECTION);
  const tasksRef = db.collection(COLLECTION);
  const templatesFrom = (snap) => sortTemplates(snap.docs.map((d) => ({...d.data(), id: d.id})));

  async function getTemplates() {
    return templatesFrom(await templatesRef.get());
  }

  async function saveTemplate(projectId, rawName, makeId) {
    return db.runTransaction(async (tx) => {
      const projects = (await tx.get(projectsRef)).docs.map((d) => ({...d.data(), id: d.id}));
      const project = projects.find((p) => p.id === projectId);
      if (!project) return {notFound: true};
      const tasks = sortTasks((await tx.get(tasksRef)).docs.map((d) => ({...d.data(), id: d.id})));
      const templates = templatesFrom(await tx.get(templatesRef));
      const built = buildTemplateSteps(tasks, projectId);
      if (built.error) return {error: built.error};
      const name = typeof rawName === "string" && rawName.trim() ? rawName : project.name;
      const result = addTemplate(templates, name, built.steps, makeId);
      if (result.template) tx.set(templatesRef.doc(result.template.id), result.template);
      return result;
    });
  }

  async function renameTemplateById(templateId, name) {
    return db.runTransaction(async (tx) => {
      const result = renameTemplate(templatesFrom(await tx.get(templatesRef)), templateId, name);
      if (result.template) tx.set(templatesRef.doc(templateId), result.template);
      return result;
    });
  }

  async function deleteTemplate(templateId) {
    return db.runTransaction(async (tx) => {
      const templates = templatesFrom(await tx.get(templatesRef));
      if (!templates.some((t) => t.id === templateId)) return {notFound: true};
      tx.delete(templatesRef.doc(templateId));
      return {templates: templates.filter((t) => t.id !== templateId)};
    });
  }

  return {getTemplates, saveTemplate, renameTemplate: renameTemplateById, deleteTemplate};
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

  // Registers a device's push token on the settings document (see push.js). Returns {tokens} or {error}.
  async function addDeviceToken(token) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = mergeSettings(snap.exists ? snap.data() : undefined);
      const result = addPushToken(current.pushTokens, token);
      if (result.error) return result;
      tx.set(ref, {...current, pushTokens: result.tokens});
      return result;
    });
  }

  // Drops device tokens (a device that turned notifications off, or one the push service says is gone). Returns {tokens}.
  async function removeDeviceTokens(tokens) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = mergeSettings(snap.exists ? snap.data() : undefined);
      const left = removePushTokens(current.pushTokens, tokens);
      if (left.length !== current.pushTokens.length) tx.set(ref, {...current, pushTokens: left});
      return {tokens: left};
    });
  }

  // One reminder check: reads the settings, works out the stretch since the last check (`reminderWindow`), records `now` as
  // the last check and returns {settings, window}. The transaction keeps a duplicate tick from covering the same stretch.
  async function claimReminderWindow(now = new Date()) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const settings = mergeSettings(snap.exists ? snap.data() : undefined);
      const window = reminderWindow({lastAt: settings.lastReminderAt, now});
      tx.set(ref, {...settings, lastReminderAt: now.toISOString()});
      return {settings, window};
    });
  }

  return {getSettings, updateSettings, claimAutoRun, setRunFingerprint, addDeviceToken, removeDeviceTokens, claimReminderWindow};
}

module.exports = {COLLECTION, PROJECTS_COLLECTION, CLIENTS_COLLECTION, TEMPLATES_COLLECTION, SETTINGS_DOC, JOB_COUNTER_DOC, ADD_REQUESTS_DOC, SHOPPING_DOC, checkTaskIds, sortTasks, diffTasks, makeTaskStore, makeProjectStore, makeClientStore, makeShoppingStore, makeTemplateStore, makeSettingsStore};

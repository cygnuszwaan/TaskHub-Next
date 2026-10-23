/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

const MAX_NAME_LENGTH = 100;
const MAX_PROJECT_ORDER = 999;

// A project name from the client: trimmed, inner whitespace collapsed to single spaces (names are later put in
// prompts as one line). Pure: no I/O. Returns {name} or {error}.
function normalizeProjectName(value) {
  if (typeof value !== "string") return {error: "name must be a non-empty string"};
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) return {error: "name must be a non-empty string"};
  if (name.length > MAX_NAME_LENGTH) return {error: `name must be at most ${MAX_NAME_LENGTH} characters`};
  return {name};
}

// A project order number from the client. Pure: no I/O.
//   undefined: the value is unusable, meaning "no change"
//   null:      the task has no order number
//   number:    a whole number 1..999 (rounded and clamped)
function normalizeProjectOrder(value) {
  if (value === null) return null;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), 1), MAX_PROJECT_ORDER);
}

// `task` with the project fields of `fields` applied. Pure: the input is not modified.
//   fields.projectId:    null or "" removes the membership (and the order number); an id in `projectIds` joins that
//                        project (moving to another project clears the order number unless `projectOrder` is also given);
//                        anything else is ignored.
//   fields.projectOrder: null removes the order number; a usable number sets it, but only for a task that belongs to a
//                        project; anything else is ignored.
// Keys absent from `fields` change nothing. `projectIds` lists the ids of the projects that exist.
function applyProjectFields(task, fields, projectIds) {
  const next = {...task};
  if (!fields || typeof fields !== "object") return next;
  const known = new Set(projectIds);
  if ("projectId" in fields) {
    const id = fields.projectId;
    if (id === null || id === "") {
      delete next.projectId;
      delete next.projectOrder;
    } else if (typeof id === "string" && known.has(id)) {
      if (next.projectId !== id) delete next.projectOrder;
      next.projectId = id;
    }
  }
  if ("projectOrder" in fields) {
    const order = normalizeProjectOrder(fields.projectOrder);
    if (order === null) delete next.projectOrder;
    else if (order !== undefined && next.projectId) next.projectOrder = order;
  }
  return next;
}

// Only the project fields a task has: {projectId, projectOrder}, either key absent when unset.
function projectFieldsOf(task) {
  const out = {};
  if (task && task.projectId) {
    out.projectId = task.projectId;
    if (Number.isInteger(task.projectOrder)) out.projectOrder = task.projectOrder;
  }
  return out;
}

// The task list with every member of `projectId` taken out of that project. Pure: returns new task objects only
// for the members that changed; the others are the same objects.
function removeProjectFromTasks(tasks, projectId) {
  return tasks.map((t) => {
    if (t.projectId !== projectId) return t;
    const next = {...t};
    delete next.projectId;
    delete next.projectOrder;
    return next;
  });
}

// Projects sorted by name (case-insensitive), then id. Pure: returns a new array.
function sortProjects(projects) {
  const key = (p) => String(p.name || "").toLowerCase();
  return [...projects].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function hasName(projects, name, exceptId) {
  const key = name.toLowerCase();
  return projects.some((p) => p.id !== exceptId && String(p.name || "").toLowerCase() === key);
}

// Add a project. Pure: no I/O. Names are unique, ignoring case.
// Returns {projects, project}, or {error} for an unusable or taken name.
function addProject(projects, rawName, makeId) {
  const {name, error} = normalizeProjectName(rawName);
  if (error) return {error};
  if (hasName(projects, name)) return {error: `A project named "${name}" already exists`};
  const project = {id: makeId(), name};
  return {projects: sortProjects([...projects, project]), project};
}

// Rename a project. Pure: no I/O. Returns {projects, project}, {notFound: true} for an unknown id, or {error}.
function renameProject(projects, projectId, rawName) {
  if (!projects.some((p) => p.id === projectId)) return {notFound: true};
  const {name, error} = normalizeProjectName(rawName);
  if (error) return {error};
  if (hasName(projects, name, projectId)) return {error: `A project named "${name}" already exists`};
  const project = {id: projectId, name};
  return {projects: sortProjects(projects.map((p) => (p.id === projectId ? project : p))), project};
}

module.exports = {
  MAX_NAME_LENGTH,
  MAX_PROJECT_ORDER,
  normalizeProjectName,
  normalizeProjectOrder,
  applyProjectFields,
  projectFieldsOf,
  removeProjectFromTasks,
  sortProjects,
  addProject,
  renameProject,
};

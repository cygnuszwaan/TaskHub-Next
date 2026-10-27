/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Project templates: a project's steps saved without dates, timers or history, and a new project started from them.
// Pure: no I/O.

const {normalizeProjectName, sortProjects, addProject} = require("./projects");
const {mergeTaskChanges} = require("./tasks");

// The most steps a template may hold.
const MAX_TEMPLATE_STEPS = 100;

// One queued task as a template step: title, priority, estimate, tags, materials as {text, cost?} (never checked, no ids),
// description, travel (km) and its order number, each of the last four only when the task has one.
function stepFromTask(task) {
  const step = {
    title: task.title,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    tags: Array.isArray(task.tags) ? [...task.tags] : [],
  };
  if (Array.isArray(task.materials) && task.materials.length > 0) {
    step.materials = task.materials.map((m) => (typeof m.cost === "number" ? {text: m.text, cost: m.cost} : {text: m.text}));
  }
  if (typeof task.description === "string" && task.description) step.description = task.description;
  if (typeof task.travelKm === "number" && task.travelKm > 0) step.travelKm = task.travelKm;
  if (Number.isInteger(task.projectOrder)) step.projectOrder = task.projectOrder;
  return step;
}

// The steps of a project's queued tasks, in the order the project runs them: by order number (ties and tasks without one
// in queue order, the unordered last). Returns {steps} or {error} for a project with no tasks or more than MAX_TEMPLATE_STEPS.
function buildTemplateSteps(tasks, projectId) {
  const members = (Array.isArray(tasks) ? tasks : []).map((t, i) => ({t, i})).filter(({t}) => t.projectId === projectId);
  if (members.length === 0) return {error: "The project has no tasks to save as a template"};
  if (members.length > MAX_TEMPLATE_STEPS) return {error: `A template holds at most ${MAX_TEMPLATE_STEPS} steps; the project has ${members.length} tasks`};
  const rank = ({t}) => (Number.isInteger(t.projectOrder) ? t.projectOrder : Infinity);
  members.sort((a, b) => (rank(a) === rank(b) ? (a.t.order || 0) - (b.t.order || 0) || a.i - b.i : rank(a) < rank(b) ? -1 : 1));
  return {steps: members.map(({t}) => stepFromTask(t))};
}

function sortTemplates(templates) {
  return sortProjects(templates);
}

function nameTaken(templates, name, exceptId) {
  const key = name.toLowerCase();
  return templates.some((t) => t.id !== exceptId && String(t.name || "").toLowerCase() === key);
}

// Add a template; names are unique ignoring case. Returns {templates, template} or {error}.
function addTemplate(templates, rawName, steps, makeId) {
  const {name, error} = normalizeProjectName(rawName);
  if (error) return {error: error.replace("name", "template name")};
  if (nameTaken(templates, name)) return {error: `A template named "${name}" already exists`};
  const template = {id: makeId(), name, steps};
  return {templates: sortTemplates([...templates, template]), template};
}

// Rename a template. Returns {templates, template}, {notFound: true} or {error}.
function renameTemplate(templates, templateId, rawName) {
  if (!templates.some((t) => t.id === templateId)) return {notFound: true};
  const {name, error} = normalizeProjectName(rawName);
  if (error) return {error: error.replace("name", "template name")};
  if (nameTaken(templates, name, templateId)) return {error: `A template named "${name}" already exists`};
  const template = {...templates.find((t) => t.id === templateId), name};
  return {templates: sortTemplates(templates.map((t) => (t.id === templateId ? template : t))), template};
}

// A template's steps as new-task changes for mergeTaskChanges, each in the project `projectId` with its order number and
// materials unchecked. No id and no rank, so every task goes at the end of the list in step order.
function templateChanges(template, projectId) {
  return template.steps.map((step) => ({
    title: step.title,
    priority: step.priority,
    estimatedMinutes: step.estimatedMinutes,
    tags: step.tags,
    ...(step.materials ? {materials: step.materials.map((m) => ({text: m.text, checked: false, ...(typeof m.cost === "number" ? {cost: m.cost} : {})}))} : {}),
    ...(step.description ? {description: step.description} : {}),
    ...(step.travelKm ? {travelKm: step.travelKm} : {}),
    projectId,
    ...(Number.isInteger(step.projectOrder) ? {projectOrder: step.projectOrder} : {}),
  }));
}

// Start a project from a template: the project and a new task per step added to the stored list. Pure: no I/O.
//   tasks, projects: the stored list and projects as read in the committing transaction
//   template:        a stored template {id, name, steps}
//   rawName:         the new project's name (the usual rules: unique ignoring case, 1..100 characters)
//   makeId, now, jobCounter: as acceptProposalInList takes them; each new task takes the next job number
// Returns {tasks, project, projects, added, jobCounter?} or {error}.
function startFromTemplate(tasks, projects, template, rawName, makeId, now, jobCounter) {
  if (!template || !Array.isArray(template.steps) || template.steps.length === 0) return {error: "The template has no steps"};
  const created = addProject(projects, rawName, makeId);
  if (created.error) return {error: created.error};
  const merged = mergeTaskChanges(tasks, templateChanges(template, created.project.id), makeId, [created.project.id], {description: true, materials: true, travelKm: true, now, jobCounter});
  return {tasks: merged.tasks, project: created.project, projects: created.projects, added: merged.added, ...(merged.jobCounter !== undefined ? {jobCounter: merged.jobCounter} : {})};
}

module.exports = {MAX_TEMPLATE_STEPS, stepFromTask, buildTemplateSteps, sortTemplates, addTemplate, renameTemplate, templateChanges, startFromTemplate};

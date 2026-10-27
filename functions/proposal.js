/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {normalizeProjectName, addProject} = require("./projects");
const {cleanTags, mergeTaskChanges} = require("./tasks");
const {normalizeDescription} = require("./description");

// A suggested project has at least this many steps and at most this many.
const MIN_STEPS = 3;
const MAX_STEPS = 12;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const DEFAULT_ESTIMATE = 15;
// The most changes a declined suggestion may hand back to be merged (the model's own list is far shorter).
const MAX_APPLY_CHANGES = 100;

const squash = (text) => String(text).replace(/\s+/g, " ").trim().toLowerCase();

// Whether the text mentions one of the projects by name: the whole name, ignoring case and spacing, not as part of a
// longer word ("Deck" is named in "build the deck" but not in "decking"). Pure.
function namesProject(text, projects) {
  const input = squash(text);
  if (!input) return false;
  return (Array.isArray(projects) ? projects : []).some((p) => {
    const name = p && typeof p.name === "string" ? squash(p.name) : "";
    if (!name) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Built from a string because the name is part of the pattern
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(input);
  });
}

// One step as a task would have it: a title, a priority (MEDIUM when unusable), an estimate in whole minutes (15 when
// unusable), cleaned tags and, when the model gave usable text, `description` (trimmed, at most 2000 characters, as a task's
// description is), the same rules as a manual entry. The key is absent when there is no description. null for a step without a title.
function normalizeStep(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  const step = {
    title: raw.title.replace(/\s+/g, " ").trim(),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : "MEDIUM",
    estimatedMinutes: Number.isFinite(raw.estimatedMinutes) && raw.estimatedMinutes > 0 ? Math.round(raw.estimatedMinutes) : DEFAULT_ESTIMATE,
    tags: cleanTags(raw.tags),
  };
  const description = normalizeDescription(raw.description);
  if (typeof description === "string") step.description = description;
  return step;
}

// The project the model suggests for an input, checked, with the reason when it is not used. Pure: no I/O, nothing is modified.
//   raw:  the model's `projectProposal`: {name, steps: [{title, priority, estimatedMinutes, tags}]}, or anything else
//   opts: {input, projects}: the text the owner typed and the stored projects [{id, name}]
// Returns {proposal: {name, steps}} (steps in the order given, each {title, priority, estimatedMinutes, tags}) or {reason}, the
// reason being a short sentence for the log. The proposal is dropped as a whole when the model gave none, when the name is
// unusable, when fewer than MIN_STEPS steps are usable, when there are more than MAX_STEPS steps, when the name matches an
// existing project (ignoring case and spacing), and when the input already names a project: the owner then has a project
// in mind.
function checkProposal(raw, {input = "", projects = []} = {}) {
  if (raw === undefined || raw === null) return {reason: "the model returned no projectProposal"};
  if (typeof raw !== "object" || Array.isArray(raw)) return {reason: "projectProposal is not an object"};
  const named = normalizeProjectName(raw.name);
  if (named.error) return {reason: "the project name is unusable"};
  if (!Array.isArray(raw.steps)) return {reason: "projectProposal has no steps list"};
  if (raw.steps.length > MAX_STEPS) return {reason: `${raw.steps.length} steps is more than ${MAX_STEPS}`};
  const steps = raw.steps.map(normalizeStep).filter(Boolean);
  if (steps.length < MIN_STEPS) return {reason: `only ${steps.length} usable steps, ${MIN_STEPS} needed`};
  const known = Array.isArray(projects) ? projects : [];
  if (known.some((p) => p && typeof p.name === "string" && squash(p.name) === squash(named.name))) return {reason: `a project named "${named.name}" already exists`};
  if (namesProject(input, known)) return {reason: "the input names an existing project"};
  return {proposal: {name: named.name, steps}};
}

// The checked suggestion, or null (see checkProposal for the reasons).
function normalizeProposal(raw, opts) {
  return checkProposal(raw, opts).proposal || null;
}

// The new-task changes for a project's steps, in the shape mergeTaskChanges takes. Pure: no I/O.
// Step n (1-based) goes into the project with order number n, so each step is its own tier and the scheduling engine
// places them one after another. No id and no rank, so every step is a new task added at the end of the list in order.
// A step's `description` is passed on when it has one (mergeTaskChanges applies it only when told to).
function proposalChanges(proposal, projectId) {
  return proposal.steps.map((step, i) => ({
    title: step.title,
    priority: step.priority,
    estimatedMinutes: step.estimatedMinutes,
    tags: step.tags,
    ...(step.description ? {description: step.description} : {}),
    projectId,
    projectOrder: i + 1,
  }));
}

// Accept a suggested project: the project and its steps added to the stored list. Pure: no I/O.
//   tasks, projects: the stored list and the stored projects [{id, name}], as read in the committing transaction
//   raw:             the suggestion the owner accepted, {name, steps}; it is checked again (normalizeProposal, with no input
//                    text) against the projects stored now, so a name taken since it was offered is refused
//   makeId, now:     () => new id, and the ISO text for the new tasks' `addedAt`
// Returns {tasks, project, projects, added} (`projects` sorted by name, the new one included), or {error} with the reason
// nothing was added.
function acceptProposalInList(tasks, projects, raw, makeId, now, jobCounter) {
  const stored = Array.isArray(projects) ? projects : [];
  const proposal = normalizeProposal(raw, {projects: stored});
  if (!proposal) return {error: `The project suggestion cannot be used: it needs a name no project has, and ${MIN_STEPS} to ${MAX_STEPS} steps with titles`};
  const created = addProject(stored, proposal.name, makeId);
  if (created.error) return {error: created.error};
  const merged = mergeTaskChanges(tasks, proposalChanges(proposal, created.project.id), makeId, [created.project.id], {description: true, now, jobCounter});
  return {tasks: merged.tasks, project: created.project, projects: created.projects, added: merged.added, ...(merged.jobCounter !== undefined ? {jobCounter: merged.jobCounter} : {})};
}

// The changes of a declined suggestion (`{apply: {changes}}`), which go through mergeTaskChanges like the model's own
// output. Pure: no I/O. Returns the list of change objects, or null when `raw` is not an object with a `changes` array of
// at most MAX_APPLY_CHANGES objects.
function applyChanges(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.changes) || raw.changes.length > MAX_APPLY_CHANGES) return null;
  if (!raw.changes.every((c) => c && typeof c === "object" && !Array.isArray(c))) return null;
  return raw.changes;
}

module.exports = {MIN_STEPS, MAX_STEPS, MAX_APPLY_CHANGES, namesProject, normalizeStep, checkProposal, normalizeProposal, proposalChanges, acceptProposalInList, applyChanges};

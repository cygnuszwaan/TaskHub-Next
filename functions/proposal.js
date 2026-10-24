/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {normalizeProjectName} = require("./projects");
const {cleanTags} = require("./tasks");

// A suggested project has at least this many steps and at most this many.
const MIN_STEPS = 3;
const MAX_STEPS = 12;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];
const DEFAULT_ESTIMATE = 15;

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
// unusable) and cleaned tags, the same rules as a manual entry. null for a step without a title.
function normalizeStep(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  return {
    title: raw.title.replace(/\s+/g, " ").trim(),
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : "MEDIUM",
    estimatedMinutes: Number.isFinite(raw.estimatedMinutes) && raw.estimatedMinutes > 0 ? Math.round(raw.estimatedMinutes) : DEFAULT_ESTIMATE,
    tags: cleanTags(raw.tags),
  };
}

// The project the model suggests for an input, checked. Pure: no I/O, nothing is modified.
//   raw:  the model's `projectProposal`: {name, steps: [{title, priority, estimatedMinutes, tags}]}, or anything else
//   opts: {input, projects, changes}: the text the owner typed, the stored projects [{id, name}] and the model's task
//         changes (to see whether it placed a task in a project)
// Returns {name, steps} (steps in the order given, each {title, priority, estimatedMinutes, tags}) or null. The proposal is
// dropped as a whole when the name is unusable, when fewer than MIN_STEPS steps are usable, when there are more than
// MAX_STEPS steps, when the name matches an existing project (ignoring case and spacing), and when the input already
// names a project or the model put a task of this input into one: the owner then has a project in mind.
function normalizeProposal(raw, {input = "", projects = [], changes = []} = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const named = normalizeProjectName(raw.name);
  if (named.error) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length > MAX_STEPS) return null;
  const steps = raw.steps.map(normalizeStep).filter(Boolean);
  if (steps.length < MIN_STEPS) return null;
  const known = Array.isArray(projects) ? projects : [];
  if (known.some((p) => p && typeof p.name === "string" && squash(p.name) === squash(named.name))) return null;
  if (namesProject(input, known)) return null;
  const ids = new Set(known.map((p) => p && p.id));
  if ((Array.isArray(changes) ? changes : []).some((c) => c && typeof c.projectId === "string" && ids.has(c.projectId))) return null;
  return {name: named.name, steps};
}

module.exports = {MIN_STEPS, MAX_STEPS, namesProject, normalizeStep, normalizeProposal};

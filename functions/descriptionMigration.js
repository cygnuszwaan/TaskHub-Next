/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Retiring the old text `comments` field: it is now `description`. Pure: scripts/migrateCommentsToDescription.js does the I/O.

const {normalizeDescription} = require("./description");

// What the migration does to one stored object (a task, an archive row or a template step) with a text `comments`:
//   the text becomes its `description` when it has none, and the `comments` key goes; when it already has a different description
//   the description is kept and the old text is reported as `dropped`.
// An object whose `comments` is not text (a list of timestamped comments, once those exist) is never touched.
// Returns null when there is nothing to do, else {set: {description}|null, remove: ["comments"], dropped: text|null}.
function planObject(doc) {
  if (!doc || typeof doc !== "object" || typeof doc.comments !== "string") return null;
  const old = normalizeDescription(doc.comments);
  const has = typeof doc.description === "string" && doc.description.trim() !== "";
  if (old === null) return {set: null, remove: ["comments"], dropped: null};
  if (!has) return {set: {description: old}, remove: ["comments"], dropped: null};
  return {set: null, remove: ["comments"], dropped: doc.description.trim() === old ? null : old};
}

// Plans the move of every stored `comments` text to `description`.
//   tasks, completed, templates: arrays of documents ({id, title | name, comments?, description?, steps?}) from `tasks`, `completed_tasks`
//   and `project_templates` (a template holds its text on its `steps`)
// Returns {changes: [{collection, id, label, set, remove}], dropped: [{collection, id, label, comments}]}; `set` is the fields to
// write (null for none) and `remove` the keys to delete. Documents with nothing to move are left out, so a second run plans nothing.
function planDescriptionMigration({tasks = [], completed = [], templates = []} = {}) {
  const changes = [];
  const dropped = [];
  const note = (collection, doc, label, plan) => {
    if (plan.dropped !== null) dropped.push({collection, id: doc.id, label, comments: plan.dropped});
  };
  for (const [collection, docs] of [["tasks", tasks], ["completed_tasks", completed]]) {
    for (const doc of Array.isArray(docs) ? docs : []) {
      const plan = planObject(doc);
      if (!plan) continue;
      const label = typeof doc.title === "string" ? doc.title : "";
      changes.push({collection, id: doc.id, label, set: plan.set, remove: plan.remove});
      note(collection, doc, label, plan);
    }
  }
  for (const template of Array.isArray(templates) ? templates : []) {
    if (!template || !Array.isArray(template.steps)) continue;
    const label = typeof template.name === "string" ? template.name : "";
    let touched = false;
    const steps = template.steps.map((step) => {
      const plan = planObject(step);
      if (!plan) return step;
      touched = true;
      note("project_templates", template, `${label}: ${typeof step.title === "string" ? step.title : ""}`, plan);
      const {comments, ...rest} = step; // eslint-disable-line no-unused-vars
      return plan.set ? {...rest, ...plan.set} : rest;
    });
    if (touched) changes.push({collection: "project_templates", id: template.id, label, set: {steps}, remove: []});
  }
  return {changes, dropped};
}

module.exports = {planObject, planDescriptionMigration};

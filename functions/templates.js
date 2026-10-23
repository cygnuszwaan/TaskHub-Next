/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {normalizeRecurrence} = require("./tasks");

// Most distinct titles `getCompletedTemplates` returns.
const MAX_TEMPLATES = 500;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

// Key under which two archive rows count as the same task: the title, trimmed and lower-cased.
function titleKey(title) {
  return typeof title === "string" ? title.trim().toLowerCase() : "";
}

// Completed tasks as templates for a new task, one per distinct title (ignoring case), each taken from the newest
// row with that title. Pure: the input is not modified.
//   rows: archive rows as `serializeCompleted` returns them, newest first
// A template is {title, priority, estimatedMinutes, tags, completedAt} plus, when the row had them, `recurrence`,
// `projectId`, `projectOrder`, `materials` (the item texts only; a new task starts with every item unchecked) and
// `comments`. It carries no due date, schedule, timer or id: those belong to one instance. A row without a usable
// title is skipped; an unusable priority becomes MEDIUM and an unusable estimate 15.
function buildTemplates(rows, limit = MAX_TEMPLATES) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const key = titleKey(row.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const template = {
      title: row.title.trim(),
      priority: PRIORITIES.includes(row.priority) ? row.priority : "MEDIUM",
      estimatedMinutes: Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 15,
      tags: Array.isArray(row.tags) ? row.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : [],
      completedAt: typeof row.completedAt === "string" ? row.completedAt : "",
    };
    const recurrence = normalizeRecurrence(row.recurrence);
    if (recurrence) template.recurrence = recurrence;
    if (typeof row.projectId === "string" && row.projectId) {
      template.projectId = row.projectId;
      if (Number.isInteger(row.projectOrder)) template.projectOrder = row.projectOrder;
    }
    const materials = Array.isArray(row.materials) ? row.materials.map((m) => (m && typeof m.text === "string" ? m.text.trim() : "")).filter(Boolean) : [];
    if (materials.length > 0) template.materials = materials;
    if (typeof row.comments === "string" && row.comments.trim()) template.comments = row.comments;
    out.push(template);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {MAX_TEMPLATES, buildTemplates};

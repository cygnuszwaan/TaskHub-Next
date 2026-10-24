/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {normalizeRecurrence} = require("./tasks");
const {ROLLING_WINDOW, normalizeSamples, normalizeCount, averageMinutes} = require("./history");

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
// `comments`. It carries no due date, schedule, timer or id: those belong to one instance.
// The job's history (see history.js) comes with it: `completedCount` is the larger of the newest row's stored count and the
// number of rows with that title, and `recentSeconds` the newest row's stored samples, or, for rows archived before
// history was kept, the tracked times (over a second) of the latest rows with that title, oldest first. With any samples
// `estimatedMinutes` is their rolling average rounded to 5 minutes; without, the row's estimate (15 when unusable).
// A row without a usable title is skipped; an unusable priority becomes MEDIUM.
function buildTemplates(rows, limit = MAX_TEMPLATES) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const key = titleKey(row.title);
    if (!key) continue;
    let group = groups.get(key);
    if (!group) {
      group = {row, seen: 0, observed: []};
      groups.set(key, group);
    }
    group.seen++;
    if (group.observed.length < ROLLING_WINDOW && Number.isFinite(row.trackedSeconds) && row.trackedSeconds >= 0.5) group.observed.push(row.trackedSeconds);
  }
  const out = [];
  for (const {row, seen, observed} of groups.values()) {
    const stored = normalizeSamples(row.recentSeconds);
    const samples = stored.length > 0 ? stored : normalizeSamples(observed.reverse());
    const template = {
      title: row.title.trim(),
      priority: PRIORITIES.includes(row.priority) ? row.priority : "MEDIUM",
      estimatedMinutes: averageMinutes(samples) || (Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 15),
      tags: Array.isArray(row.tags) ? row.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : [],
      completedAt: typeof row.completedAt === "string" ? row.completedAt : "",
      completedCount: Math.max(normalizeCount(row.completedCount), seen),
    };
    if (samples.length > 0) template.recentSeconds = samples;
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

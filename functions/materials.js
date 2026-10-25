/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Task materials: a manually written checklist per task (each item may carry a cost for invoicing). A task with an unchecked material is held back from the
// schedule until every material is checked. Pure: no I/O.

const {normalizeMaterialCost} = require("./money");

const MAX_MATERIALS = 30;
const MAX_MATERIAL_LENGTH = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// A materials value from the client as [{id, text, checked, cost?}]. Pure: no I/O.
//   undefined: the value is missing or unusable, meaning "no change"
//   null:      no materials (null, or an array with no usable item); the task's list is removed
//   array:     the cleaned list
// An item needs a non-empty text (trimmed, cut to 100 characters); `checked` is true only for a boolean true. A
// valid, unused string id is kept; any other gets a new one from `makeId`. At most 30 items are kept. `cost` (a number
// or plain decimal text, 0 to 1,000,000, rounded to cents; see money.js) is kept when usable and left out otherwise.
function normalizeMaterials(value, makeId) {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const used = new Set();
  const out = [];
  for (const item of value) {
    if (out.length >= MAX_MATERIALS) break;
    if (!item || typeof item !== "object" || typeof item.text !== "string") continue;
    const text = item.text.trim().slice(0, MAX_MATERIAL_LENGTH).trim();
    if (!text) continue;
    let id = typeof item.id === "string" && ID_PATTERN.test(item.id) && !used.has(item.id) ? item.id : makeId();
    while (used.has(id)) id = makeId();
    used.add(id);
    const entry = {id, text, checked: item.checked === true};
    const cost = normalizeMaterialCost(item.cost);
    if (typeof cost === "number") entry.cost = cost;
    out.push(entry);
  }
  return out.length > 0 ? out : null;
}

// True when the task has at least one unchecked material.
function hasOpenMaterials(task) {
  return Boolean(task) && Array.isArray(task.materials) && task.materials.some((m) => m && m.checked !== true);
}

// The ids of the tasks that cannot be scheduled because of materials. Pure: no I/O.
//   tasks:     every active task
//   lockedIds: Set of ids of tasks pinned to the personal calendar; a pinned task has its own slot and is never held
// A task is held when it has an unchecked material. It also holds back the later tiers of its project: a member
// of the same project with a higher order number than the lowest held tier, because those tasks must come after it.
// A held task without an order number holds back no one.
function heldTaskIds(tasks, lockedIds = new Set()) {
  const held = new Set();
  const lowestHeldTier = new Map(); // project id -> lowest order number among held ordered members
  for (const t of tasks) {
    if (lockedIds.has(t.id) || !hasOpenMaterials(t)) continue;
    held.add(t.id);
    if (t.projectId && Number.isInteger(t.projectOrder)) {
      const current = lowestHeldTier.get(t.projectId);
      if (current === undefined || t.projectOrder < current) lowestHeldTier.set(t.projectId, t.projectOrder);
    }
  }
  for (const t of tasks) {
    if (lockedIds.has(t.id) || !t.projectId || !Number.isInteger(t.projectOrder)) continue;
    const tier = lowestHeldTier.get(t.projectId);
    if (tier !== undefined && t.projectOrder > tier) held.add(t.id);
  }
  return held;
}

module.exports = {MAX_MATERIALS, MAX_MATERIAL_LENGTH, normalizeMaterials, hasOpenMaterials, heldTaskIds};

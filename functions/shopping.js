/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// The Miscellaneous shopping list on the Materials tab: loose items to get that belong to no task. Pure: no I/O.
// An item is {id, text}; the list keeps the order items were added in.

const MAX_SHOPPING_ITEMS = 100;
const MAX_SHOPPING_TEXT = 100;

// An item's text as stored: inner whitespace collapsed, trimmed, 1..100 characters. Returns the text, or null when unusable.
function normalizeShoppingText(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text && text.length <= MAX_SHOPPING_TEXT ? text : null;
}

// A stored list read back: the items with a usable id and text, an id kept once, at most MAX_SHOPPING_ITEMS. Anything else is dropped.
function normalizeShoppingItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    const text = raw && typeof raw === "object" ? normalizeShoppingText(raw.text) : null;
    const id = raw && typeof raw.id === "string" ? raw.id : "";
    if (!text || !id || seen.has(id)) continue;
    seen.add(id);
    items.push({id, text});
    if (items.length === MAX_SHOPPING_ITEMS) break;
  }
  return items;
}

// Adds an item at the end. Returns {items, item, added: true}; an item already on the list (ignoring case) is not added twice, and
// then {items, item: the existing one, added: false}; or {error} for an unusable text or a full list. `makeId` returns a new id.
function addShoppingItem(items, text, makeId) {
  const clean = normalizeShoppingText(text);
  if (!clean) return {error: `text must be 1 to ${MAX_SHOPPING_TEXT} characters`};
  const list = normalizeShoppingItems(items);
  const existing = list.find((i) => i.text.toLowerCase() === clean.toLowerCase());
  if (existing) return {items: list, item: existing, added: false};
  if (list.length >= MAX_SHOPPING_ITEMS) return {error: `The list is full (${MAX_SHOPPING_ITEMS} items)`};
  const item = {id: makeId(), text: clean};
  return {items: [...list, item], item, added: true};
}

// Takes an item off the list. An id that is not there (already removed, say from another device) changes nothing.
// Returns {items, removed}.
function removeShoppingItem(items, id) {
  const list = normalizeShoppingItems(items);
  const remaining = list.filter((i) => i.id !== id);
  return {items: remaining, removed: remaining.length !== list.length};
}

module.exports = {MAX_SHOPPING_ITEMS, MAX_SHOPPING_TEXT, normalizeShoppingText, normalizeShoppingItems, addShoppingItem, removeShoppingItem};

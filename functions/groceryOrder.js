/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// The order the Groceries list is walked in at each store: for every store the item names in walking order. Pure: no I/O.
// A store is {id, name, order: [itemKey]}; an itemKey is an item's text with case and spacing ignored (`itemKey`), so an item
// ticked off the list keeps its place for next time. The stores keep the order they were added in.

const {MAX_SHOPPING_TEXT} = require("./shopping");

const MAX_STORES = 10;
const MAX_STORE_NAME = 60;
const MAX_ORDER_ITEMS = 500;

// The stores a new account starts with, before the first change is saved.
const DEFAULT_STORES = [
  {id: "woolworths-whangaparaoa", name: "Woolworths Whangaparāoa"},
  {id: "paknsave-silverdale", name: "Pak'nSave Silverdale"},
  {id: "new-world-stanmore-bay", name: "New World Stanmore Bay"},
];

// An item's key: inner whitespace collapsed, trimmed, lower case. Returns null for text that is not a string, blank or longer than a list item may be.
function itemKey(value) {
  if (typeof value !== "string") return null;
  const key = value.replace(/\s+/g, " ").trim().toLowerCase();
  return key && key.length <= MAX_SHOPPING_TEXT ? key : null;
}

// A store's name as stored: whitespace collapsed, trimmed, 1..60 characters. Returns the name, or null when unusable.
function normalizeStoreName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name && name.length <= MAX_STORE_NAME ? name : null;
}

// An order read back: usable keys only, each once, at most MAX_ORDER_ITEMS.
function normalizeOrder(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const order = [];
  for (const raw of value) {
    const key = itemKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    order.push(key);
    if (order.length === MAX_ORDER_ITEMS) break;
  }
  return order;
}

// The stores as stored, `value` being the stored array (a store with no usable id or name, or a repeated id, is dropped; at most MAX_STORES).
// Anything that is not an array, which is what a document that was never written holds, gives the default stores with empty orders.
function normalizeStores(value) {
  if (!Array.isArray(value)) return DEFAULT_STORES.map((s) => ({...s, order: []}));
  const seen = new Set();
  const stores = [];
  for (const raw of value) {
    const name = raw && typeof raw === "object" ? normalizeStoreName(raw.name) : null;
    const id = raw && typeof raw.id === "string" ? raw.id : "";
    if (!name || !id || id.length > 200 || seen.has(id)) continue;
    seen.add(id);
    stores.push({id, name, order: normalizeOrder(raw.order)});
    if (stores.length === MAX_STORES) break;
  }
  return stores;
}

// Adds a store at the end. Returns {stores, store, changed: true}, or {error} for an unusable or taken name (ignoring case) or a full list.
// `makeId` returns a new id.
function addStore(stores, name, makeId) {
  const clean = normalizeStoreName(name);
  if (!clean) return {error: `name must be 1 to ${MAX_STORE_NAME} characters`};
  const list = normalizeStores(stores);
  if (list.some((s) => s.name.toLowerCase() === clean.toLowerCase())) return {error: "A store with that name already exists"};
  if (list.length >= MAX_STORES) return {error: `There are already ${MAX_STORES} stores`};
  const store = {id: makeId(), name: clean, order: []};
  return {stores: [...list, store], store, changed: true};
}

// Takes a store away with its order. An id that is not there changes nothing. Returns {stores, removed, changed}.
function removeStore(stores, id) {
  const list = normalizeStores(stores);
  const remaining = list.filter((s) => s.id !== id);
  const removed = remaining.length !== list.length;
  return {stores: remaining, removed, changed: removed};
}

// Puts an item in a store's order right after `afterText`'s place, or first when `afterText` is null, undefined or blank. The item moves if it
// is already in the order. An `afterText` that is not in the order (it changed since the page looked) puts the item last. Returns
// {stores, changed}, or {error, notFound?} for an unknown store, unusable text or a full order.
function moveItem(stores, storeId, text, afterText) {
  const list = normalizeStores(stores);
  const at = list.findIndex((s) => s.id === storeId);
  if (at < 0) return {error: "Store not found", notFound: true};
  const key = itemKey(text);
  if (!key) return {error: `text must be 1 to ${MAX_SHOPPING_TEXT} characters`};
  const blank = afterText === null || afterText === undefined || (typeof afterText === "string" && afterText.trim() === "");
  const afterKey = blank ? null : itemKey(afterText);
  if (!blank && !afterKey) return {error: `afterText must be 1 to ${MAX_SHOPPING_TEXT} characters`};
  const before = list[at].order;
  if (!before.includes(key) && before.length >= MAX_ORDER_ITEMS) return {error: `The order is full (${MAX_ORDER_ITEMS} items)`};
  const rest = before.filter((k) => k !== key);
  let place = 0;
  if (afterKey !== null) {
    const found = rest.indexOf(afterKey);
    place = found < 0 ? rest.length : found + 1;
  }
  const order = [...rest.slice(0, place), key, ...rest.slice(place)];
  const changed = order.length !== before.length || order.some((k, i) => k !== before[i]);
  if (!changed) return {stores: list, changed: false};
  return {stores: list.map((s, i) => (i === at ? {...s, order} : s)), changed: true};
}

// Sets or extends a store's order from lines of text, one item per line in walking order. `mode` is "replace" (the lines become the order) or
// "extend" (the default: lines not already in the order go after it, in line order). Blank lines and repeats are skipped, and a line too long for an
// item is skipped and counted. Returns {stores, changed, count, skipped}: `count` the items in the order now; or {error, notFound?}.
function seedOrder(stores, storeId, text, mode) {
  const list = normalizeStores(stores);
  const at = list.findIndex((s) => s.id === storeId);
  if (at < 0) return {error: "Store not found", notFound: true};
  if (typeof text !== "string") return {error: "text must be lines of items, one per line"};
  if (mode !== undefined && mode !== "replace" && mode !== "extend") return {error: "mode must be replace or extend"};
  const keys = [];
  const seen = new Set();
  let skipped = 0;
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const key = itemKey(line);
    if (!key) {
      skipped++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  if (keys.length === 0) return {error: "Type or paste at least one item, one per line"};
  const before = list[at].order;
  const order = mode === "replace" ? keys : [...before, ...keys.filter((k) => !before.includes(k))];
  if (order.length > MAX_ORDER_ITEMS) return {error: `An order holds at most ${MAX_ORDER_ITEMS} items`};
  const changed = order.length !== before.length || order.some((k, i) => k !== before[i]);
  return {stores: changed ? list.map((s, i) => (i === at ? {...s, order} : s)) : list, changed, count: order.length, skipped};
}

module.exports = {MAX_STORES, MAX_STORE_NAME, MAX_ORDER_ITEMS, DEFAULT_STORES, itemKey, normalizeStoreName, normalizeOrder, normalizeStores, addStore, removeStore, moveItem, seedOrder};

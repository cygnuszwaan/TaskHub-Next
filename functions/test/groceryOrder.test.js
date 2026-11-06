/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_STORES, MAX_STORE_NAME, MAX_ORDER_ITEMS, DEFAULT_STORES, itemKey, normalizeStoreName, normalizeOrder, normalizeStores, addStore, removeStore, moveItem, seedOrder} = require("../groceryOrder");

const store = (id, order = [], name = `Store ${id}`) => ({id, name, order});
const orderOf = (result, id = "a") => result.stores.find((s) => s.id === id).order;

describe("groceryOrder.js keys and names", () => {
  it("itemKey ignores case and spacing, and refuses blank, too long or non-text", () => {
    assert.equal(itemKey("  Full  Cream\n Milk "), "full cream milk");
    assert.equal(itemKey("MILK"), itemKey("milk"));
    for (const v of ["", "   ", null, undefined, 5, {}]) assert.equal(itemKey(v), null);
    assert.equal(itemKey("x".repeat(100)).length, 100);
    assert.equal(itemKey("x".repeat(101)), null);
  });
  it("normalizeStoreName collapses spacing and allows 1 to 60 characters", () => {
    assert.equal(normalizeStoreName("  New   World  "), "New World");
    assert.equal(normalizeStoreName("x".repeat(MAX_STORE_NAME)).length, MAX_STORE_NAME);
    for (const v of ["", "  ", "x".repeat(MAX_STORE_NAME + 1), null, 7]) assert.equal(normalizeStoreName(v), null);
  });
  it("normalizeOrder keeps usable keys once each, in order, at most MAX_ORDER_ITEMS", () => {
    assert.deepEqual(normalizeOrder(["Milk", "milk", " Eggs ", "", 5, null, "bread"]), ["milk", "eggs", "bread"]);
    assert.deepEqual(normalizeOrder("milk"), []);
    assert.equal(normalizeOrder(Array.from({length: MAX_ORDER_ITEMS + 20}, (_, i) => `item ${i}`)).length, MAX_ORDER_ITEMS);
  });
});

describe("groceryOrder.js normalizeStores", () => {
  it("gives the default stores, with empty orders, for anything that is not a stored array", () => {
    for (const v of [undefined, null, "x", {}]) {
      const stores = normalizeStores(v);
      assert.deepEqual(stores.map((s) => s.name), ["Woolworths Whangaparāoa", "Pak'nSave Silverdale", "New World Stanmore Bay"]);
      assert.ok(stores.every((s) => s.order.length === 0));
    }
    assert.equal(DEFAULT_STORES.length, 3);
    assert.equal(normalizeStores(undefined)[0].order === normalizeStores(undefined)[0].order, false, "each call gives its own arrays");
  });
  it("keeps a stored array as it is, even an empty one, and drops unusable or repeated stores", () => {
    assert.deepEqual(normalizeStores([]), []);
    const out = normalizeStores([store("a", ["Milk", "milk"]), {id: "a", name: "Again"}, {id: "", name: "No id"}, {id: "b", name: "  "}, null, store("c")]);
    assert.deepEqual(out.map((s) => s.id), ["a", "c"]);
    assert.deepEqual(out[0].order, ["milk"]);
  });
  it("holds at most MAX_STORES", () => {
    const many = Array.from({length: MAX_STORES + 3}, (_, i) => store(`s${i}`));
    assert.equal(normalizeStores(many).length, MAX_STORES);
  });
});

describe("groceryOrder.js addStore and removeStore", () => {
  it("adds a store at the end with an empty order and the cleaned name", () => {
    const r = addStore([store("a")], "  Four   Square ", () => "n1");
    assert.deepEqual(r.store, {id: "n1", name: "Four Square", order: []});
    assert.deepEqual(r.stores.map((s) => s.id), ["a", "n1"]);
    assert.equal(r.changed, true);
  });
  it("starts from the default stores when nothing was stored", () => {
    const r = addStore(undefined, "Four Square", () => "n1");
    assert.equal(r.stores.length, DEFAULT_STORES.length + 1);
    assert.equal(r.stores.at(-1).id, "n1");
  });
  it("refuses a blank, too long or taken name (ignoring case) and a full list", () => {
    assert.match(addStore([store("a")], "  ", () => "n").error, /1 to 60/);
    assert.match(addStore([store("a")], "x".repeat(61), () => "n").error, /1 to 60/);
    assert.match(addStore([store("a", [], "Pak'nSave")], "pak'nsave", () => "n").error, /already exists/);
    const full = Array.from({length: MAX_STORES}, (_, i) => store(`s${i}`));
    assert.match(addStore(full, "One more", () => "n").error, /already 10 stores/);
  });
  it("removes a store with its order; an id that is not there changes nothing", () => {
    const r = removeStore([store("a", ["milk"]), store("b")], "a");
    assert.deepEqual(r.stores.map((s) => s.id), ["b"]);
    assert.equal(r.removed, true);
    assert.equal(r.changed, true);
    const none = removeStore([store("b")], "zzz");
    assert.equal(none.removed, false);
    assert.equal(none.changed, false);
  });
});

describe("groceryOrder.js moveItem", () => {
  const stores = () => [store("a", ["bread", "milk", "eggs"]), store("b", ["milk"])];

  it("puts an item first when no neighbour is given", () => {
    for (const after of [null, undefined, "", "  "]) assert.deepEqual(orderOf(moveItem(stores(), "a", "Eggs", after)), ["eggs", "bread", "milk"]);
  });
  it("puts an item right after its neighbour, moving it when it is already in the order", () => {
    assert.deepEqual(orderOf(moveItem(stores(), "a", "Bread", "eggs")), ["milk", "eggs", "bread"]);
    assert.deepEqual(orderOf(moveItem(stores(), "a", "eggs", "BREAD")), ["bread", "eggs", "milk"]);
  });
  it("adds an item the store had not seen", () => {
    assert.deepEqual(orderOf(moveItem(stores(), "a", "Butter", "bread")), ["bread", "butter", "milk", "eggs"]);
    assert.deepEqual(orderOf(moveItem(stores(), "a", "Butter", null)), ["butter", "bread", "milk", "eggs"]);
  });
  it("puts the item last when its neighbour is not in the order any more", () => {
    assert.deepEqual(orderOf(moveItem(stores(), "a", "Bread", "ghost")), ["milk", "eggs", "bread"]);
  });
  it("changes only the named store", () => {
    const r = moveItem(stores(), "a", "Eggs", null);
    assert.deepEqual(orderOf(r, "b"), ["milk"]);
  });
  it("reports no change when the item is already there", () => {
    assert.equal(moveItem(stores(), "a", "Milk", "bread").changed, false);
    assert.equal(moveItem(stores(), "a", "bread", null).changed, false);
    assert.equal(moveItem(stores(), "a", "eggs", "eggs").changed, false);
  });
  it("refuses an unknown store (not found), unusable text or neighbour, and a full order", () => {
    const missing = moveItem(stores(), "zzz", "Milk", null);
    assert.equal(missing.notFound, true);
    assert.match(missing.error, /Store not found/);
    assert.match(moveItem(stores(), "a", "  ", null).error, /text must be/);
    assert.match(moveItem(stores(), "a", "Milk", "x".repeat(101)).error, /afterText must be/);
    const full = [store("a", Array.from({length: MAX_ORDER_ITEMS}, (_, i) => `item ${i}`))];
    assert.match(moveItem(full, "a", "A new one", null).error, /order is full/);
    assert.equal(moveItem(full, "a", "item 5", null).changed, true, "moving an item already in a full order is fine");
  });
});

describe("groceryOrder.js seedOrder", () => {
  const stores = () => [store("a", ["bread", "milk"]), store("b", ["eggs"])];
  const text = "Milk\n\n  Butter \r\nCheese\nbutter\n";

  it("extends an order with the lines it does not have, in line order, by default", () => {
    const r = seedOrder(stores(), "a", text);
    assert.deepEqual(orderOf(r), ["bread", "milk", "butter", "cheese"]);
    assert.equal(r.count, 4);
    assert.equal(r.skipped, 0);
    assert.equal(r.changed, true);
    assert.deepEqual(orderOf(seedOrder(stores(), "a", text, "extend")), orderOf(r));
  });
  it("replaces an order with the lines, without repeats", () => {
    const r = seedOrder(stores(), "a", text, "replace");
    assert.deepEqual(orderOf(r), ["milk", "butter", "cheese"]);
    assert.equal(r.count, 3);
  });
  it("changes only the named store", () => {
    assert.deepEqual(orderOf(seedOrder(stores(), "a", text, "replace"), "b"), ["eggs"]);
  });
  it("counts the lines too long for an item and skips them", () => {
    const r = seedOrder(stores(), "a", `Butter\n${"x".repeat(101)}`);
    assert.equal(r.skipped, 1);
    assert.deepEqual(orderOf(r), ["bread", "milk", "butter"]);
  });
  it("reports no change when extending with items already there", () => {
    const r = seedOrder(stores(), "a", "Milk\nBread");
    assert.equal(r.changed, false);
    assert.equal(r.count, 2);
  });
  it("refuses an unknown store (not found), non-text, no usable line, an unknown mode and too many items", () => {
    assert.equal(seedOrder(stores(), "zzz", "Milk").notFound, true);
    assert.match(seedOrder(stores(), "a", 5).error, /lines of items/);
    assert.match(seedOrder(stores(), "a", " \n \n").error, /at least one item/);
    assert.match(seedOrder(stores(), "a", "x".repeat(101)).error, /at least one item/);
    assert.match(seedOrder(stores(), "a", "Milk", "append").error, /mode must be/);
    const lines = Array.from({length: MAX_ORDER_ITEMS + 1}, (_, i) => `item ${i}`).join("\n");
    assert.match(seedOrder(stores(), "a", lines, "replace").error, /at most 500/);
  });
});

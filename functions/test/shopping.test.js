/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_SHOPPING_ITEMS, MAX_SHOPPING_TEXT, normalizeShoppingText, normalizeShoppingItems, addShoppingItem, removeShoppingItem} = require("../shopping");

const item = (id, text) => ({id, text});

describe("shopping.js normalizeShoppingText", () => {
  it("trims and collapses inner whitespace", () => {
    assert.equal(normalizeShoppingText("  Milk \n  2 litres "), "Milk 2 litres");
  });
  it("rejects blank, non-text and over-long text", () => {
    for (const v of ["", "   ", null, undefined, 5, {}, "x".repeat(MAX_SHOPPING_TEXT + 1)]) assert.equal(normalizeShoppingText(v), null);
    assert.equal(normalizeShoppingText("x".repeat(MAX_SHOPPING_TEXT)).length, MAX_SHOPPING_TEXT);
  });
});

describe("shopping.js normalizeShoppingItems", () => {
  it("keeps good items in order and drops the rest", () => {
    const raw = [item("a", " Milk "), {id: "", text: "No id"}, {id: "b"}, null, "x", item("a", "Repeated id"), item("c", "Eggs")];
    assert.deepEqual(normalizeShoppingItems(raw), [item("a", "Milk"), item("c", "Eggs")]);
  });
  it("gives an empty list for anything that is not a list", () => {
    for (const v of [undefined, null, "x", {}, 3]) assert.deepEqual(normalizeShoppingItems(v), []);
  });
  it("keeps at most MAX_SHOPPING_ITEMS", () => {
    const many = Array.from({length: MAX_SHOPPING_ITEMS + 5}, (_, i) => item(`i${i}`, `Item ${i}`));
    assert.equal(normalizeShoppingItems(many).length, MAX_SHOPPING_ITEMS);
  });
});

describe("shopping.js addShoppingItem", () => {
  it("adds the cleaned text at the end with the new id", () => {
    const r = addShoppingItem([item("a", "Milk")], "  Duct   tape ", () => "n1");
    assert.deepEqual(r.items, [item("a", "Milk"), item("n1", "Duct tape")]);
    assert.deepEqual(r.item, item("n1", "Duct tape"));
    assert.equal(r.added, true);
  });
  it("starts a list from nothing", () => {
    assert.deepEqual(addShoppingItem(undefined, "Milk", () => "n1").items, [item("n1", "Milk")]);
  });
  it("does not add an item twice, ignoring case, and does not use up an id", () => {
    let made = 0;
    const r = addShoppingItem([item("a", "Milk")], "MILK", () => `n${++made}`);
    assert.deepEqual(r.items, [item("a", "Milk")]);
    assert.deepEqual(r.item, item("a", "Milk"));
    assert.equal(r.added, false);
    assert.equal(made, 0);
  });
  it("answers an unusable text or a full list with an error", () => {
    assert.match(addShoppingItem([], "  ", () => "n").error, /1 to 100 characters/);
    assert.match(addShoppingItem([], "x".repeat(101), () => "n").error, /1 to 100 characters/);
    const full = Array.from({length: MAX_SHOPPING_ITEMS}, (_, i) => item(`i${i}`, `Item ${i}`));
    assert.match(addShoppingItem(full, "One more", () => "n").error, /full/);
  });
  it("does not modify its input", () => {
    const list = [item("a", "Milk")];
    addShoppingItem(list, "Eggs", () => "n");
    assert.deepEqual(list, [item("a", "Milk")]);
  });
});

describe("shopping.js removeShoppingItem", () => {
  it("takes the item off, keeping the order of the others", () => {
    const r = removeShoppingItem([item("a", "Milk"), item("b", "Eggs"), item("c", "Tape")], "b");
    assert.deepEqual(r.items, [item("a", "Milk"), item("c", "Tape")]);
    assert.equal(r.removed, true);
  });
  it("changes nothing for an id that is not there", () => {
    const r = removeShoppingItem([item("a", "Milk")], "zzz");
    assert.deepEqual(r.items, [item("a", "Milk")]);
    assert.equal(r.removed, false);
  });
});

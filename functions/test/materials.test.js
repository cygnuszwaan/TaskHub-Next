/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_MATERIALS, MAX_MATERIAL_LENGTH, normalizeMaterials, hasOpenMaterials, heldTaskIds} = require("../materials");

function ids() {
  let n = 0;
  return () => `gen${++n}`;
}

describe("materials.js", () => {
  describe("normalizeMaterials", () => {
    it("keeps valid items with their ids and checked state", () => {
      assert.deepEqual(normalizeMaterials([{id: "a", text: "Paint", checked: true}, {id: "b", text: "Brushes", checked: false}], ids()), [
        {id: "a", text: "Paint", checked: true}, {id: "b", text: "Brushes", checked: false},
      ]);
    });
    it("keeps a usable cost rounded to cents, and leaves the key out otherwise", () => {
      const out = normalizeMaterials([
        {id: "a", text: "Paint", cost: 45.678}, {id: "b", text: "Tape", cost: "3.5"}, {id: "c", text: "Free", cost: 0},
        {id: "d", text: "Bad", cost: -2}, {id: "e", text: "Text", cost: "lots"}, {id: "f", text: "Null", cost: null}, {id: "g", text: "Huge", cost: 2000000}, {id: "h", text: "Empty", cost: ""},
      ], ids());
      assert.deepEqual(out.map((m) => m.cost), [45.68, 3.5, 0, undefined, undefined, undefined, undefined, undefined]);
      for (const m of out.slice(3)) assert.equal("cost" in m, false);
    });
    it("clears a cost when the item is sent again without one", () => {
      assert.equal("cost" in normalizeMaterials([{id: "a", text: "Paint"}], ids())[0], false);
    });
    it("trims text and treats anything but a boolean true as unchecked", () => {
      const out = normalizeMaterials([{id: "a", text: "  Paint  ", checked: "true"}, {id: "b", text: "Tape", checked: 1}, {id: "c", text: "Rags"}], ids());
      assert.deepEqual(out.map((m) => [m.text, m.checked]), [["Paint", false], ["Tape", false], ["Rags", false]]);
    });
    it("gives a new id to an item with a missing, invalid or repeated id", () => {
      const out = normalizeMaterials([{text: "a"}, {id: "bad id!", text: "b"}, {id: "x", text: "c"}, {id: "x", text: "d"}, {id: 5, text: "e"}], ids());
      assert.deepEqual(out.map((m) => m.id), ["gen1", "gen2", "x", "gen3", "gen4"]);
    });
    it("never repeats an id even when the generator collides with a kept one", () => {
      const out = normalizeMaterials([{id: "gen1", text: "a"}, {text: "b"}], ids());
      assert.deepEqual(out.map((m) => m.id), ["gen1", "gen2"]);
    });
    it("drops items without usable text", () => {
      const out = normalizeMaterials([{id: "a", text: "   "}, {id: "b", text: ""}, {id: "c"}, {id: "d", text: 5}, null, "x", {id: "e", text: "ok"}], ids());
      assert.deepEqual(out, [{id: "e", text: "ok", checked: false}]);
    });
    it("cuts long text and keeps at most the first 30 items", () => {
      const long = normalizeMaterials([{text: "x".repeat(300)}], ids());
      assert.equal(long[0].text.length, MAX_MATERIAL_LENGTH);
      const many = normalizeMaterials(Array.from({length: 40}, (_, i) => ({text: `item ${i}`})), ids());
      assert.equal(many.length, MAX_MATERIALS);
      assert.equal(many[29].text, "item 29");
    });
    it("returns null for null or a list with nothing usable, and undefined for anything else", () => {
      assert.equal(normalizeMaterials(null, ids()), null);
      assert.equal(normalizeMaterials([], ids()), null);
      assert.equal(normalizeMaterials([{text: " "}], ids()), null);
      for (const bad of [undefined, "paint", 5, {text: "a"}, true]) assert.equal(normalizeMaterials(bad, ids()), undefined);
    });
  });

  describe("hasOpenMaterials", () => {
    it("is true only while some material is unchecked", () => {
      assert.equal(hasOpenMaterials({materials: [{id: "a", text: "x", checked: true}, {id: "b", text: "y", checked: false}]}), true);
      assert.equal(hasOpenMaterials({materials: [{id: "a", text: "x", checked: true}]}), false);
    });
    it("is false without materials", () => {
      for (const t of [{}, {materials: []}, {materials: null}, undefined]) assert.equal(hasOpenMaterials(t), false);
    });
  });

  describe("heldTaskIds", () => {
    const open = [{id: "m", text: "x", checked: false}];
    const done = [{id: "m", text: "x", checked: true}];
    it("holds a task with an unchecked material and no other", () => {
      const held = heldTaskIds([{id: "a", materials: open}, {id: "b", materials: done}, {id: "c"}]);
      assert.deepEqual([...held], ["a"]);
    });
    it("holds the later tiers of the same project, but not earlier or equal tiers, other projects or unordered tasks", () => {
      const tasks = [
        {id: "t1", projectId: "k", projectOrder: 1},
        {id: "t2", projectId: "k", projectOrder: 2, materials: open},
        {id: "t2b", projectId: "k", projectOrder: 2},
        {id: "t3", projectId: "k", projectOrder: 3},
        {id: "loose", projectId: "k"},
        {id: "other", projectId: "z", projectOrder: 5},
        {id: "none", materials: done},
      ];
      assert.deepEqual([...heldTaskIds(tasks)].sort(), ["t2", "t3"]);
    });
    it("uses the lowest held tier of a project", () => {
      const tasks = [
        {id: "t1", projectId: "k", projectOrder: 1},
        {id: "t2", projectId: "k", projectOrder: 2, materials: open},
        {id: "t3", projectId: "k", projectOrder: 3, materials: open},
        {id: "t4", projectId: "k", projectOrder: 4},
      ];
      assert.deepEqual([...heldTaskIds(tasks)].sort(), ["t2", "t3", "t4"]);
    });
    it("holds back nobody when the held task has no order number", () => {
      const tasks = [{id: "a", projectId: "k", materials: open}, {id: "b", projectId: "k", projectOrder: 2}];
      assert.deepEqual([...heldTaskIds(tasks)], ["a"]);
    });
    it("never holds a locked task, and a locked task holds back no one", () => {
      const tasks = [{id: "a", projectId: "k", projectOrder: 1, materials: open}, {id: "b", projectId: "k", projectOrder: 2}, {id: "c", materials: open}];
      assert.deepEqual([...heldTaskIds(tasks, new Set(["a", "c"]))], []);
    });
  });
});

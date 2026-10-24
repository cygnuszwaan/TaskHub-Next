/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MIN_STEPS, MAX_STEPS, namesProject, normalizeStep, normalizeProposal} = require("../proposal");

const step = (n, extra = {}) => ({title: `Step ${n}`, priority: "MEDIUM", estimatedMinutes: 30, tags: ["Indoor"], ...extra});
const steps = (n) => Array.from({length: n}, (_, i) => step(i + 1));
const raw = (extra = {}) => ({name: "Bathroom renovation", steps: steps(4), ...extra});
const projects = [{id: "p1", name: "Kitchen reno"}, {id: "p2", name: "Deck"}];
const opts = {input: "renovate the bathroom", projects, changes: [{title: "Renovate the bathroom", order: 1}]};

describe("proposal.js", () => {
  describe("namesProject", () => {
    it("finds a project's whole name in the text, ignoring case and spacing", () => {
      assert.equal(namesProject("finish the  KITCHEN   reno this week", projects), true);
      assert.equal(namesProject("kitchen reno", projects), true);
      assert.equal(namesProject("Build the deck.", projects), true);
    });
    it("does not find a name inside a longer word", () => {
      assert.equal(namesProject("repair the decking", projects), false);
      assert.equal(namesProject("redeck the yard", projects), false);
    });
    it("copes with names holding pattern characters, accents and no projects", () => {
      assert.equal(namesProject("do the (a+b) job", [{id: "x", name: "(a+b)"}]), true);
      assert.equal(namesProject("Whangaparāoa fence", [{id: "x", name: "Whangaparāoa"}]), true);
      assert.equal(namesProject("anything", []), false);
      assert.equal(namesProject("", projects), false);
      assert.equal(namesProject("x", [{id: "x"}, null, {name: ""}]), false);
      assert.equal(namesProject("x", undefined), false);
    });
  });

  describe("normalizeStep", () => {
    it("keeps a valid step", () => {
      assert.deepEqual(normalizeStep(step(1)), {title: "Step 1", priority: "MEDIUM", estimatedMinutes: 30, tags: ["Indoor"]});
    });
    it("falls back to the manual-entry defaults for unusable fields", () => {
      assert.deepEqual(normalizeStep({title: "  Tile  the floor "}), {title: "Tile the floor", priority: "MEDIUM", estimatedMinutes: 15, tags: []});
      assert.equal(normalizeStep({title: "x", priority: "URGENT"}).priority, "MEDIUM");
      assert.equal(normalizeStep({title: "x", estimatedMinutes: -5}).estimatedMinutes, 15);
      assert.equal(normalizeStep({title: "x", estimatedMinutes: "30"}).estimatedMinutes, 15);
      assert.equal(normalizeStep({title: "x", estimatedMinutes: 29.6}).estimatedMinutes, 30);
    });
    it("cleans tags and rejects a step without a title", () => {
      assert.deepEqual(normalizeStep({title: "x", tags: [" Outdoor ", "outdoor", 5, "", "Garden"]}).tags, ["Outdoor", "Garden"]);
      for (const bad of [null, undefined, "x", [], {}, {title: "  "}, {title: 5}]) assert.equal(normalizeStep(bad), null);
    });
  });

  describe("normalizeProposal", () => {
    it("accepts a name with 3 to 12 steps and keeps their order", () => {
      assert.equal(MIN_STEPS, 3);
      assert.equal(MAX_STEPS, 12);
      const p = normalizeProposal(raw(), opts);
      assert.equal(p.name, "Bathroom renovation");
      assert.deepEqual(p.steps.map((s) => s.title), ["Step 1", "Step 2", "Step 3", "Step 4"]);
      assert.equal(normalizeProposal(raw({steps: steps(3)}), opts).steps.length, 3);
      assert.equal(normalizeProposal(raw({steps: steps(12)}), opts).steps.length, 12);
    });
    it("tidies the name and the steps", () => {
      const p = normalizeProposal(raw({name: "  Bathroom   renovation ", steps: [step(1), {title: "Paint"}, {title: ""}, step(3)]}), opts);
      assert.equal(p.name, "Bathroom renovation");
      assert.deepEqual(p.steps.map((s) => s.title), ["Step 1", "Paint", "Step 3"]);
      assert.equal(p.steps[1].estimatedMinutes, 15);
    });
    it("is dropped as a whole with fewer than 3 usable steps or more than 12", () => {
      assert.equal(normalizeProposal(raw({steps: steps(2)}), opts), null);
      assert.equal(normalizeProposal(raw({steps: [step(1), step(2), {title: ""}]}), opts), null);
      assert.equal(normalizeProposal(raw({steps: steps(13)}), opts), null);
      assert.equal(normalizeProposal(raw({steps: []}), opts), null);
    });
    it("is dropped for an unusable name or shape", () => {
      for (const bad of [undefined, null, "x", 5, [], {}, raw({name: ""}), raw({name: "  "}), raw({name: 5}), raw({name: "x".repeat(101)}), raw({steps: "no"}), raw({steps: undefined})]) {
        assert.equal(normalizeProposal(bad, opts), null);
      }
    });
    it("is dropped when the name matches an existing project, ignoring case and spacing", () => {
      assert.equal(normalizeProposal(raw({name: "kitchen   RENO"}), opts), null);
      assert.ok(normalizeProposal(raw({name: "Kitchen reno 2"}), opts));
    });
    it("is dropped when the input already names a project", () => {
      assert.equal(normalizeProposal(raw(), {...opts, input: "start the deck: sand, stain, seal"}), null);
      assert.ok(normalizeProposal(raw(), {...opts, input: "redo the decking"}));
    });
    it("is dropped when the model put a task of the input into a project", () => {
      assert.equal(normalizeProposal(raw(), {...opts, changes: [{title: "Sand", projectId: "p1"}]}), null);
      assert.ok(normalizeProposal(raw(), {...opts, changes: [{title: "Sand", projectId: "nope"}]}));
    });
    it("works with no options and does not modify its input", () => {
      assert.ok(normalizeProposal(raw()));
      const input = raw();
      const copy = JSON.parse(JSON.stringify(input));
      normalizeProposal(input, opts);
      assert.deepEqual(input, copy);
    });
  });
});

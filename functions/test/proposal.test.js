/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MIN_STEPS, MAX_STEPS, MAX_APPLY_CHANGES, namesProject, normalizeStep, checkProposal, normalizeProposal, proposalChanges, acceptProposalInList, applyChanges} = require("../proposal");

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

  describe("proposalChanges", () => {
    it("passes a step's comments on, and only when it has some", () => {
      const changes = proposalChanges({name: "P", steps: [step(1, {comments: "Detail"}), step(2)]}, "proj");
      assert.equal(changes[0].comments, "Detail");
      assert.equal("comments" in changes[1], false);
    });
    it("makes one new-task change per step, in order, each its own tier of the project", () => {
      const changes = proposalChanges({name: "Bathroom renovation", steps: steps(3)}, "proj");
      assert.equal(changes.length, 3);
      assert.deepEqual(changes.map((c) => c.title), ["Step 1", "Step 2", "Step 3"]);
      assert.deepEqual(changes.map((c) => c.projectOrder), [1, 2, 3]);
      assert.ok(changes.every((c) => c.projectId === "proj" && c.id === undefined && c.order === undefined));
      assert.deepEqual(changes[0], {title: "Step 1", priority: "MEDIUM", estimatedMinutes: 30, tags: ["Indoor"], projectId: "proj", projectOrder: 1});
    });
  });

  describe("acceptProposalInList", () => {
    const makeId = (() => {
      let n = 0;
      return () => `id${++n}`;
    })();
    const existing = [
      {id: "t1", title: "Bins", priority: "LOW", dueDate: "", estimatedMinutes: 10, tags: [], status: "PENDING", order: 1},
      {id: "t2", title: "Mow", priority: "LOW", dueDate: "", estimatedMinutes: 20, tags: [], status: "PENDING", order: 2},
    ];
    const NOW = "2026-10-24T10:00:00.000Z";

    it("adds the project and its steps at the end of the list, with project fields and addedAt", () => {
      const r = acceptProposalInList(existing, projects, raw(), makeId, NOW);
      assert.equal(r.error, undefined);
      assert.equal(r.added, 4);
      assert.equal(r.tasks.length, 6);
      assert.deepEqual(r.tasks.slice(0, 2), existing);
      assert.deepEqual(r.tasks.map((t) => t.order), [1, 2, 3, 4, 5, 6]);
      const added = r.tasks.slice(2);
      assert.deepEqual(added.map((t) => t.title), ["Step 1", "Step 2", "Step 3", "Step 4"]);
      assert.deepEqual(added.map((t) => t.projectOrder), [1, 2, 3, 4]);
      assert.ok(added.every((t) => t.projectId === r.project.id && t.status === "PENDING" && t.addedAt === NOW && t.dueDate === ""));
      assert.equal(added[0].estimatedMinutes, 30);
      assert.deepEqual(added[0].tags, ["Indoor"]);
      assert.equal(new Set(r.tasks.map((t) => t.id)).size, 6);
    });
    it("returns the new project and the project list sorted by name with it included", () => {
      const r = acceptProposalInList(existing, projects, raw(), makeId, NOW);
      assert.equal(r.project.name, "Bathroom renovation");
      assert.ok(r.project.id);
      assert.deepEqual(r.projects.map((p) => p.name), ["Bathroom renovation", "Deck", "Kitchen reno"]);
    });
    it("checks the suggestion again: a name taken since it was offered, too few steps or junk add nothing", () => {
      for (const bad of [raw({name: "kitchen RENO"}), raw({steps: steps(MIN_STEPS - 1)}), raw({steps: steps(MAX_STEPS + 1)}), raw({name: ""}), null, undefined, "x", []]) {
        const r = acceptProposalInList(existing, projects, bad, makeId, NOW);
        assert.equal(typeof r.error, "string");
        assert.equal(r.tasks, undefined);
        assert.equal(r.project, undefined);
      }
    });
    it("works with no projects stored and an empty list", () => {
      const r = acceptProposalInList([], [], raw(), makeId, NOW);
      assert.equal(r.tasks.length, 4);
      assert.deepEqual(r.projects.map((p) => p.name), ["Bathroom renovation"]);
      assert.equal(acceptProposalInList([], undefined, raw(), makeId, NOW).tasks.length, 4);
    });
    it("takes the model's cleaned fields only, ignoring anything else a step carries", () => {
      const r = acceptProposalInList([], projects, raw({steps: [step(1, {id: "evil", order: 1, status: "COMPLETED", materials: [{text: "m"}], snoozedUntil: "2030-01-01"}), step(2), step(3)]}), makeId, NOW);
      const first = r.tasks[0];
      assert.equal(first.status, "PENDING");
      assert.notEqual(first.id, "evil");
      for (const key of ["comments", "materials", "snoozedUntil"]) assert.equal(key in first, false);
    });
    it("stores a step's comments on its task, and leaves the key off a step with none", () => {
      const r = acceptProposalInList([], projects, raw({steps: [step(1, {comments: "  Check the council rules.\nH5 piles.  "}), step(2), step(3, {comments: "   "}), step(4, {comments: 5})]}), makeId, NOW);
      assert.equal(r.tasks[0].comments, "Check the council rules.\nH5 piles.");
      assert.equal("comments" in r.tasks[1], false);
      assert.equal("comments" in r.tasks[2], false);
      assert.equal("comments" in r.tasks[3], false);
    });
    it("does not modify what it is given", () => {
      const tasks = JSON.parse(JSON.stringify(existing));
      const stored = JSON.parse(JSON.stringify(projects));
      const input = raw();
      const copy = JSON.parse(JSON.stringify(input));
      acceptProposalInList(tasks, stored, input, makeId, NOW);
      assert.deepEqual(tasks, existing);
      assert.deepEqual(stored, projects);
      assert.deepEqual(input, copy);
    });
  });

  describe("applyChanges", () => {
    it("returns the changes list of a well-formed body", () => {
      const changes = [{title: "Renovate the bathroom", order: 1}, {id: "t1", priority: "HIGH"}];
      assert.equal(applyChanges({changes}), changes);
      assert.deepEqual(applyChanges({changes: []}), []);
    });
    it("is null for anything else", () => {
      for (const bad of [undefined, null, "x", 5, [], {}, {changes: "no"}, {changes: {}}, {changes: [null]}, {changes: [5]}, {changes: [[]]}, {changes: [{title: "a"}, "b"]}]) {
        assert.equal(applyChanges(bad), null);
      }
    });
    it("allows at most MAX_APPLY_CHANGES changes", () => {
      assert.equal(applyChanges({changes: Array.from({length: MAX_APPLY_CHANGES}, () => ({title: "a"}))}).length, MAX_APPLY_CHANGES);
      assert.equal(applyChanges({changes: Array.from({length: MAX_APPLY_CHANGES + 1}, () => ({title: "a"}))}), null);
    });
  });

  describe("step comments", () => {
    it("are trimmed and cut to 2000 characters like a task's comments", () => {
      assert.equal(normalizeStep({...step(1), comments: "  Hello  "}).comments, "Hello");
      assert.equal(normalizeStep({...step(1), comments: "x".repeat(2500)}).comments.length, 2000);
    });
    it("are left off when blank or not text", () => {
      for (const c of [undefined, null, "", "  \n ", 5, {}, []]) assert.equal("comments" in normalizeStep({...step(1), comments: c}), false);
    });
    it("survive normalizeProposal on the steps that have them", () => {
      const r = normalizeProposal(raw({steps: [step(1, {comments: "A"}), step(2), step(3, {comments: "C"})]}), opts);
      assert.deepEqual(r.steps.map((s) => s.comments), ["A", undefined, "C"]);
    });
  });

  describe("checkProposal", () => {
    it("returns the proposal, and no reason, for a usable suggestion", () => {
      const r = checkProposal(raw(), opts);
      assert.equal(r.reason, undefined);
      assert.equal(r.proposal.name, "Bathroom renovation");
      assert.deepEqual(r.proposal, normalizeProposal(raw(), opts));
    });
    it("says why a suggestion is not used", () => {
      const why = (r, o = opts) => checkProposal(r, o).reason;
      assert.match(why(undefined), /returned no projectProposal/);
      assert.match(why(null), /returned no projectProposal/);
      assert.match(why("x"), /not an object/);
      assert.match(why(raw({name: " "})), /name is unusable/);
      assert.match(why(raw({steps: "no"})), /no steps list/);
      assert.match(why(raw({steps: steps(MAX_STEPS + 1)})), /13 steps is more than 12/);
      assert.match(why(raw({steps: [step(1), step(2), {title: ""}]})), /only 2 usable steps, 3 needed/);
      assert.match(why(raw({name: "kitchen reno"})), /already exists/);
      assert.match(why(raw(), {...opts, input: "tile the deck"}), /names an existing project/);
      assert.match(why(raw(), {...opts, changes: [{title: "x", projectId: "p1"}]}), /into an existing project/);
      assert.equal(checkProposal(raw(), {...opts, input: "tile the deck"}).proposal, undefined);
    });
  });
});

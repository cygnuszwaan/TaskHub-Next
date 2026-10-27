/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildTaskPrompt} = require("../prompts");

describe("prompts.js", () => {
  describe("buildTaskPrompt", () => {
    const tasks = [
      {id: "t1", title: "Demolition", priority: "HIGH", dueDate: "", estimatedMinutes: 60, tags: [], order: 1, projectId: "p1", projectOrder: 1, status: "PENDING", googleCalendarEventId: "ev9", scheduledStart: "2026-10-22T10:00:00+13:00", locked: true},
      {id: "t2", title: "Mow lawn", priority: "LOW", dueDate: "", estimatedMinutes: 45, tags: ["Outdoor"], order: 2, status: "PENDING"},
    ];
    const projects = [{id: "p1", name: "Kitchen\n  reno"}, {id: "p2", name: "Garden"}];
    const prompt = (extra = {}) => buildTaskPrompt({tasks, projects, input: "tile the splashback, step 2 of Kitchen reno", today: "2026-10-22", ...extra});

    it("never shows the model a task's description", () => {
      const withDescription = tasks.map((t) => ({...t, description: "Secret note about the ladder"}));
      assert.doesNotMatch(prompt({tasks: withDescription}), /Secret note|description/);
    });

    it("names today's date and quotes the input", () => {
      assert.match(prompt(), /Today's date is: 2026-10-22\./);
      assert.match(prompt(), /New Input: "tile the splashback, step 2 of Kitchen reno"/);
    });
    it("lists the project names only, one line each, with no ids", () => {
      const p = prompt();
      assert.match(p, /Existing Projects[^\n]*\n\s*\[\s*"Kitchen reno",\s*"Garden"\s*\]/);
      assert.ok(!/"p1"|"p2"/.test(p));
    });
    it("shows only the fields the model may change, and no project fields", () => {
      const p = prompt();
      assert.match(p, /"title": "Demolition"/);
      for (const hidden of ["projectId", "projectOrder", "googleCalendarEventId", "scheduledStart", "locked", "ev9", "PENDING"]) assert.ok(!p.includes(hidden), hidden);
    });
    it("tells the model not to put tasks into projects or return project fields", () => {
      const p = prompt();
      assert.match(p, /Do not put tasks into projects and do not return project fields/);
      assert.doesNotMatch(p, /set projectId|set projectOrder/);
    });
    it("leaves the project suggestion out unless proposals are allowed, so the prompt is as before", () => {
      assert.ok(!prompt().includes("projectProposal"));
      assert.ok(!prompt({proposals: false}).includes("projectProposal"));
    });
    it("asks for a project suggestion when proposals are allowed, including when the input lists the stages itself", () => {
      const text = prompt({proposals: true});
      assert.match(text, /projectProposal/);
      assert.match(text, /ONE goal/);
      assert.match(text, /at least three sequential stages/);
      assert.match(text, /3 to 12 steps/);
      assert.match(text, /unrelated errands/);
      assert.match(text, /Leave projectProposal out when it is\s+not clearly one multi-stage goal/);
      assert.match(text, /input lists the stages itself/);
    });
    it("asks for per-step description only where the input has detail, without citation markers", () => {
      const text = prompt({proposals: true});
      assert.match(text, /description field/);
      assert.match(text, /at most 2000 characters/);
      assert.match(text, /no citation markers/);
      assert.match(text, /Leave description out of a step the input says nothing specific about/);
      assert.ok(!prompt().includes("description field"));
      assert.ok(text.startsWith(prompt().slice(0, 200)));
    });
    it("shows the rank as the place in the queue, 1..n, even when the stored ranks have gaps or run out of order", () => {
      const list = [{id: "x", title: "X", order: 9}, {id: "y", title: "Y", order: 2}, {id: "z", title: "Z", order: 5}];
      const p = prompt({tasks: list});
      const shown = JSON.parse(p.slice(p.indexOf("["), p.indexOf("]\n", p.indexOf("[")) + 1));
      assert.deepEqual(shown.map((t) => [t.id, t.order]), [["y", 1], ["z", 2], ["x", 3]]);
      assert.equal(list[0].order, 9);
    });
    it("copes with no projects", () => {
      assert.match(prompt({projects: []}), /Existing Projects[^\n]*\n\s*\[\]/);
    });
    it("keeps the earlier instructions: ranks, ids for changes and recurrence", () => {
      const p = prompt();
      assert.match(p, /Return ONLY the tasks that are new or that the input changes\./);
      assert.match(p, /Set order on each NEW task to the rank \(from 1\)/);
      assert.match(p, /Existing tasks keep their place/);
      assert.match(p, /return frequency NONE/);
    });
    it("does not modify the tasks or projects it is given", () => {
      const t = structuredClone(tasks);
      const pr = structuredClone(projects);
      prompt();
      assert.deepEqual(tasks, t);
      assert.deepEqual(projects, pr);
    });
  });
});

describe("buildTagPrompt", () => {
  const {buildTagPrompt} = require("../prompts");
  it("shows the model only the title and the tags already in use, one line each", () => {
    const p = buildTagPrompt({title: "Paint\n the fence", knownTags: ["Outdoor", "Outdoor", " Physical ", ""]});
    assert.match(p, /Task title: "Paint the fence"/);
    assert.match(p, /\["Outdoor","Physical"\]/);
  });
  it("works without known tags", () => {
    assert.match(buildTagPrompt({title: "x"}), /Tags already in use[^\n]*\[\]/);
  });
});

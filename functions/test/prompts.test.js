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

    it("never shows the model a task's comments", () => {
      const withComments = tasks.map((t) => ({...t, comments: "Secret note about the ladder"}));
      assert.doesNotMatch(prompt({tasks: withComments}), /Secret note|comments/);
    });

    it("names today's date and quotes the input", () => {
      assert.match(prompt(), /Today's date is: 2026-10-22\./);
      assert.match(prompt(), /New Input: "tile the splashback, step 2 of Kitchen reno"/);
    });
    it("lists the projects with their ids, one line each", () => {
      const p = prompt();
      assert.match(p, /Existing Projects[^\n]*\n\s*\[\s*\{\s*"id": "p1",\s*"name": "Kitchen reno"\s*\},\s*\{\s*"id": "p2",\s*"name": "Garden"/);
    });
    it("shows each task's project and order number, and only the fields the model may change", () => {
      const p = prompt();
      assert.match(p, /"projectId": "p1",\s+"projectOrder": 1/);
      for (const hidden of ["googleCalendarEventId", "scheduledStart", "locked", "ev9", "PENDING"]) assert.ok(!p.includes(hidden), hidden);
    });
    it("tells the model to use listed ids only, and that it cannot create, rename, delete or remove", () => {
      const p = prompt();
      assert.match(p, /set projectId to that project's id, copied exactly from the list/);
      assert.match(p, /Never invent a project or an id/);
      assert.match(p, /set projectOrder to a whole number from 1/);
      assert.match(p, /cannot create, rename or delete projects, or take a task out of one/);
    });
    it("copes with no projects", () => {
      assert.match(prompt({projects: []}), /Existing Projects[^\n]*\n\s*\[\]/);
    });
    it("keeps the earlier instructions: ranks, ids for changes and recurrence", () => {
      const p = prompt();
      assert.match(p, /Return ONLY the tasks that are new or that the input changes\./);
      assert.match(p, /Set order to the rank \(from 1\)/);
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

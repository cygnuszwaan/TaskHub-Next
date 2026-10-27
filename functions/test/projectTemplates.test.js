/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_TEMPLATE_STEPS, stepFromTask, buildTemplateSteps, addTemplate, renameTemplate, templateChanges, startFromTemplate} = require("../projectTemplates");

const task = (id, extra = {}) => ({id, title: `Task ${id}`, priority: "MEDIUM", dueDate: "", estimatedMinutes: 15, tags: [], status: "PENDING", order: 1, ...extra});
let n = 0;
const makeId = () => `id${++n}`;

describe("projectTemplates.js stepFromTask", () => {
  it("keeps the plain fields and drops dates, timers, history and ids", () => {
    const step = stepFromTask(task("a", {
      title: "Strip walls", priority: "HIGH", estimatedMinutes: 90, tags: ["Indoor"], dueDate: "2026-11-01", scheduledStart: "2026-10-30T09:00:00+13:00",
      googleCalendarEventId: "ev", trackedSeconds: 400, timerStartedAt: "x", active: true, jobNumber: 12, addedAt: "z", completedCount: 2, recentSeconds: [1], snoozedUntil: "2026-11-01", recurrence: {frequency: "WEEKLY", interval: 1}, projectId: "p1",
    }));
    assert.deepEqual(step, {title: "Strip walls", priority: "HIGH", estimatedMinutes: 90, tags: ["Indoor"]});
  });
  it("keeps materials as text and cost only, unchecked, description and the order number", () => {
    const step = stepFromTask(task("a", {materials: [{id: "m1", text: "Paint", checked: true, cost: 45.5}, {id: "m2", text: "Tape", checked: false}], description: "Two coats", projectOrder: 2}));
    assert.deepEqual(step.materials, [{text: "Paint", cost: 45.5}, {text: "Tape"}]);
    assert.equal(step.description, "Two coats");
    assert.equal(step.projectOrder, 2);
  });
  it("copies the tags rather than sharing them", () => {
    const t = task("a", {tags: ["Indoor"]});
    stepFromTask(t).tags.push("X");
    assert.deepEqual(t.tags, ["Indoor"]);
  });
});

describe("projectTemplates.js buildTemplateSteps", () => {
  it("takes the project's tasks only, by order number, the unordered last in queue order", () => {
    const tasks = [
      task("u1", {projectId: "p", order: 1}),
      task("x", {order: 2}),
      task("b", {projectId: "p", projectOrder: 2, order: 3}),
      task("q", {projectId: "other", projectOrder: 1, order: 4}),
      task("a", {projectId: "p", projectOrder: 1, order: 5}),
      task("u2", {projectId: "p", order: 6}),
    ];
    assert.deepEqual(buildTemplateSteps(tasks, "p").steps.map((s) => s.title), ["Task a", "Task b", "Task u1", "Task u2"]);
  });
  it("keeps tasks sharing an order number in queue order", () => {
    const tasks = [task("b", {projectId: "p", projectOrder: 1, order: 2}), task("a", {projectId: "p", projectOrder: 1, order: 1})];
    assert.deepEqual(buildTemplateSteps(tasks, "p").steps.map((s) => s.title), ["Task a", "Task b"]);
  });
  it("refuses a project with no tasks", () => {
    assert.match(buildTemplateSteps([task("a")], "p").error, /no tasks/);
    assert.match(buildTemplateSteps([], "p").error, /no tasks/);
    assert.match(buildTemplateSteps(undefined, "p").error, /no tasks/);
  });
  it("refuses a project with more tasks than a template holds", () => {
    const tasks = Array.from({length: MAX_TEMPLATE_STEPS + 1}, (_, i) => task(`t${i}`, {projectId: "p", order: i + 1}));
    assert.match(buildTemplateSteps(tasks, "p").error, /at most 100/);
    assert.equal(buildTemplateSteps(tasks.slice(1), "p").steps.length, MAX_TEMPLATE_STEPS);
  });
  it("does not modify the tasks", () => {
    const tasks = [task("b", {projectId: "p", projectOrder: 2, tags: ["A"]}), task("a", {projectId: "p", projectOrder: 1})];
    const before = JSON.stringify(tasks);
    buildTemplateSteps(tasks, "p");
    assert.equal(JSON.stringify(tasks), before);
  });
});

describe("projectTemplates.js addTemplate and renameTemplate", () => {
  const steps = [{title: "A", priority: "LOW", estimatedMinutes: 5, tags: []}];
  it("adds a template sorted by name", () => {
    const first = addTemplate([], "  Zed   deck ", steps, makeId);
    assert.equal(first.template.name, "Zed deck");
    assert.deepEqual(first.template.steps, steps);
    const second = addTemplate(first.templates, "Alpha", steps, makeId);
    assert.deepEqual(second.templates.map((t) => t.name), ["Alpha", "Zed deck"]);
  });
  it("refuses a taken name ignoring case, and an unusable one", () => {
    const {templates} = addTemplate([], "Deck", steps, makeId);
    assert.match(addTemplate(templates, "deck", steps, makeId).error, /already exists/);
    assert.match(addTemplate(templates, "  ", steps, makeId).error, /template name/);
    assert.match(addTemplate(templates, "x".repeat(101), steps, makeId).error, /at most 100/);
    assert.match(addTemplate(templates, 5, steps, makeId).error, /template name/);
  });
  it("renames, keeping the steps and allowing a change of case of its own name", () => {
    const {templates, template} = addTemplate([], "Deck", steps, makeId);
    const renamed = renameTemplate(templates, template.id, "DECK");
    assert.equal(renamed.template.name, "DECK");
    assert.deepEqual(renamed.template.steps, steps);
  });
  it("refuses renaming to another template's name, and reports an unknown id", () => {
    const a = addTemplate([], "A", steps, makeId);
    const b = addTemplate(a.templates, "B", steps, makeId);
    assert.match(renameTemplate(b.templates, b.template.id, "a").error, /already exists/);
    assert.deepEqual(renameTemplate(b.templates, "nope", "C"), {notFound: true});
    assert.match(renameTemplate(b.templates, b.template.id, "").error, /template name/);
  });
});

describe("projectTemplates.js templateChanges", () => {
  it("makes a change per step in the project, with its order number, materials unchecked and no ids", () => {
    const template = {id: "t", name: "T", steps: [
      {title: "A", priority: "HIGH", estimatedMinutes: 30, tags: ["X"], projectOrder: 1, materials: [{text: "Paint", cost: 9.5}, {text: "Tape"}], description: "note"},
      {title: "B", priority: "LOW", estimatedMinutes: 10, tags: []},
    ]};
    const changes = templateChanges(template, "p9");
    assert.deepEqual(changes[0], {title: "A", priority: "HIGH", estimatedMinutes: 30, tags: ["X"], materials: [{text: "Paint", checked: false, cost: 9.5}, {text: "Tape", checked: false}], description: "note", projectId: "p9", projectOrder: 1});
    assert.deepEqual(changes[1], {title: "B", priority: "LOW", estimatedMinutes: 10, tags: [], projectId: "p9"});
    assert.ok(changes.every((c) => !("id" in c) && !("order" in c)));
  });
});

describe("projectTemplates.js startFromTemplate", () => {
  const template = {id: "t", name: "Deck", steps: [
    {title: "Dig", priority: "HIGH", estimatedMinutes: 60, tags: ["Outdoor"], projectOrder: 1, description: "Mind the pipes"},
    {title: "Frame", priority: "MEDIUM", estimatedMinutes: 120, tags: [], projectOrder: 2, materials: [{text: "Timber", cost: 300}]},
    {title: "Oil", priority: "LOW", estimatedMinutes: 45, tags: []},
  ]};
  const existing = [task("e1", {order: 1, jobNumber: 4})];

  it("adds the project and a task per step at the end, numbered from the counter", () => {
    const r = startFromTemplate(existing, [], template, "Back deck", makeId, "2026-10-25T01:00:00.000Z", 4);
    assert.equal(r.added, 3);
    assert.equal(r.project.name, "Back deck");
    assert.deepEqual(r.projects, [r.project]);
    assert.deepEqual(r.tasks.map((t) => t.title), ["Task e1", "Dig", "Frame", "Oil"]);
    assert.deepEqual(r.tasks.map((t) => t.order), [1, 2, 3, 4]);
    assert.deepEqual(r.tasks.slice(1).map((t) => t.jobNumber), [5, 6, 7]);
    assert.equal(r.jobCounter, 7);
    const [dig, frame, oil] = r.tasks.slice(1);
    assert.ok([dig, frame, oil].every((t) => t.projectId === r.project.id && t.status === "PENDING" && t.addedAt === "2026-10-25T01:00:00.000Z"));
    assert.deepEqual([dig.projectOrder, frame.projectOrder, oil.projectOrder], [1, 2, undefined]);
    assert.equal(dig.description, "Mind the pipes");
    assert.deepEqual(frame.materials.map((m) => [m.text, m.checked, m.cost]), [["Timber", false, 300]]);
    assert.ok(frame.materials[0].id);
    assert.ok([dig, frame, oil].every((t) => !t.scheduledStart && !t.trackedSeconds && !t.dueDate && !t.recurrence));
  });
  it("leaves job numbers off when no counter is given", () => {
    const r = startFromTemplate([], [], template, "Back deck", makeId, "2026-10-25T01:00:00.000Z", undefined);
    assert.ok(r.tasks.every((t) => t.jobNumber === undefined));
    assert.equal("jobCounter" in r, false);
  });
  it("refuses a taken or unusable project name, adding nothing", () => {
    assert.match(startFromTemplate(existing, [{id: "p", name: "Back Deck"}], template, "back deck", makeId, "x", 0).error, /already exists/);
    assert.match(startFromTemplate(existing, [], template, "  ", makeId, "x", 0).error, /name/);
  });
  it("refuses a template without steps", () => {
    assert.match(startFromTemplate(existing, [], {id: "t", name: "T", steps: []}, "X", makeId, "x", 0).error, /no steps/);
    assert.match(startFromTemplate(existing, [], null, "X", makeId, "x", 0).error, /no steps/);
  });
  it("can start the same template twice under different names", () => {
    const a = startFromTemplate([], [], template, "Deck one", makeId, "x", 0);
    const b = startFromTemplate(a.tasks, a.projects, template, "Deck two", makeId, "x", a.jobCounter);
    assert.equal(b.tasks.length, 6);
    assert.deepEqual(b.tasks.map((t) => t.jobNumber), [1, 2, 3, 4, 5, 6]);
    assert.equal(b.projects.length, 2);
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_ROWS, buildExport} = require("../export");

describe("export.js buildExport", () => {
  const now = new Date("2026-10-24T01:02:03.000Z");
  const tasks = [{id: "t1", title: "Mow lawn", materials: [{id: "m1", text: "Fuel", checked: false}], order: 1}];
  const projects = [{id: "p1", name: "Garden"}];
  const settings = {timeZone: "Pacific/Auckland", scheduleDays: 7, lastAutoRunAt: "2026-10-23T07:00:00.000Z"};
  const done = (iso, extra) => ({id: "d1", title: "Old", estimatedMinutes: 10, completedAt: new Date(iso), ...extra});

  it("carries a format name, version and the export time", () => {
    const out = buildExport({tasks, projects, settings, completed: [], now});
    assert.equal(out.format, EXPORT_FORMAT);
    assert.equal(out.version, EXPORT_VERSION);
    assert.equal(out.exportedAt, "2026-10-24T01:02:03.000Z");
  });
  it("includes tasks, projects and settings as given", () => {
    const out = buildExport({tasks, projects, settings, completed: [], now});
    assert.deepEqual(out.tasks, tasks);
    assert.deepEqual(out.projects, projects);
    assert.deepEqual(out.settings, settings);
  });
  it("writes completion times as ISO strings, keeping the order it was given", () => {
    const rows = [done("2026-10-23T01:00:00Z", {id: "d2"}), done("2026-10-20T01:00:00Z", {completedAt: {toDate: () => new Date("2026-10-20T01:00:00Z")}}), done("2026-10-19T01:00:00Z", {completedAt: undefined})];
    const out = buildExport({tasks, projects, settings, completed: rows, now});
    assert.deepEqual(out.completedTasks.map((r) => r.completedAt), ["2026-10-23T01:00:00.000Z", "2026-10-20T01:00:00.000Z", ""]);
    assert.deepEqual(out.completedTasks.map((r) => r.id), ["d2", "d1", "d1"]);
  });
  it("survives a JSON round trip unchanged", () => {
    const out = buildExport({tasks, projects, settings, completed: [done("2026-10-23T01:00:00Z")], now});
    assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
  });
  it("flags a possibly cut-off archive only when it reaches the row limit", () => {
    const row = done("2026-10-23T01:00:00Z");
    assert.equal(buildExport({tasks, projects, settings, completed: Array(EXPORT_MAX_ROWS - 1).fill(row), now}).completedTruncated, false);
    assert.equal(buildExport({tasks, projects, settings, completed: Array(EXPORT_MAX_ROWS).fill(row), now}).completedTruncated, true);
  });
  it("gives empty collections for missing inputs", () => {
    const out = buildExport({now});
    assert.deepEqual([out.tasks, out.projects, out.settings, out.completedTasks, out.completedTruncated], [[], [], {}, [], false]);
  });
  it("does not modify its input", () => {
    const rows = [done("2026-10-23T01:00:00Z")];
    const before = JSON.stringify({tasks, projects, settings, rows});
    buildExport({tasks, projects, settings, completed: rows, now});
    assert.equal(JSON.stringify({tasks, projects, settings, rows}), before);
  });
});

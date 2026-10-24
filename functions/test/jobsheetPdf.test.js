/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildJobSheet} = require("../jobsheet");
const {renderJobSheetPdf} = require("../jobsheetPdf");

const NZ = "Pacific/Auckland";
const now = new Date("2026-10-24T02:00:00Z");
const project = {id: "p1", name: "Whangaparāoa deck 🌿"};
const rows = (n, extra = {}) => Array.from({length: n}, (_, i) => ({title: `Job ${i} Māori 🌿`, priority: "LOW", estimatedMinutes: 30, trackedSeconds: 600 + i, tags: ["Outdoor"], comments: i % 3 === 0 ? "Long comment. ".repeat(40) : undefined, completedAt: new Date(Date.parse("2026-10-12T00:00:00Z") + i * 3 * 3600e3), ...extra}));
const render = (request, r, p = project) => renderJobSheetPdf(buildJobSheet({request, rows: r, project: p, timeZone: NZ, now}));
const pages = (pdf) => Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf.toString("latin1"))[1]);

describe("jobsheetPdf.js", () => {
  it("renders a task sheet as a one-page PDF", async () => {
    const pdf = await render({type: "TASK"}, rows(1));
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.match(pdf.subarray(-16).toString("latin1"), /%%EOF/);
    assert.equal(pages(pdf), 1);
  });
  it("renders a project to date over several pages", async () => {
    assert.ok(pages(await render({type: "PROJECT"}, rows(60))) >= 3);
  });
  it("renders a week sheet, an empty sheet and a task with nothing in it", async () => {
    assert.equal(pages(await render({type: "WEEK", weekStart: "2026-10-12"}, rows(5))), 1);
    assert.equal(pages(await render({type: "PROJECT"}, [])), 1);
    assert.equal(pages(await render({type: "TASK"}, [], null)), 1);
  });
  it("renders contractor information under the title, a long one included, without losing a page's worth of room", async () => {
    const info = "A Builder Ltd\nPh 021 000 000\nbuilder@example.co.nz\n" + "Licensed Building Practitioner. ".repeat(30);
    const render2 = (request, r, contractorInfo) => renderJobSheetPdf(buildJobSheet({request, rows: r, project, timeZone: NZ, now, contractorInfo}));
    assert.equal(pages(await render2({type: "TASK"}, rows(1), info)), 1);
    assert.ok(pages(await render2({type: "PROJECT"}, rows(60), info)) >= 3);
    assert.equal(pages(await render2({type: "PROJECT"}, [], info)), 1);
  });
  it("copes with an unusually long unbroken title and a very long comment", async () => {
    const pdf = await render({type: "PROJECT"}, rows(3, {title: "W".repeat(300), comments: "word ".repeat(2000)}));
    assert.ok(pages(pdf) >= 2);
  });
});

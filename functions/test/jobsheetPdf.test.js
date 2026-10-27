/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {buildJobSheet, withPhotos} = require("../jobsheet");
const {renderJobSheetPdf} = require("../jobsheetPdf");

const NZ = "Pacific/Auckland";
const now = new Date("2026-10-24T02:00:00Z");
const project = {id: "p1", name: "Whangaparāoa deck 🌿"};
const rows = (n, extra = {}) => Array.from({length: n}, (_, i) => ({title: `Job ${i} Māori 🌿`, priority: "LOW", estimatedMinutes: 30, trackedSeconds: 600 + i, tags: ["Outdoor"], description: i % 3 === 0 ? "Long comment. ".repeat(40) : undefined, completedAt: new Date(Date.parse("2026-10-12T00:00:00Z") + i * 3 * 3600e3), ...extra}));
const render = (request, r, p = project, hourlyRate) => renderJobSheetPdf(buildJobSheet({request, rows: r, project: p, timeZone: NZ, now, hourlyRate}));
const pages = (pdf) => Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(pdf.toString("latin1"))[1]);

describe("jobsheetPdf.js", () => {
  it("renders a task sheet as a one-page PDF", async () => {
    const pdf = await render({type: "TASK"}, rows(1));
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.match(pdf.subarray(-16).toString("latin1"), /%%EOF/);
    assert.equal(pages(pdf), 1);
  });
  it("renders a sheet whose entries carry job numbers, with and without", async () => {
    const numbered = rows(4).map((r, i) => (i === 2 ? r : {...r, jobNumber: i + 1}));
    const pdf = await render({type: "PROJECT"}, numbered);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(pages(pdf), 1);
    assert.equal(pages(await render({type: "TASK"}, rows(1, {jobNumber: 123456}))), 1);
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
  it("copes with an unusually long unbroken title and a very long description", async () => {
    const pdf = await render({type: "PROJECT"}, rows(3, {title: "W".repeat(300), description: "word ".repeat(2000)}));
    assert.ok(pages(pdf) >= 2);
  });
  describe("invoice figures", () => {
    const costed = (n) => rows(n, {materials: [{id: "a", text: "Screws Māori", checked: true, cost: 12.5}, {id: "b", text: "Glue", checked: true}]});
    it("renders task, week and project sheets with a rate, with costs alone, and with both", async () => {
      for (const [request, r, rate] of [[{type: "TASK"}, rows(1), 85], [{type: "TASK"}, costed(1)], [{type: "WEEK", weekStart: "2026-10-12"}, costed(5), 85], [{type: "PROJECT"}, costed(4), 85]]) {
        const pdf = await render(request, r, project, rate);
        assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
        assert.equal(pages(pdf), 1);
      }
    });
    it("renders travel: distance on each entry, the travel rate and the totals, billed or not", async () => {
      const travelling = (n) => rows(n, {travelKm: 12.5});
      for (const [request, r, rate, travelRate] of [[{type: "TASK"}, travelling(1), 85, 1.2], [{type: "TASK"}, travelling(1), null, 1.2], [{type: "WEEK", weekStart: "2026-10-12"}, travelling(5), 85, 1.2], [{type: "PROJECT"}, travelling(4), null, 1.2], [{type: "PROJECT"}, travelling(4), 85, null]]) {
        const sheet = buildJobSheet({request, rows: r, project, timeZone: NZ, now, hourlyRate: rate, travelRate});
        const pdf = await renderJobSheetPdf(sheet);
        assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
        assert.equal(pages(pdf), 1);
      }
      assert.ok(pages(await renderJobSheetPdf(buildJobSheet({request: {type: "PROJECT"}, rows: travelling(60), project, timeZone: NZ, now, hourlyRate: 85, travelRate: 1.2}))) >= 3);
    });
    it("renders a long invoice project over several pages and an empty one", async () => {
      assert.ok(pages(await render({type: "PROJECT"}, costed(60), project, 85)) >= 3);
      assert.equal(pages(await render({type: "PROJECT"}, [], project, 85)), 1);
    });
    it("renders contractor information with a rate and long description together", async () => {
      const sheet = buildJobSheet({request: {type: "PROJECT"}, rows: costed(10), project, timeZone: NZ, now, contractorInfo: "A Builder\nPh 021 000 000\nGST 12-345-678", hourlyRate: 85});
      assert.ok(pages(await renderJobSheetPdf(sheet)) >= 1);
    });
  });

  describe("photos", () => {
    // A tiny but valid baseline JPEG (64 x 48), which the PDF library reads
    const JPEG = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAAwAEABAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
    const sheetFor = (n, omitted = 0, data = JPEG) => {
      const s = buildJobSheet({request: {type: "PROJECT"}, rows: rows(2).map((r, i) => ({...r, archiveId: `a${i}`})), project, timeZone: NZ, now});
      const byId = new Map([["a0", Array.from({length: n}, (_, i) => ({id: `p${i}`, data}))]]);
      return withPhotos(s, byId, omitted);
    };
    const imageCount = (pdf) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) || []).length;

    it("draws each photo as an image in the PDF", async () => {
      const none = await renderJobSheetPdf(sheetFor(0));
      const three = await renderJobSheetPdf(sheetFor(3));
      assert.equal(imageCount(none), 0);
      assert.ok(imageCount(three) >= 1);
      assert.equal(pages(three), 1);
    });
    it("skips a picture the PDF library cannot read instead of failing", async () => {
      const pdf = await renderJobSheetPdf(sheetFor(2, 0, Buffer.from("not a jpeg at all").toString("base64")));
      assert.equal(imageCount(pdf), 0);
      assert.equal(pages(pdf), 1);
    });
    it("moves photo rows to a new page rather than running off the bottom", async () => {
      const s = sheetFor(3);
      const many = {...s, sections: s.sections.map((sec) => ({...sec, entries: sec.entries.map((e) => ({...e, photos: Array.from({length: 12}, () => JPEG)}))}))};
      assert.ok(pages(await renderJobSheetPdf(many)) >= 2);
    });
    it("notes the photos left out by the cap", async () => {
      const pdf = await renderJobSheetPdf(sheetFor(1, 12));
      assert.ok(pdf.length > 0);
      assert.equal(pages(pdf), 1);
    });
  });
  it("renders the client's details, with or without contractor information", async () => {
    const client = {name: "Jo Smith", location: {name: "1 Beach Rd, Whangaparāoa"}, phone: "021 000 000", email: "jo@example.co.nz"};
    const draw = (request, r, contractorInfo) => renderJobSheetPdf(buildJobSheet({request, rows: r, project, client, timeZone: NZ, now, contractorInfo}));
    for (const contractorInfo of [undefined, "A Builder Ltd\nPh 021 111 111"]) {
      const pdf = await draw({type: "PROJECT"}, rows(3), contractorInfo);
      assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
      assert.equal(pages(pdf), 1);
    }
    assert.equal(pages(await draw({type: "TASK"}, rows(1))), 1);
  });
});

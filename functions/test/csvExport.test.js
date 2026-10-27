/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {COLUMNS, BOM, isRealDate, parseCsvRequest, csvCell, textCell, buildCompletedCsv} = require("../csvExport");

const ZONE = "Pacific/Auckland";
const row = (extra = {}) => ({title: "Fit tap", completedAt: "2026-10-20T01:00:00.000Z", trackedSeconds: 5400, estimatedMinutes: 60, ...extra});
const parse = (csv) => csv.replace(BOM, "").trimEnd().split("\r\n");

describe("csvExport.js parseCsvRequest", () => {
  it("accepts real dates, either side empty or missing", () => {
    assert.deepEqual(parseCsvRequest({from: "2026-10-01", to: "2026-10-31"}), {from: "2026-10-01", to: "2026-10-31"});
    assert.deepEqual(parseCsvRequest({from: "2026-10-01"}), {from: "2026-10-01", to: ""});
    assert.deepEqual(parseCsvRequest({from: "", to: null}), {from: "", to: ""});
    assert.deepEqual(parseCsvRequest(undefined), {from: "", to: ""});
    assert.deepEqual(parseCsvRequest({from: "2026-10-05", to: "2026-10-05"}), {from: "2026-10-05", to: "2026-10-05"});
  });
  it("refuses an unusable date or an upside-down range", () => {
    assert.match(parseCsvRequest({from: "2026-02-30"}).error, /from must be a date/);
    assert.match(parseCsvRequest({to: "10/12/2026"}).error, /to must be a date/);
    assert.match(parseCsvRequest({from: 20261001}).error, /from/);
    assert.match(parseCsvRequest({from: "2026-10-31", to: "2026-10-01"}).error, /not be after/);
  });
  it("isRealDate rejects impossible dates", () => {
    assert.equal(isRealDate("2024-02-29"), true);
    assert.equal(isRealDate("2026-02-29"), false);
    assert.equal(isRealDate("2026-13-01"), false);
    assert.equal(isRealDate("2026-1-1"), false);
  });
});

describe("csvExport.js csvCell and textCell", () => {
  it("quotes cells with commas, quotes and line breaks, doubling quotes", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a,b"), "\"a,b\"");
    assert.equal(csvCell("say \"hi\""), "\"say \"\"hi\"\"\"");
    assert.equal(csvCell("one\ntwo"), "\"one\ntwo\"");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(0), "0");
  });
  it("defuses text a spreadsheet would run as a formula", () => {
    assert.equal(textCell("=SUM(A1)"), "'=SUM(A1)");
    for (const c of ["+1", "-2", "@x", "\tx"]) assert.equal(textCell(c), `'${c}`);
    assert.equal(textCell("Fit tap"), "Fit tap");
    assert.equal(textCell(null), "");
  });
});

describe("csvExport.js buildCompletedCsv", () => {
  it("starts with a BOM and the header, and ends with a line break", () => {
    const csv = buildCompletedCsv({rows: [], projects: [], clients: [], timeZone: ZONE});
    assert.equal(csv, BOM + COLUMNS.join(",") + "\r\n");
    assert.deepEqual(COLUMNS, ["Job number", "Task", "Project", "Client", "Completed", "Tracked hours", "Estimated hours", "Materials", "Materials cost", "Travel km", "Travel cost", "Comments"]);
  });
  it("writes one line per task: job number, names, local date, hours, materials and cost", () => {
    const rows = [row({jobNumber: 123, projectId: "p1", materials: [{text: "Tap", cost: 45.5}, {text: "Washer", cost: 2}, {text: "Tape"}]})];
    const lines = parse(buildCompletedCsv({rows, projects: [{id: "p1", name: "Kitchen reno", clientId: "c1"}], clients: [{id: "c1", name: "Jo Smith"}], timeZone: ZONE}));
    assert.equal(lines[1], "123,Fit tap,Kitchen reno,Jo Smith,2026-10-20,1.50,1.00,Tap; Washer; Tape,47.50,,,");
  });
  it("leaves cells empty for no job number, project, client, tracked time, materials or costs", () => {
    const lines = parse(buildCompletedCsv({rows: [row({trackedSeconds: 0, estimatedMinutes: 30, materials: [{text: "Tape"}]})], projects: [], clients: [], timeZone: ZONE}));
    assert.equal(lines[1], ",Fit tap,,,2026-10-20,,0.50,Tape,,,,");
    const bare = parse(buildCompletedCsv({rows: [{title: "X", completedAt: "2026-10-20T01:00:00Z"}], projects: [], clients: [], timeZone: ZONE}));
    assert.equal(bare[1], ",X,,,2026-10-20,,,,,,,");
  });
  it("shows a deleted project and a project with no client as empty names", () => {
    const rows = [row({projectId: "gone"}), row({projectId: "p1", title: "B"})];
    const lines = parse(buildCompletedCsv({rows, projects: [{id: "p1", name: "Solo"}], clients: [], timeZone: ZONE}));
    assert.ok(lines.includes(",Fit tap,,,2026-10-20,1.50,1.00,,,,,"));
    assert.ok(lines.includes(",B,Solo,,2026-10-20,1.50,1.00,,,,,"));
  });
  it("dates a completion on the owner's clock, not UTC", () => {
    const lines = parse(buildCompletedCsv({rows: [row({completedAt: "2026-10-19T23:30:00.000Z"})], projects: [], clients: [], timeZone: ZONE}));
    assert.match(lines[1], /,2026-10-20,/);
    const utc = parse(buildCompletedCsv({rows: [row({completedAt: "2026-10-19T23:30:00.000Z"})], projects: [], clients: [], timeZone: "UTC"}));
    assert.match(utc[1], /,2026-10-19,/);
  });
  it("lists oldest first, ties by job number, accepting Timestamps and Dates", () => {
    const rows = [
      row({title: "C", completedAt: {toDate: () => new Date("2026-10-22T01:00:00Z")}}),
      row({title: "B2", jobNumber: 9, completedAt: new Date("2026-10-21T01:00:00Z")}),
      row({title: "B1", jobNumber: 4, completedAt: "2026-10-21T01:00:00Z"}),
      row({title: "A", completedAt: "2026-10-20T01:00:00Z"}),
    ];
    const lines = parse(buildCompletedCsv({rows, projects: [], clients: [], timeZone: ZONE}));
    assert.deepEqual(lines.slice(1).map((l) => l.split(",")[1]), ["A", "B1", "B2", "C"]);
  });
  it("quotes titles with commas or quotes and defuses formulas", () => {
    const lines = parse(buildCompletedCsv({rows: [row({title: "Tile, grout \"all\"", materials: [{text: "=1+1"}]})], projects: [], clients: [], timeZone: ZONE}));
    assert.equal(lines[1], ",\"Tile, grout \"\"all\"\"\",,,2026-10-20,1.50,1.00,'=1+1,,,,");
  });
  it("adds costs in whole cents so they add up exactly", () => {
    const lines = parse(buildCompletedCsv({rows: [row({materials: [{text: "a", cost: 0.1}, {text: "b", cost: 0.2}]})], projects: [], clients: [], timeZone: ZONE}));
    assert.ok(lines[1].endsWith(",a; b,0.30,,,"));
  });
  it("writes the travel distance, and its cost at the travel rate when there is one", () => {
    const rows = [row({travelKm: 12.5}), row({title: "B", travelKm: 40})];
    const withRate = parse(buildCompletedCsv({rows, projects: [], clients: [], timeZone: ZONE, travelRate: 1.2}));
    assert.ok(withRate[1].endsWith(",,,12.5,15.00,"));
    assert.ok(withRate[2].endsWith(",,,40,48.00,"));
    const noRate = parse(buildCompletedCsv({rows, projects: [], clients: [], timeZone: ZONE, travelRate: null}));
    assert.ok(noRate[1].endsWith(",,,12.5,,"));
    const none = parse(buildCompletedCsv({rows: [row({})], projects: [], clients: [], timeZone: ZONE, travelRate: 1.2}));
    assert.ok(none[1].endsWith(",,,,,"));
  });
  describe("comments", () => {
    const at = (iso) => Date.parse(iso);
    const comments = [{id: "comment-0001", at: at("2026-10-19T23:30:00Z"), text: "Rang the client"}, {id: "comment-0002", at: at("2026-10-20T01:05:00Z"), text: "Needs a second\ncoat,  \"soon\""}];
    it("writes them in the last column, one line each, with the date and time on the owner's clock", () => {
      const lines = buildCompletedCsv({rows: [row({comments})], projects: [], clients: [], timeZone: ZONE}).replace(BOM, "").trimEnd().split("\r\n");
      assert.equal(lines[1], ",Fit tap,,,2026-10-20,1.50,1.00,,,,,\"2026-10-20 12:30 Rang the client\n2026-10-20 14:05 Needs a second coat, \"\"soon\"\"\"");
      const utc = buildCompletedCsv({rows: [row({comments})], projects: [], clients: [], timeZone: "UTC"});
      assert.match(utc, /"2026-10-19 23:30 Rang the client\n2026-10-20 01:05 Needs/);
    });
    it("leaves the cell empty for none, and for a comments value that is not a list", () => {
      for (const extra of [{}, {comments: []}, {comments: "An old text note"}, {comments: [{id: "bad"}]}]) {
        const lines = parse(buildCompletedCsv({rows: [row(extra)], projects: [], clients: [], timeZone: ZONE}));
        assert.ok(lines[1].endsWith(",,,,,"), JSON.stringify(extra));
      }
    });
    it("starts every line with the date, so a comment that begins with = is not a formula to a spreadsheet", () => {
      const csv = buildCompletedCsv({rows: [row({comments: [{id: "comment-0001", at: at("2026-10-20T01:05:00Z"), text: "=1+1"}]})], projects: [], clients: [], timeZone: ZONE});
      assert.ok(csv.includes(",2026-10-20 14:05 =1+1"));
      assert.ok(!csv.includes("'2026"));
    });
  });
  it("does not modify its input", () => {
    const rows = [row({materials: [{text: "a", cost: 1}]}), row({title: "Z", completedAt: "2026-10-01T00:00:00Z"})];
    const before = JSON.stringify(rows);
    buildCompletedCsv({rows, projects: [], clients: [], timeZone: ZONE});
    assert.equal(JSON.stringify(rows), before);
  });
});

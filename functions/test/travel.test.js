/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_TRAVEL_KM, normalizeTravelKm} = require("../travel");
const {normalizeTravelRate, MAX_TRAVEL_RATE} = require("../money");
const {mergeSettings, applySettingsUpdate, DEFAULTS} = require("../settings");
const {applyDirectUpdate, completeInList, mergeTaskChanges, manualTaskChange} = require("../tasks");
const {applyCompletedEdit} = require("../completedEdit");
const {reopenTask} = require("../reopen");
const {buildTemplates} = require("../templates");
const {stepFromTask, templateChanges, startFromTemplate} = require("../projectTemplates");

let n = 0;
const makeId = () => `new${++n}`;
const base = () => ({id: "t1", title: "Fit tap", priority: "MEDIUM", dueDate: "", estimatedMinutes: 60, tags: [], status: "PENDING", order: 1});
const withKm = () => ({...base(), travelKm: 12.5});

describe("travel.js normalizeTravelKm", () => {
  it("keeps a distance rounded to one decimal, from text too", () => {
    assert.equal(normalizeTravelKm(12.5), 12.5);
    assert.equal(normalizeTravelKm(12.34), 12.3);
    assert.equal(normalizeTravelKm(" 7.25 "), 7.3);
    assert.equal(normalizeTravelKm("40"), 40);
    assert.equal(normalizeTravelKm(MAX_TRAVEL_KM), MAX_TRAVEL_KM);
  });
  it("means none for null, blank text, 0 and a distance that rounds to 0", () => {
    for (const v of [null, "", "   ", 0, "0", 0.04]) assert.equal(normalizeTravelKm(v), null, String(v));
  });
  it("is unusable for anything else", () => {
    for (const v of [undefined, -1, "-3", "abc", "1e3", NaN, Infinity, {}, [], true, MAX_TRAVEL_KM + 1, "10000.1"]) assert.equal(normalizeTravelKm(v), undefined, String(v));
  });
});

describe("travel rate setting", () => {
  it("defaults to the IRD's 2025-26 Tier 1 petrol rate of $1.20 per km", () => {
    assert.equal(DEFAULTS.jobSheet.travelRate, 1.2);
    assert.equal(mergeSettings(undefined).jobSheet.travelRate, 1.2);
  });
  it("normalizeTravelRate takes 0.01 to 100 and treats empty and 0 as none", () => {
    assert.equal(normalizeTravelRate("1.256"), 1.26);
    assert.equal(normalizeTravelRate(MAX_TRAVEL_RATE), MAX_TRAVEL_RATE);
    for (const v of [null, "", 0]) assert.equal(normalizeTravelRate(v), null);
    for (const v of ["abc", -1, 101, {}, true]) assert.equal(normalizeTravelRate(v), undefined);
  });
  it("is saved, cleared to none and kept as none, and an unusable stored value falls back to the default", () => {
    const base0 = mergeSettings(undefined);
    assert.equal(applySettingsUpdate(base0, {jobSheet: {travelRate: " 1.35 "}}).settings.jobSheet.travelRate, 1.35);
    const cleared = applySettingsUpdate(base0, {jobSheet: {travelRate: ""}}).settings;
    assert.equal(cleared.jobSheet.travelRate, null);
    assert.equal(mergeSettings(cleared).jobSheet.travelRate, null);
    assert.equal(mergeSettings({jobSheet: {travelRate: "abc"}}).jobSheet.travelRate, 1.2);
    assert.match(applySettingsUpdate(base0, {gapMinutes: 5, jobSheet: {travelRate: 500}}).error, /travelRate/);
  });
  it("is left alone by an update that sends other job sheet fields", () => {
    const s = applySettingsUpdate(mergeSettings(undefined), {jobSheet: {travelRate: 1.5}}).settings;
    const t = applySettingsUpdate(s, {jobSheet: {contractorInfo: "A", hourlyRate: 85}}).settings;
    assert.equal(t.jobSheet.travelRate, 1.5);
    assert.equal(t.jobSheet.hourlyRate, 85);
  });
});

describe("travelKm on a task", () => {
  it("is set, changed and removed by a direct update", () => {
    assert.equal(applyDirectUpdate(base(), {travelKm: 12.34}).travelKm, 12.3);
    assert.equal(applyDirectUpdate(base(), {travelKm: "8"}).travelKm, 8);
    for (const v of [null, "", 0]) assert.equal("travelKm" in applyDirectUpdate(withKm(), {travelKm: v}), false, String(v));
  });
  it("is left as it was by an unusable value or when not sent", () => {
    assert.equal(applyDirectUpdate(withKm(), {travelKm: "far"}).travelKm, 12.5);
    assert.equal(applyDirectUpdate(withKm(), {title: "Fit tap again"}).travelKm, 12.5);
  });
  it("is set on a new task only by a manual entry that is allowed to", () => {
    const change = manualTaskChange({title: "Fit tap", travelKm: 30});
    assert.equal(change.travelKm, 30);
    assert.equal(mergeTaskChanges([], [change], makeId, [], {travelKm: true}).tasks[0].travelKm, 30);
    assert.equal("travelKm" in mergeTaskChanges([], [change], makeId).tasks[0], false);
    assert.equal("travelKm" in mergeTaskChanges([], [{title: "x", travelKm: -4}], makeId, [], {travelKm: true}).tasks[0], false);
  });
  it("is never changed on an existing task by a merge", () => {
    const existing = [withKm()];
    const merged = mergeTaskChanges(existing, [{id: "t1", title: "Fit tap", travelKm: 99}], makeId, [], {travelKm: true});
    assert.equal(merged.tasks[0].travelKm, 12.5);
  });
  it("goes to the next occurrence of a repeating task", () => {
    const task = {...withKm(), dueDate: "2026-10-20", recurrence: {frequency: "WEEKLY", interval: 1}};
    const done = completeInList([task], "t1", "2026-10-22", makeId);
    assert.equal(done.spawned.travelKm, 12.5);
    assert.equal("travelKm" in completeInList([{...task, travelKm: undefined}], "t1", "2026-10-22", makeId).spawned, false);
  });
});

describe("travelKm on a completed task", () => {
  const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, travelKm: 12.5, completedAt: new Date("2026-10-20T01:00:00Z")};
  const opts = {projectIds: [], timeZone: "Pacific/Auckland", now: new Date("2026-10-24T02:00:00Z")};
  it("is corrected, rounded to one decimal", () => {
    assert.deepEqual(applyCompletedEdit(row, {travelKm: "20.26"}, opts), {set: {travelKm: 20.3}, remove: []});
  });
  it("is removed by null, empty or 0 when the row has one, else there is nothing to change", () => {
    for (const v of [null, "", 0]) assert.deepEqual(applyCompletedEdit(row, {travelKm: v}, opts), {set: {}, remove: ["travelKm"]}, String(v));
    const bare = {...row};
    delete bare.travelKm;
    assert.deepEqual(applyCompletedEdit(bare, {travelKm: null}, opts), {error: "Nothing to change"});
  });
  it("rejects an unusable distance", () => {
    for (const v of [-1, "abc", 20000, {}, true]) assert.match(applyCompletedEdit(row, {travelKm: v}, opts).error, /Travel/, JSON.stringify(v));
  });
  it("comes back with a reopened task", () => {
    assert.equal(reopenTask([], {...row, id: "x"}, {projectIds: [], makeId}).task.travelKm, 12.5);
  });
  it("is carried by a template made from completed tasks", () => {
    assert.equal(buildTemplates([row])[0].travelKm, 12.5);
    const bare = {...row};
    delete bare.travelKm;
    assert.equal("travelKm" in buildTemplates([bare])[0], false);
  });
});

describe("travelKm in project templates", () => {
  it("is saved as a step and given to the tasks a template starts", () => {
    const step = stepFromTask(withKm());
    assert.equal(step.travelKm, 12.5);
    assert.equal("travelKm" in stepFromTask(base()), false);
    assert.equal(templateChanges({steps: [step]}, "p1")[0].travelKm, 12.5);
    const started = startFromTemplate([], [], {id: "tp", name: "T", steps: [step]}, "Bathroom", makeId, "2026-10-25T00:00:00.000Z", 0);
    assert.equal(started.tasks[0].travelKm, 12.5);
  });
});

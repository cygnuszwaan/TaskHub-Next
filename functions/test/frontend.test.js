/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// public/index.html has no build step, so its pure helpers sit between two marker comments. Load that block
// the way the page does: as plain script text with its own top-level state.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
assert.ok(start > 0 && end > start, "pure-helpers markers not found in public/index.html");
const block = html.slice(start, end);

function load() {
  return new Function(`${block}
    return {DEFAULT_TIME_ZONE, makeFormatters, setTimeZone, getZone: () => appTimeZone, daysUntilDue, formatInstant, formatSchedule, geocodeUrl, placeFromGeocode, placesFromGeocode, settingsPayload, projectFields, projectLabel, projectTaskCounts, deleteProjectPrompt};`)();
}

describe("public/index.html helpers", () => {
  describe("layout", () => {
    const at = (needle, from = 0) => {
      const i = html.indexOf(needle, from);
      assert.ok(i > 0, `${needle} not found`);
      return i;
    };
    it("puts the Settings card last, with Save settings and Update now side by side", () => {
      const settings = at(`id="settingsDetails"`);
      assert.ok(settings > at(`id="taskInput"`) && settings > at(`id="queueDetails"`) && settings > at(`id="projectsDetails"`) && settings > at(`id="completedDetails"`));
      assert.ok(settings < at(`id="editModal"`));
      const save = at(`id="saveSettingsBtn"`);
      const row = html.slice(html.lastIndexOf(`<div class="action-row"`, save), at(`id="settingsStatus"`));
      assert.match(row, /id="saveSettingsBtn"/);
      assert.match(row, /id="schedBtn"[^>]*onclick="scheduleWeek\(\)"[^>]*>[^<]*Update now/);
      assert.ok(at(`id="schedBtn"`) < at("</details>", save), "Update now is inside the Settings details");
    });
    it("keeps the schedule status outside the collapsible Settings details so it stays visible", () => {
      const closeSettings = at("</details>", at(`id="saveSettingsBtn"`));
      assert.ok(at(`id="scheduleStatus"`) > closeSettings);
      assert.ok(at(`id="scheduleStatus"`) < at(`id="editModal"`));
    });
    it("puts a collapsible Projects card between Organized Queue and Recently Completed", () => {
      const p = at(`<details id="projectsDetails">`);
      const close = at("</details>", p);
      assert.ok(at(`id="queueDetails"`) < p && close < at(`id="completedDetails"`));
      for (const id of ["newProjectName", "addProjectBtn", "projectList", "projectsStatus"]) assert.ok(at(`id="${id}"`, p) < close, id);
    });
    it("adds a Project select and an Order number field, disabled until a project is chosen, to the edit modal", () => {
      const modal = at(`id="editModal"`);
      assert.ok(at(`id="editProject"`, modal) < at(`id="editProjectOrder"`, modal));
      assert.match(html.slice(at(`id="editProjectOrder"`, modal), at(">", at(`id="editProjectOrder"`, modal))), /disabled/);
    });
    it("no longer offers Plan My Week anywhere on the page", () => {
      assert.doesNotMatch(html, /Plan My Week/);
    });
    it("makes Organized Queue collapsible (open by default) around the filter bar and list", () => {
      const q = at(`<details id="queueDetails" open>`);
      const close = at("</details>", q);
      assert.ok(q < at(`id="tagFilterBar"`, q) && at(`id="tagFilterBar"`, q) < at(`id="taskList"`, q));
      assert.ok(at(`id="taskList"`, q) < close);
      assert.ok(close < at(`id="completedDetails"`));
    });
  });

  it("shows the page's script without leftover NZ-only formatters", () => {
    assert.doesNotMatch(html, /nzKeyFmt|nzDayFmt|nzTimeFmt|NZ_TIME_ZONE/);
  });

  describe("time zone", () => {
    it("starts in Pacific/Auckland and switches zone", () => {
      const h = load();
      assert.equal(h.getZone(), "Pacific/Auckland");
      const t = new Date("2026-10-22T00:00:00Z");
      assert.match(h.formatInstant(t), /Thu.*22 Oct.*1:00/i); // 13:00 NZDT
      h.setTimeZone("America/Los_Angeles");
      assert.equal(h.getZone(), "America/Los_Angeles");
      assert.match(h.formatInstant(t), /Wed.*21 Oct.*5:00/i); // 17:00 PDT the day before
    });
    it("ignores an unknown, empty or missing zone", () => {
      const h = load();
      h.setTimeZone("Nowhere/Land");
      h.setTimeZone("");
      h.setTimeZone(undefined);
      h.setTimeZone(42);
      assert.equal(h.getZone(), "Pacific/Auckland");
      assert.match(h.formatInstant(new Date("2026-10-22T00:00:00Z")), /1:00/);
    });
  });

  describe("daysUntilDue", () => {
    const now = new Date("2026-10-22T12:00:00Z"); // 01:00 on 23 Oct in Auckland, 05:00 on 22 Oct in Los Angeles
    it("counts from today in the configured zone", () => {
      const h = load();
      assert.equal(h.daysUntilDue({dueDate: "2026-10-23"}, now), 0);
      assert.equal(h.daysUntilDue({dueDate: "2026-10-22"}, now), -1);
      h.setTimeZone("America/Los_Angeles");
      assert.equal(h.daysUntilDue({dueDate: "2026-10-22"}, now), 0);
      assert.equal(h.daysUntilDue({dueDate: "2026-10-25"}, now), 3);
    });
    it("is null without a valid due date", () => {
      const h = load();
      for (const dueDate of [undefined, "", "soon", "2026-13-45x"]) assert.equal(h.daysUntilDue({dueDate}, now), null, String(dueDate));
    });
  });

  describe("formatSchedule", () => {
    it("formats a timed slot in the configured zone, whatever offset the value carries", () => {
      const h = load();
      assert.match(h.formatSchedule("2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"), /Thu.*22 Oct.*9:00.*9:30/i);
      h.setTimeZone("Australia/Sydney"); // +11:00 in October
      assert.match(h.formatSchedule("2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"), /7:00.*7:30/i);
      h.setTimeZone("America/Los_Angeles");
      assert.match(h.formatSchedule("2026-10-22T09:00:00+13:00", "2026-10-22T09:30:00+13:00"), /Wed.*21 Oct.*1:00.*1:30/i);
    });
    it("shows both days for a slot that crosses midnight in the zone", () => {
      const h = load();
      const text = h.formatSchedule("2026-10-22T23:30:00+13:00", "2026-10-23T00:30:00+13:00");
      assert.match(text, /22 Oct.*11:30.*23 Oct.*12:30/i);
    });
    it("shows a lone start when the end is missing or not after it", () => {
      const h = load();
      assert.match(h.formatSchedule("2026-10-22T09:00:00+13:00", ""), /22 Oct.*9:00/i);
      assert.doesNotMatch(h.formatSchedule("2026-10-22T09:00:00+13:00", "2026-10-22T08:00:00+13:00"), /–/);
    });
    it("formats all-day slots as calendar dates, unaffected by the zone", () => {
      const h = load();
      const one = h.formatSchedule("2026-10-22", "2026-10-23");
      assert.match(one, /Thu.*22 Oct.*all day/i);
      assert.match(h.formatSchedule("2026-10-22", "2026-10-25"), /22 Oct.*–.*Sat.*24 Oct.*all day/i);
      h.setTimeZone("Pacific/Pago_Pago");
      assert.equal(h.formatSchedule("2026-10-22", "2026-10-23"), one);
    });
    it("returns an empty string without a usable start", () => {
      const h = load();
      for (const start of [undefined, null, "", "junk", "2026-99-99T00:00:00Z"]) assert.equal(h.formatSchedule(start, ""), "", String(start));
    });
  });

  describe("geocoding", () => {
    it("builds the Open-Meteo search URL with an encoded, trimmed query", () => {
      const h = load();
      assert.equal(h.geocodeUrl("  Whangaparāoa "), "https://geocoding-api.open-meteo.com/v1/search?name=Whangapar%C4%81oa&count=5&language=en&format=json");
      assert.match(h.geocodeUrl("Los Angeles & co"), /name=Los%20Angeles%20%26%20co&/);
    });
    it("turns a result into location fields and a time zone", () => {
      const h = load();
      assert.deepEqual(h.placeFromGeocode({name: "Whangaparaoa", admin1: "Auckland", country: "New Zealand", latitude: -36.63, longitude: 174.75, timezone: "Pacific/Auckland", id: 1}),
          {name: "Whangaparaoa, Auckland, New Zealand", latitude: -36.63, longitude: 174.75, timeZone: "Pacific/Auckland"});
    });
    it("drops repeated and missing name parts", () => {
      const h = load();
      assert.equal(h.placeFromGeocode({name: "Singapore", admin1: "Singapore", country: "Singapore", latitude: 1.29, longitude: 103.85, timezone: "Asia/Singapore"}).name, "Singapore");
      assert.equal(h.placeFromGeocode({name: "Reykjavik", country: "Iceland", latitude: 64.1, longitude: -21.9, timezone: "Atlantic/Reykjavik"}).name, "Reykjavik, Iceland");
      assert.equal(h.placeFromGeocode({name: "Oslo", latitude: 59.9, longitude: 10.7, timezone: "Europe/Oslo"}).name, "Oslo");
    });
    it("keeps the name within 100 characters", () => {
      const h = load();
      const r = h.placeFromGeocode({name: "x".repeat(150), latitude: 1, longitude: 2, timezone: "UTC"});
      assert.equal(r.name.length, 100);
    });
    it("rejects results the settings could not use", () => {
      const h = load();
      const ok = {name: "A", latitude: 1, longitude: 2, timezone: "UTC"};
      for (const bad of [null, undefined, "x", {...ok, name: ""}, {...ok, name: "  "}, {...ok, latitude: "1"}, {...ok, longitude: NaN}, {...ok, timezone: ""}, {...ok, timezone: undefined}]) {
        assert.equal(h.placeFromGeocode(bad), null, JSON.stringify(bad));
      }
    });
    it("maps a response, keeping only usable results, and copes with no results", () => {
      const h = load();
      const ok = {name: "A", latitude: 1, longitude: 2, timezone: "UTC"};
      assert.equal(h.placesFromGeocode({results: [ok, {name: "B"}, ok]}).length, 2);
      for (const none of [{}, {results: null}, null, undefined, "x", {generationtime_ms: 1}]) assert.deepEqual(h.placesFromGeocode(none), []);
    });
    it("yields time zones the server accepts", () => {
      const h = load();
      const {mergeSettings} = require("../settings");
      const place = h.placeFromGeocode({name: "Buenos Aires", country: "Argentina", latitude: -34.6, longitude: -58.4, timezone: "America/Argentina/Buenos_Aires"});
      assert.equal(mergeSettings({timeZone: place.timeZone}).timeZone, "America/Argentina/Buenos_Aires");
    });
  });

  describe("settingsPayload", () => {
    const form = {location: {name: "Oslo", latitude: 59.9, longitude: 10.7, extra: "dropped"}, timeZone: "Europe/Oslo", scheduleDays: "14", enabled: 1, frequency: "INTERVAL", time: "06:30", intervalMinutes: "30"};
    it("builds the updateSettings body from the form", () => {
      const h = load();
      assert.deepEqual(h.settingsPayload(form), {
        location: {name: "Oslo", latitude: 59.9, longitude: 10.7},
        timeZone: "Europe/Oslo",
        scheduleDays: 14,
        schedule: {enabled: true, frequency: "INTERVAL", time: "06:30", intervalMinutes: 30},
      });
    });
    it("is accepted by the server-side validation", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      const r = applySettingsUpdate(mergeSettings(undefined), h.settingsPayload(form));
      assert.equal(r.error, undefined);
      assert.equal(r.settings.timeZone, "Europe/Oslo");
      assert.equal(r.settings.schedule.intervalMinutes, 30);
      assert.equal(r.settings.scheduleDays, 14);
      assert.equal(r.settings.location.name, "Oslo");
    });
    it("leaves an empty or out-of-range day count for the server to reject", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      for (const bad of ["", "0", "29", "1.5"]) {
        assert.match(applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, scheduleDays: bad})).error, /scheduleDays/);
      }
    });
    it("leaves an empty time for the server to reject", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      const r = applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, time: ""}));
      assert.match(r.error, /schedule.time/);
    });
  });
  describe("project helpers", () => {
    const projects = [{id: "p1", name: "Kitchen reno"}, {id: "p2", name: "Garden"}];

    it("projectFields: no project means neither field", () => {
      const {projectFields: f} = load();
      assert.deepEqual(f("", "3"), {projectId: null, projectOrder: null});
      assert.deepEqual(f(null, 5), {projectId: null, projectOrder: null});
    });
    it("projectFields: an empty or unusable order means unordered", () => {
      const {projectFields: f} = load();
      for (const text of ["", "  ", "abc", undefined, null, "NaN"]) assert.deepEqual(f("p1", text), {projectId: "p1", projectOrder: null}, String(text));
    });
    it("projectFields: rounds and clamps the order to 1..999", () => {
      const {projectFields: f} = load();
      assert.equal(f("p1", "2").projectOrder, 2);
      assert.equal(f("p1", 2.6).projectOrder, 3);
      assert.equal(f("p1", "0").projectOrder, 1);
      assert.equal(f("p1", "-4").projectOrder, 1);
      assert.equal(f("p1", "5000").projectOrder, 999);
    });
    it("projectFields: is accepted by the server-side validation", () => {
      const {applyProjectFields} = require("../projects");
      const {projectFields: f} = load();
      const task = {id: "t", projectId: "p1", projectOrder: 4};
      assert.deepEqual(applyProjectFields(task, f("p2", "2"), ["p1", "p2"]), {id: "t", projectId: "p2", projectOrder: 2});
      assert.deepEqual(applyProjectFields(task, f("p1", ""), ["p1", "p2"]), {id: "t", projectId: "p1"});
      assert.deepEqual(applyProjectFields(task, f("", "2"), ["p1", "p2"]), {id: "t"});
    });
    it("projectLabel: the project name with the order number", () => {
      const {projectLabel: l} = load();
      assert.equal(l({projectId: "p1", projectOrder: 2}, projects), "Kitchen reno · 2");
      assert.equal(l({projectId: "p2"}, projects), "Garden");
    });
    it("projectLabel: empty outside a project or for an unknown one", () => {
      const {projectLabel: l} = load();
      assert.equal(l({}, projects), "");
      assert.equal(l({projectId: "gone", projectOrder: 1}, projects), "");
      assert.equal(l({projectId: "p1"}, []), "");
      assert.equal(l(null, projects), "");
    });
    it("projectTaskCounts: counts members per project and skips tasks outside one", () => {
      const {projectTaskCounts: c} = load();
      assert.deepEqual(c([{projectId: "p1"}, {projectId: "p1"}, {projectId: "p2"}, {}, {projectId: ""}]), {p1: 2, p2: 1});
      assert.deepEqual(c([]), {});
    });
    it("deleteProjectPrompt: says what happens to the member tasks", () => {
      const {deleteProjectPrompt: d} = load();
      assert.equal(d("Garden", 0), "Delete project \"Garden\"?");
      assert.match(d("Garden", 1), /Its 1 task stays on the list but leaves the project\./);
      assert.match(d("Garden", 3), /Its 3 tasks stay on the list but leave the project\./);
    });
  });
});

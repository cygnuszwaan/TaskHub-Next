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
    return {TABS, normalizeTab, scheduleChoice, scheduleFromChoice, DAILY_TIME, DEFAULT_TIME_ZONE, makeFormatters, setTimeZone, getZone: () => appTimeZone, daysUntilDue, formatInstant, formatSchedule, geocodeUrl, placeFromGeocode, placesFromGeocode, settingsPayload, manualTaskBody, recurrenceFields, scheduleSummary, projectFields, projectLabel, projectTaskCounts, filterTasks, deleteProjectPrompt, openMaterialsOf, materialsChipText, openMaterialGroups, openMaterialCount, withMaterialChecked, materialsFields, MAX_MATERIALS};`)();
}

describe("public/index.html helpers", () => {
  describe("layout", () => {
    it("has a manual-entry checkbox and fields in the add card, and gap, day and lunch fields in Settings", () => {
      const add = html.indexOf(`id="taskInput"`);
      const queue = html.indexOf(`id="queueCard"`);
      for (const id of ["manualToggle", "manualFields", "manualPriority", "manualMinutes", "manualTags", "manualDue"]) {
        const i = html.indexOf(`id="${id}"`);
        assert.ok(i > add && i < queue, `${id} sits in the add card`);
      }
      assert.match(html.slice(html.indexOf(`id="manualFields"`), html.indexOf(">", html.indexOf(`id="manualFields"`))), /hidden/);
      const settings = html.indexOf(`id="pageSettings"`);
      const modal = html.indexOf(`id="editModal"`);
      for (const id of ["gapMinutes", "dayStart", "dayEnd", "lunchEnabled", "lunchTime", "lunchMinutes"]) {
        const i = html.indexOf(`id="${id}"`);
        assert.ok(i > settings && i < modal, `${id} sits on the Settings page`);
      }
      assert.match(html.slice(html.indexOf(`id="lunchEnabled"`) - 30, html.indexOf(`id="lunchEnabled"`)), /type="checkbox"/);
    });
    it("shows every edit-form field in the manual entry: repeats, project with order number, and materials", () => {
      const manual = html.indexOf(`id="manualFields"`);
      const queue = html.indexOf(`id="queueCard"`);
      const ids = ["manualPriority", "manualMinutes", "manualTags", "manualDue", "manualRecurFreq", "manualRecurInterval", "manualProject", "manualProjectOrder", "manualMaterials", "manualNewMaterialText", "addManualMaterialBtn"];
      let last = manual;
      for (const id of ids) {
        const i = html.indexOf(`id="${id}"`);
        assert.ok(i > last && i < queue, `${id} sits in the manual fields, in the edit form's order`);
        last = i;
      }
      assert.match(html.slice(html.indexOf(`id="manualProjectOrder"`), html.indexOf(">", html.indexOf(`id="manualProjectOrder"`))), /disabled/);
      assert.match(html, /id="manualRecurFreq"[^>]*onchange="updateRecurUnit\('manual'\)"/);
      assert.match(html, /id="manualProject"[^>]*onchange="updateProjectOrderField\('manual'\)"/);
      assert.match(html, /id="manualRecurFreq"[\s\S]*?<option value="NONE">Does not repeat<\/option>/);
    });
    it("stops the page behind the edit modal from scrolling with it", () => {
      assert.match(html, /\.modal-card\s*\{[^}]*max-height:\s*90vh;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/);
      assert.match(html, /\.modal-overlay\s*\{[^}]*overscroll-behavior:\s*contain/);
      assert.match(html, /body\.modal-open\s*\{[^}]*overflow:\s*hidden/);
      const open = html.slice(html.indexOf("function openEditModal"), html.indexOf("// \"🔁"));
      assert.match(open, /style\.display = "flex";\s*document\.body\.classList\.add\("modal-open"\)/);
      const close = html.slice(html.indexOf("function closeEditModal"), html.indexOf("function closeModalOnOverlay"));
      assert.match(close, /classList\.remove\("modal-open"\)/);
    });
    it("has no heading on the add card: \"Add New Task\" is the empty text field's placeholder, and the manual-entry checkbox has no explanation in brackets", () => {
      assert.doesNotMatch(html, /<h3[^>]*>Add New Task<\/h3>/);
      assert.match(html.slice(html.indexOf(`id="taskInput"`) - 30, html.indexOf(">", html.indexOf(`id="taskInput"`))), /placeholder="Add New Task"/);
      assert.doesNotMatch(html, /Add \/ Modify Task/);
      const box = html.indexOf(`id="manualToggle"`);
      const label = html.slice(html.indexOf(">", box) + 1, html.indexOf("</label>", box)).trim();
      assert.equal(label, "Enter the details myself");
    });
    const at = (needle, from = 0) => {
      const i = html.indexOf(needle, from);
      assert.ok(i > 0, `${needle} not found`);
      return i;
    };
    // The index of the </details> that closes the <details> opened at `open`, allowing for nested ones
    const closeOf = (open) => {
      let depth = 0;
      const re = /<details\b|<\/details>/g;
      re.lastIndex = open;
      for (let m = re.exec(html); m; m = re.exec(html)) {
        depth += m[0] === "</details>" ? -1 : 1;
        if (depth === 0) return m.index;
      }
      throw new Error("unclosed <details>");
    };
    it("has a pinned header with the Tasks, Materials and Settings tabs, in that order, and nothing else", () => {
      assert.match(html, /\.app-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0/);
      const header = html.slice(at("<header"), at("</header>"));
      assert.ok(header.includes(`id="tabBar"`));
      assert.doesNotMatch(header, /Sign out|<h1/);
      assert.doesNotMatch(html.slice(at(`id="app"`), at(`id="editModal"`)), /signOutUser\(\)/);
      assert.ok(at("<header") - at(`id="app"`) < 40, "the header is the first thing in the app");
      const tabs = [...header.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
      assert.deepEqual(tabs, ["tasks", "materials", "stats", "settings"]);
      assert.match(header, /data-tab="stats">Stats</);
      assert.ok(header.indexOf(`id="materialsCount"`) > header.indexOf(`data-tab="materials"`));
      assert.ok(header.indexOf(`id="materialsCount"`) < header.indexOf(`data-tab="settings"`));
    });
    it("has one page per tab, with only the Tasks page visible at first", () => {
      const pages = [...html.matchAll(/<main id="(\w+)" data-page="(\w+)"([^>]*)>/g)];
      assert.deepEqual(pages.map((m) => m[2]), ["tasks", "materials", "stats", "settings"]);
      assert.deepEqual(pages.map((m) => /\bhidden\b/.test(m[3])), [false, true, true, true]);
    });
    it("puts add task and the Queue on the Tasks page", () => {
      const tasks = at(`id="pageTasks"`);
      const end = at("</main>", tasks);
      for (const id of ["taskInput", "queueCard", "tagsDetails", "projectsDetails", "taskList"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > tasks && i < end, `${id} is on the Tasks page`);
      }
      assert.ok(at(`id="taskInput"`) < at(`id="queueCard"`));
      assert.ok(at(`id="pageStats"`) > end, "Recently Completed is not on the Tasks page");
    });
    it("makes Materials a page, not a collapsible card", () => {
      const page = at(`id="pageMaterials"`);
      const end = at("</main>", page);
      for (const id of ["materialsList", "materialsStatus"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > page && i < end, `${id} is on the Materials page`);
      }
      assert.doesNotMatch(html.slice(page, end), /<details/);
      assert.doesNotMatch(html, /id="materialsDetails"/);
      assert.ok(html.indexOf(`id="editMaterials"`) > html.indexOf(`id="editModal"`));
    });
    it("shows days to schedule and the gap side by side with short labels", () => {
      const days = at(`id="scheduleDays"`);
      const gap = at(`id="gapMinutes"`);
      const row = html.lastIndexOf(`<div class="form-group" style="display: flex;`, days);
      assert.ok(row > 0 && row < days && gap < at(`id="dayStart"`));
      assert.ok(html.lastIndexOf(`<div class="form-group"`, gap) === row, "one row holds both fields");
      const label = (id) => html.slice(at(`<label for="${id}">`), at("</label>", at(`<label for="${id}">`))).replace(/<[^>]+>/g, "");
      assert.equal(label("scheduleDays"), "Days to schedule");
      assert.equal(label("gapMinutes"), "Gap between tasks");
    });
    it("labels the day and lunch fields without explanations in brackets", () => {
      const label = (id) => html.slice(at(`<label for="${id}">`), at("</label>", at(`<label for="${id}">`))).replace(/<[^>]+>/g, "");
      assert.equal(label("dayStart"), "Day starts");
      assert.equal(label("dayEnd"), "Day ends");
      assert.equal(label("lunchTime"), "Lunch starts");
      assert.equal(label("lunchMinutes"), "Length");
    });
    it("has one Repeat every select, ending with a daily option, and no Frequency selector or time field", () => {
      assert.doesNotMatch(html, /schedFrequency|schedTime|schedIntervalGroup|>Frequency</);
      const select = html.slice(at(`<select id="schedInterval">`), at("</select>", at(`<select id="schedInterval">`)));
      const values = [...select.matchAll(/<option value="(\w+)">([^<]*)</g)];
      assert.deepEqual(values.map((m) => m[1]), ["15", "30", "60", "120", "240", "DAILY"]);
      assert.equal(values[5][2], "Daily at 8pm");
      assert.equal(html.slice(at(`<label for="schedInterval">`), at("</label>", at(`<label for="schedInterval">`))).replace(/<[^>]+>/g, ""), "Repeat every");
    });
    it("makes Recently Completed the Stats page, not a collapsible card, with its list loaded on each visit", () => {
      const page = at(`id="pageStats"`);
      const end = at("</main>", page);
      assert.ok(page > at(`id="pageMaterials"`) && end < at(`id="pageSettings"`));
      assert.ok(at(`id="completedList"`) > page && at(`id="completedList"`) < end);
      assert.doesNotMatch(html.slice(page, end), /<details/);
      assert.doesNotMatch(html, /completedDetails|Recently Completed/);
      const show = html.slice(at("function showTab"), at("function showTab") + 700);
      assert.match(show, /tab === "stats"\) fetchCompleted\(\)/);
    });
    it("keeps four tabs on one row by letting them size to their text", () => {
      assert.match(html, /\.tab-btn\s*\{[^}]*flex:\s*1 1 auto;[^}]*font-size:\s*13px/);
    });
    it("makes Settings a page with Save settings, Update now and the schedule result line", () => {
      const page = at(`id="pageSettings"`);
      const end = at("</main>", page);
      assert.ok(page > at(`id="pageMaterials"`) && end < at(`id="editModal"`));
      assert.doesNotMatch(html.slice(page, end), /<details/);
      assert.doesNotMatch(html, /id="settingsDetails"/);
      const save = at(`id="saveSettingsBtn"`);
      const row = html.slice(html.lastIndexOf(`<div class="action-row"`, save), at(`id="settingsStatus"`));
      assert.match(row, /id="saveSettingsBtn"/);
      assert.match(row, /id="schedBtn"[^>]*onclick="scheduleWeek\(\)"[^>]*>[^<]*Update now/);
      for (const id of ["schedBtn", "scheduleStatus"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > page && i < end, `${id} is on the Settings page`);
      }
    });
    it("has no Projects card of its own: Projects is a collapsible section of the Queue, just below Tags, and both start collapsed", () => {
      const q = at(`id="queueCard"`);
      const tags = at(`<details class="filter-section" id="tagsDetails">`, q);
      const projects = at(`<details class="filter-section" id="projectsDetails">`, q);
      assert.ok(q < tags && closeOf(tags) < projects && closeOf(projects) < at(`id="taskList"`, q));
      assert.ok(at(`id="tagFilterBar"`, tags) < closeOf(tags));
      for (const id of ["projectFilterBar", "projectActions", "newProjectName", "addProjectBtn", "projectsStatus"]) {
        assert.ok(at(`id="${id}"`, projects) < closeOf(projects), `${id} sits in the Projects section`);
      }
      assert.equal(html.split(`id="projectsDetails"`).length, 2, "one Projects section only");
    });
    it("gives Tags and Projects a heading each that can be collapsed, with the active filter shown in it", () => {
      for (const [section, active] of [["tagsDetails", "tagsActive"], ["projectsDetails", "projectsActive"]]) {
        const i = at(`id="${section}"`);
        const summary = html.slice(at("<summary>", i), at("</summary>", i));
        assert.ok(summary.includes(`id="${active}"`), `${section} heading shows ${active}`);
      }
    });
    it("adds a Project select and an Order number field, disabled until a project is chosen, to the edit modal", () => {
      const modal = at(`id="editModal"`);
      assert.ok(at(`id="editProject"`, modal) < at(`id="editProjectOrder"`, modal));
      assert.match(html.slice(at(`id="editProjectOrder"`, modal), at(">", at(`id="editProjectOrder"`, modal))), /disabled/);
    });
    it("no longer offers Plan My Week anywhere on the page", () => {
      assert.doesNotMatch(html, /Plan My Week/);
    });
    it("has a Queue card with no heading of its own (no collapsible Queue), holding the filters and the list", () => {
      const q = at(`id="queueCard"`);
      assert.doesNotMatch(html, /queueDetails|Organized Queue|Tap to edit/);
      assert.doesNotMatch(html.slice(q, at(`id="tagsDetails"`, q)), /<summary|<h3/);
      assert.ok(q < at(`id="tagFilterBar"`, q) && at(`id="tagFilterBar"`, q) < at(`id="taskList"`, q));
      assert.ok(at(`id="taskList"`, q) < at("</main>", q));
    });
    it("starts the Tags and Projects sections collapsed", () => {
      for (const id of ["tagsDetails", "projectsDetails"]) {
        const i = at(`id="${id}"`);
        assert.doesNotMatch(html.slice(html.lastIndexOf("<details", i), html.indexOf(">", i)), /\bopen\b/, `${id} is collapsed`);
      }
    });
  });

  describe("schedule choice", () => {
    it("reads the select value from the stored schedule", () => {
      const h = load();
      assert.equal(h.scheduleChoice({frequency: "DAILY", time: "20:00", intervalMinutes: 30}), "DAILY");
      assert.equal(h.scheduleChoice({frequency: "INTERVAL", time: "20:00", intervalMinutes: 30}), "30");
      assert.equal(h.scheduleChoice(undefined), "DAILY");
    });
    it("builds the schedule fields from the select value, keeping the stored interval for a daily choice", () => {
      const h = load();
      assert.deepEqual({...h.scheduleFromChoice("DAILY", 120)}, {frequency: "DAILY", time: "20:00", intervalMinutes: 120});
      assert.deepEqual({...h.scheduleFromChoice("DAILY", undefined)}, {frequency: "DAILY", time: "20:00", intervalMinutes: 60});
      assert.deepEqual({...h.scheduleFromChoice("15", 120)}, {frequency: "INTERVAL", time: "20:00", intervalMinutes: 15});
    });
    it("gives every select option a schedule the server accepts, and the daily one 20:00", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate, DEFAULTS} = require("../settings");
      const form = {location: DEFAULTS.location, timeZone: DEFAULTS.timeZone, scheduleDays: 7, gapMinutes: 0, dayStart: "09:00", dayEnd: "17:00", lunchEnabled: false, lunchTime: "12:00", lunchMinutes: 30, enabled: true};
      for (const choice of ["DAILY", "15", "30", "60", "120", "240"]) {
        const r = applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, ...h.scheduleFromChoice(choice, 60)}));
        assert.equal(r.error, undefined, choice);
        assert.equal(r.settings.schedule.frequency, choice === "DAILY" ? "DAILY" : "INTERVAL");
        assert.equal(r.settings.schedule.time, h.DAILY_TIME);
      }
      assert.equal(h.DAILY_TIME, "20:00");
    });
  });

  describe("tabs", () => {
    it("lists the tabs and falls back to Tasks for an unknown name", () => {
      const {TABS, normalizeTab} = load();
      assert.deepEqual([...TABS], ["tasks", "materials", "stats", "settings"]);
      for (const name of TABS) assert.equal(normalizeTab(name), name);
      for (const name of ["", "other", undefined, null, "Tasks"]) assert.equal(normalizeTab(name), "tasks");
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
    const form = {location: {name: "Oslo", latitude: 59.9, longitude: 10.7, extra: "dropped"}, timeZone: "Europe/Oslo", scheduleDays: "14", gapMinutes: "10", dayStart: "08:30", dayEnd: "16:00", lunchEnabled: 1, lunchTime: "12:30", lunchMinutes: "45", enabled: 1, frequency: "INTERVAL", time: "06:30", intervalMinutes: "30"};
    it("builds the updateSettings body from the form", () => {
      const h = load();
      assert.deepEqual(h.settingsPayload(form), {
        location: {name: "Oslo", latitude: 59.9, longitude: 10.7},
        timeZone: "Europe/Oslo",
        scheduleDays: 14,
        gapMinutes: 10,
        day: {start: "08:30", end: "16:00"},
        lunch: {enabled: true, time: "12:30", minutes: 45},
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
      assert.equal(r.settings.gapMinutes, 10);
      assert.deepEqual(r.settings.day, {start: "08:30", end: "16:00"});
      assert.deepEqual(r.settings.lunch, {enabled: true, time: "12:30", minutes: 45});
      assert.equal(r.settings.location.name, "Oslo");
    });
    it("leaves an out-of-range gap, an empty lunch time or a bad lunch length for the server to reject", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      const reject = (extra) => applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, ...extra})).error;
      assert.match(reject({gapMinutes: "90"}), /gapMinutes/);
      assert.equal(reject({gapMinutes: ""}), undefined); // an empty gap field means no gap
      assert.match(reject({lunchTime: ""}), /lunch\.time/);
      assert.match(reject({lunchMinutes: "1"}), /lunch\.minutes/);
    });
    it("leaves an empty or too short day window for the server to reject", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      const reject = (extra) => applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, ...extra})).error;
      assert.match(reject({dayStart: ""}), /day\.start/);
      assert.match(reject({dayEnd: ""}), /day\.end/);
      assert.match(reject({dayStart: "16:30", dayEnd: "17:00"}), /at least 60 minutes/);
      assert.equal(reject({dayStart: "09:00", dayEnd: "17:00"}), undefined);
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
  describe("filterTasks", () => {
    const tasks = [
      {id: "a", tags: ["Outdoor"], projectId: "p1"},
      {id: "b", tags: ["Outdoor", "Garden"], projectId: "p2"},
      {id: "c", tags: ["Indoor"], projectId: "p1"},
      {id: "d", tags: [], projectId: undefined},
      {id: "e"},
    ];
    const ids = (list) => list.map((t) => t.id);
    it("returns everything with no filter", () => {
      assert.deepEqual(ids(load().filterTasks(tasks, null, null)), ["a", "b", "c", "d", "e"]);
    });
    it("filters by tag alone and by project alone", () => {
      const h = load();
      assert.deepEqual(ids(h.filterTasks(tasks, "Outdoor", null)), ["a", "b"]);
      assert.deepEqual(ids(h.filterTasks(tasks, null, "p1")), ["a", "c"]);
    });
    it("applies both together", () => {
      const h = load();
      assert.deepEqual(ids(h.filterTasks(tasks, "Outdoor", "p1")), ["a"]);
      assert.deepEqual(ids(h.filterTasks(tasks, "Garden", "p1")), []);
    });
    it("copes with tasks without tags, and does not modify its input", () => {
      const copy = JSON.stringify(tasks);
      assert.deepEqual(ids(load().filterTasks(tasks, "Indoor", null)), ["c"]);
      assert.equal(JSON.stringify(tasks), copy);
    });
  });
  describe("manualTaskBody", () => {
    const form = {title: "  Mow lawn ", priority: "HIGH", estimatedMinutes: "45", tags: "Outdoor, ,Physical ", dueDate: "2026-10-30"};
    it("builds the addOrUpdateTask body for a task entered by hand", () => {
      assert.deepEqual(load().manualTaskBody(form), {manual: {title: "Mow lawn", priority: "HIGH", dueDate: "2026-10-30", estimatedMinutes: 45, tags: ["Outdoor", "Physical"]}});
    });
    it("uses 15 minutes for an empty or unusable estimate, and an empty due date and tag list", () => {
      const body = load().manualTaskBody({title: "T", priority: "LOW", estimatedMinutes: "", tags: "", dueDate: ""});
      assert.deepEqual(body, {manual: {title: "T", priority: "LOW", dueDate: "", estimatedMinutes: 15, tags: []}});
      assert.equal(load().manualTaskBody({...form, estimatedMinutes: "abc"}).manual.estimatedMinutes, 15);
    });
    it("is accepted by the server-side change builder", () => {
      const {manualTaskChange} = require("../tasks");
      assert.equal(manualTaskChange(load().manualTaskBody(form).manual).title, "Mow lawn");
    });
    it("leaves out recurrence, project and materials when the form has none", () => {
      const manual = load().manualTaskBody({...form, recurFreq: "NONE", recurInterval: "1", projectId: "", projectOrder: "4", materials: [{id: "", text: "  ", checked: false}]}).manual;
      assert.deepEqual(Object.keys(manual).sort(), ["dueDate", "estimatedMinutes", "priority", "tags", "title"]);
    });
    it("adds the repeat, project with its order number and materials the form has", () => {
      const manual = load().manualTaskBody({...form, recurFreq: "WEEKLY", recurInterval: "2", projectId: "p1", projectOrder: "3", materials: [{id: "", text: " Paint ", checked: false}, {id: "", text: "", checked: false}, {id: "", text: "Brushes", checked: true}]}).manual;
      assert.deepEqual(manual.recurrence, {frequency: "WEEKLY", interval: 2});
      assert.equal(manual.projectId, "p1");
      assert.equal(manual.projectOrder, 3);
      assert.deepEqual(manual.materials.map((m) => [m.text, m.checked]), [["Paint", false], ["Brushes", true]]);
    });
    it("sends a project without an order number as unordered", () => {
      const manual = load().manualTaskBody({...form, projectId: "p1", projectOrder: ""}).manual;
      assert.equal(manual.projectId, "p1");
      assert.equal(manual.projectOrder, null);
    });
    it("makes a full new task through the server-side merge", () => {
      const {manualTaskChange, mergeTaskChanges} = require("../tasks");
      const body = load().manualTaskBody({...form, recurFreq: "MONTHLY", recurInterval: "1", projectId: "p1", projectOrder: "2", materials: [{id: "", text: "Paint", checked: false}]}).manual;
      let n = 0;
      const merged = mergeTaskChanges([], [manualTaskChange(body)], () => `id${++n}`, ["p1"], {materials: true});
      const task = merged.tasks[0];
      assert.deepEqual(task.recurrence, {frequency: "MONTHLY", interval: 1});
      assert.equal(task.projectId, "p1");
      assert.equal(task.projectOrder, 2);
      assert.equal(task.materials.length, 1);
    });
  });
  describe("recurrenceFields", () => {
    it("is null unless the task repeats", () => {
      const h = load();
      for (const freq of ["NONE", "", undefined, "HOURLY"]) assert.equal(h.recurrenceFields(freq, "2"), null);
    });
    it("keeps the interval a whole number within 1..365, and 1 when unusable", () => {
      const h = load();
      assert.deepEqual({...h.recurrenceFields("DAILY", "3")}, {frequency: "DAILY", interval: 3});
      assert.equal(h.recurrenceFields("DAILY", "0").interval, 1);
      assert.equal(h.recurrenceFields("DAILY", "").interval, 1);
      assert.equal(h.recurrenceFields("DAILY", "abc").interval, 1);
      assert.equal(h.recurrenceFields("YEARLY", "1000").interval, 365);
      assert.equal(h.recurrenceFields("WEEKLY", "2.7").interval, 2);
    });
  });
  describe("scheduleSummary", () => {
    const run = (extra = {}) => load().scheduleSummary({scheduledCount: 12, ...extra});
    it("reports the count, the last day used and the window", () => {
      assert.equal(run({scheduleDays: 28, lastScheduledDate: "2026-10-27"}), "Success! Scheduled 12 tasks onto your Google Calendar. The last task is on Tue, 27 Oct. The window was 28 days ahead.");
    });
    it("says one day, not one days", () => {
      assert.match(run({scheduleDays: 1}), /The window was 1 day ahead\./);
    });
    it("adds the unplaced and pinned counts", () => {
      const s = run({unscheduledCount: 3, lockedCount: 2});
      assert.match(s, /3 could not be placed and stay unscheduled\./);
      assert.match(s, /Locked tasks left as pinned: 2\./);
    });
    it("says how many tasks are waiting on materials", () => {
      assert.match(run({heldCount: 1}), /1 task is waiting on materials and not scheduled\./);
      assert.match(run({heldCount: 3}), /3 tasks are waiting on materials and not scheduled\./);
      assert.doesNotMatch(run({heldCount: 0}), /materials/);
    });
    it("leaves out what the server did not send", () => {
      assert.equal(run(), "Success! Scheduled 12 tasks onto your Google Calendar.");
      assert.equal(run({lastScheduledDate: "garbage"}), "Success! Scheduled 12 tasks onto your Google Calendar.");
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
  describe("materials helpers", () => {
    const mat = (id, text, checked = false) => ({id, text, checked});
    const tasks = [
      {id: "b", title: "Second", order: 2, materials: [mat("1", "Rope"), mat("2", "Hooks", true)]},
      {id: "a", title: "First", order: 1, materials: [mat("3", "Paint"), mat("4", "Brush")]},
      {id: "c", title: "Done", order: 3, materials: [mat("5", "Tape", true)]},
      {id: "d", title: "None", order: 4},
    ];

    it("openMaterialsOf: only the unchecked ones, none without a list", () => {
      const {openMaterialsOf: open} = load();
      assert.deepEqual(open(tasks[0]).map((m) => m.id), ["1"]);
      assert.deepEqual(open(tasks[2]), []);
      assert.deepEqual(open(tasks[3]), []);
      assert.deepEqual(open(undefined), []);
    });
    it("materialsChipText: waiting, ready or nothing", () => {
      const {materialsChipText: chip} = load();
      assert.equal(chip(tasks[0]), "Waiting on materials (1 of 2 ready)");
      assert.equal(chip(tasks[1]), "Waiting on materials (0 of 2 ready)");
      assert.equal(chip(tasks[2]), "Materials ready");
      assert.equal(chip(tasks[3]), "");
      assert.equal(chip({materials: []}), "");
    });
    it("openMaterialGroups: tasks with unchecked materials in list order, checked ones left out", () => {
      const groups = load().openMaterialGroups(tasks);
      assert.deepEqual(groups.map((g) => g.taskId), ["a", "b"]);
      assert.deepEqual(groups[0], {taskId: "a", title: "First", materials: [{id: "3", text: "Paint"}, {id: "4", text: "Brush"}]});
      assert.deepEqual(groups[1].materials, [{id: "1", text: "Rope"}]);
    });
    it("openMaterialGroups does not reorder or change its input", () => {
      const snapshot = JSON.stringify(tasks);
      load().openMaterialGroups(tasks);
      assert.equal(JSON.stringify(tasks), snapshot);
    });
    it("openMaterialGroups: nothing to get gives an empty list", () => {
      assert.deepEqual(load().openMaterialGroups([tasks[2], tasks[3]]), []);
      assert.deepEqual(load().openMaterialGroups([]), []);
    });
    it("openMaterialCount: counts unchecked materials across all tasks", () => {
      assert.equal(load().openMaterialCount(tasks), 3);
      assert.equal(load().openMaterialCount([]), 0);
    });
    it("withMaterialChecked: sets one item and returns the whole list without touching the task", () => {
      const {withMaterialChecked: set} = load();
      const next = set(tasks[1], "3", true);
      assert.deepEqual(next, [mat("3", "Paint", true), mat("4", "Brush")]);
      assert.equal(tasks[1].materials[0].checked, false);
      assert.deepEqual(set(tasks[1], "nope", true), tasks[1].materials);
      assert.deepEqual(set({}, "1", true), []);
    });
    it("materialsFields: drops blank rows, trims, and gives null for no materials", () => {
      const {materialsFields: fields} = load();
      assert.deepEqual(fields([{id: "1", text: "  Paint ", checked: true}, {id: "", text: "   "}, {id: "", text: "Brush"}]), [
        {id: "1", text: "Paint", checked: true}, {id: "", text: "Brush", checked: false},
      ]);
      assert.equal(fields([]), null);
      assert.equal(fields([{id: "1", text: " "}]), null);
    });
    it("materialsFields: keeps at most the maximum", () => {
      const {materialsFields: fields, MAX_MATERIALS: max} = load();
      assert.equal(fields(Array.from({length: max + 5}, (_, i) => ({id: "", text: `m${i}`}))).length, max);
    });
  });
});

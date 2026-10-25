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
    return {TABS, normalizeTab, removalMessage, sortedTags, scheduleChoice, scheduleFromChoice, DAILY_TIME, DEFAULT_TIME_ZONE, makeFormatters, setTimeZone, getZone: () => appTimeZone, daysUntilDue, formatInstant, formatSchedule, geocodeUrl, placeFromGeocode, placesFromGeocode, settingsPayload, jobSheetPayload, manualTaskBody, recurrenceFields, scheduleSummary, matchesSearch, projectFields, projectLabel, projectTaskCounts, filterTasks, deleteProjectPrompt, completePrompt, openMaterialsOf, materialsChipText, openMaterialGroups, openMaterialCount, withMaterialChecked, materialsFields, MAX_MATERIALS, needsRedirectSignIn, addDaysTo, snoozeDateFor, snoozeDateFromInput, isSnoozedTask, snoozeChipText, snoozeNeedsReschedule, SORT_OPTIONS, normalizeSortKey, sortTasks, queueNumbers, numberChipText, queueNumberChange, activeTaskOf, isTimerRunning, elapsedSecondsOf, formatElapsed, durationText, completedTimeText, streakText, statProjectName, jobStatsText, fmtMinutes, decimalHours, hoursText, projectWeekText, weekRangeText, pickStatsProject, parseTagList, zonedDateTime, completedFormValues, completedChanges, completedMaterialTexts, parseMaterialLines, COMPLETED_PAGE_SIZE, matchesCompletedSearch, completedBrowse, pagerItems, completedCountText, THEME_KEY, normalizeTheme, isDarkTheme, themeFromToggle, themeMetaMedia, exportFilename, jobSheetFilename, exportSummary, templateMatches, templateMeta, templateFormValues, addTaskExtras, freeTextBody, proposalStepText, proposalAcceptBody, proposalDeclineBody, historyOf, historyForTitle, MAX_PHOTOS, PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_MAX_BYTES, photoTargetSize, photoAttempts, photoCountText, base64FromDataUrl, LONG_PRESS_MS, PRESS_MOVE_PX, pressMoved, timerChipIcon, FLASH_MS, flashElapsed, SWIPE_START_PX, SWIPE_COMMIT_PX, isHorizontalDrag, swipeAction, swipeOffset, deletePrompt, abortPrompt, reopenPrompt, withoutTasks, insertTaskAt, UNDO_WINDOW_MS, UNDO_NOTE_MS};`)();
}

describe("public/index.html helpers", () => {
  describe("task card gestures", () => {
    it("treats a drift beyond the tolerance as a scroll, not a press", () => {
      const {pressMoved, PRESS_MOVE_PX} = load();
      assert.equal(pressMoved(0, 0), false);
      assert.equal(pressMoved(PRESS_MOVE_PX, 0), false);
      assert.equal(pressMoved(0, -(PRESS_MOVE_PX + 1)), true);
      assert.equal(pressMoved(8, 8), true);
      assert.equal(pressMoved(undefined, undefined), false);
    });
    it("has no double-tap gesture: a tap opens the editor at once and nothing completes by tapping", () => {
      assert.doesNotMatch(html, /isDoubleTap|DOUBLE_TAP_MS|lastTap|tapTimer|cancelTap/);
      const click = html.slice(html.indexOf("const onTaskRowClick"), html.indexOf("for (const id of [\"taskList\""));
      assert.match(click, /openEditModal\(item\.dataset\.id\);/);
      assert.doesNotMatch(click, /completeTask|setTimeout/);
    });
    it("shows a timer chip only once the timer has been started: play while running, pause otherwise", () => {
      const {timerChipIcon} = load();
      assert.equal(timerChipIcon({id: "a"}), "");
      assert.equal(timerChipIcon(null), "");
      assert.equal(timerChipIcon({id: "a", trackedSeconds: 0}), "");
      assert.equal(timerChipIcon({id: "a", firstStartedAt: "2026-10-24T09:00:00.000Z", timerStartedAt: "2026-10-25T09:00:00.000Z"}), "▶️");
      assert.equal(timerChipIcon({id: "a", firstStartedAt: "2026-10-24T09:00:00.000Z", trackedSeconds: 60}), "⏸️");
      assert.equal(timerChipIcon({id: "a", trackedSeconds: 30}), "⏸️", "a task timed before firstStartedAt was kept");
      assert.equal(timerChipIcon({id: "a", timerStartedAt: "2026-10-25T09:00:00.000Z"}), "▶️");
    });
    it("starts a swipe only for a clearly sideways drag", () => {
      const {isHorizontalDrag, SWIPE_START_PX} = load();
      assert.equal(isHorizontalDrag(SWIPE_START_PX, 0), false);
      assert.equal(isHorizontalDrag(SWIPE_START_PX + 1, 0), true);
      assert.equal(isHorizontalDrag(-40, 10), true);
      assert.equal(isHorizontalDrag(40, 30), false, "a diagonal is a scroll");
      assert.equal(isHorizontalDrag(undefined, undefined), false);
    });
    it("maps a long enough swipe to delete (left) or snooze (right)", () => {
      const {swipeAction, SWIPE_COMMIT_PX} = load();
      assert.equal(swipeAction(-SWIPE_COMMIT_PX, 0), "DELETE");
      assert.equal(swipeAction(SWIPE_COMMIT_PX, 5), "SNOOZE");
      assert.equal(swipeAction(-(SWIPE_COMMIT_PX - 1), 0), null);
      assert.equal(swipeAction(SWIPE_COMMIT_PX, SWIPE_COMMIT_PX), null);
    });
    it("gives the Active task abort on a left swipe and complete on a right swipe, with the same thresholds", () => {
      const {swipeAction, SWIPE_COMMIT_PX} = load();
      assert.equal(swipeAction(-SWIPE_COMMIT_PX, 0, true), "ABORT");
      assert.equal(swipeAction(SWIPE_COMMIT_PX, 5, true), "COMPLETE");
      assert.equal(swipeAction(-(SWIPE_COMMIT_PX - 1), 0, true), null);
      assert.equal(swipeAction(SWIPE_COMMIT_PX, SWIPE_COMMIT_PX, true), null);
      assert.equal(swipeAction(-SWIPE_COMMIT_PX, 0, false), "DELETE");
    });
    it("asks before aborting, naming the task and what abort does", () => {
      const {abortPrompt} = load();
      assert.equal(abortPrompt({title: "Mow lawn"}), "Abort \"Mow lawn\"? Its timer stops, its tracked time and start time are erased and it returns to the queue.");
      assert.match(abortPrompt(null), /^Abort this task\?/);
    });
    it("wires the swipes by card: queued left delete and right snooze, Active left abort and right complete", () => {
      const up = html.slice(html.indexOf("const onTaskRowUp"), html.indexOf("const onTaskRowClick"));
      assert.match(up, /swipeAction\(s\.dx, s\.dy, s\.active\)/);
      assert.match(up, /action === "ABORT"[\s\S]*confirm\(abortPrompt\(task\)\)[\s\S]*abortTask\(s\.id\)/);
      assert.match(up, /action === "COMPLETE"[\s\S]*confirmComplete\(s\.id\)[\s\S]*completeTask\(s\.id\)/);
      assert.match(up, /action === "DELETE"[\s\S]*deleteTask\(s\.id\)/);
      assert.match(up, /action === "SNOOZE"[\s\S]*openSnoozeModal\(s\.id\)/);
      assert.match(html, /active: !!item\.closest\("#activeTaskBox"\)/);
    });
    it("shows Complete and Abort under the Active task and Snooze and Delete under a queued card", () => {
      const row = html.slice(html.indexOf("function swipeRowHtml"), html.indexOf("// The active task's tracked time ticks"));
      assert.match(row, /isActive \? `[^`]*swipe-complete[^`]*Complete[^`]*` : `[^`]*swipe-snooze[^`]*Snooze/);
      assert.match(row, /isActive \? `[^`]*swipe-abort[^`]*Abort[^`]*` : `[^`]*swipe-del[^`]*Delete/);
      assert.equal((html.match(/--swipe-complete: #166534; --swipe-abort: #92400e;/g) || []).length, 2, "dark values in both dark blocks");
      assert.match(html, /\.swipe-row\.swipe-right \.swipe-complete/);
      assert.match(html, /\.swipe-row\.swipe-left \.swipe-abort/);
    });
    it("holds the card's follow distance to a limit either way", () => {
      const {swipeOffset} = load();
      assert.equal(swipeOffset(50, 200), 50);
      assert.equal(swipeOffset(-500, 200), -200);
      assert.equal(swipeOffset(500, 200), 200);
      assert.equal(swipeOffset(30, 0), 0);
      assert.equal(swipeOffset(undefined, 100), 0);
    });
    it("asks about a swipe delete by title", () => {
      const {deletePrompt} = load();
      assert.equal(deletePrompt({title: "Mow lawn"}), "Delete \"Mow lawn\"?");
      assert.equal(deletePrompt(null), "Delete this task?");
    });
    it("hides tasks whose removal is pending and puts a failed one back once", () => {
      const {withoutTasks, insertTaskAt} = load();
      const list = [{id: "a"}, {id: "b"}, {id: "c"}];
      assert.deepEqual(withoutTasks(list, new Set(["b"])), [{id: "a"}, {id: "c"}]);
      assert.deepEqual(withoutTasks(list, ["a", "c"]), [{id: "b"}]);
      assert.deepEqual(withoutTasks(list, new Set()), list);
      assert.deepEqual(withoutTasks(null, new Set(["a"])), []);
      assert.deepEqual(insertTaskAt([{id: "a"}, {id: "c"}], {id: "b"}, 1), list);
      assert.deepEqual(insertTaskAt([{id: "a"}], {id: "b"}, 99), [{id: "a"}, {id: "b"}]);
      assert.deepEqual(insertTaskAt(list, {id: "b"}, 0), list, "already back");
    });
    it("lets the whole Active task box take the gestures, and swipes both it and queued cards", () => {
      assert.match(html, /for \(const id of \["taskList", "activeTaskBox"\]\)/);
      assert.match(html, /if \(item\.closest\("#activeTaskBox"\)\) continue;/, "the active task does not flash");
      assert.doesNotMatch(html, /box-flash|\.active-task-box[^{]*\.flash/);
      const list = html.slice(html.indexOf("function taskItemHtml"), html.indexOf("function renderTasks"));
      assert.match(list, /swipeRowHtml/);
      assert.match(list, /taskItemHtml\(t, isActive\)/);
      assert.match(html, /swipeRowHtml\(active, true\)/);
      assert.match(html, /const row = item\.closest\("\.swipe-row"\);/);
    });
    it("keeps a card transparent at rest so the active box's flash shows behind it, opaque only while dragged", () => {
      assert.doesNotMatch(html, /\.swipe-row \.task-item \{[^}]*background:/);
      assert.match(html, /\.swipe-row\.swiping \.task-item[^{]*\{[^}]*background: var\(--surface\)/);
      assert.match(html, /\.active-task-box \.swipe-row \.task-item:hover \{ background: transparent; \}/);
    });
    it("shades the Active task box green while its timer runs and amber while paused, in both themes", () => {
      assert.match(html, /\.active-task-box\.timer-running \{ background: var\(--timer-run-bg\); \}/);
      assert.match(html, /\.active-task-box\.timer-paused \{ background: var\(--timer-pause-bg\); \}/);
      assert.match(html, /toggle\("timer-running", !!active && isTimerRunning\(active\)\)/);
      assert.match(html, /toggle\("timer-paused", !!active && !isTimerRunning\(active\)\)/);
      assert.equal((html.match(/--timer-run-bg: #14382a; --timer-pause-bg: #46380f;/g) || []).length, 2, "dark values in both dark blocks");
    });
    it("sends ABORT through the same guarded timer call as START and PAUSE", () => {
      assert.match(html, /function abortTask\(taskId\) \{\s*return sendTimerAction\(taskId, "ABORT"\);/);
      assert.match(html, /body: JSON\.stringify\(\{ taskId, action \}\)/);
      assert.match(html, /isTimerRunning\(task\) \? "PAUSE" : "START"/);
    });
    it("takes removals off the list before the server answers and keeps later lists from bringing them back", () => {
      const remove = html.slice(html.indexOf("function removeTask("), html.indexOf("async function completeTask("));
      assert.ok(remove.indexOf("withoutTasks(allTasks, pendingRemovals)") < remove.indexOf("await apiFetch"));
      assert.match(remove, /insertTaskAt\(allTasks, task, index\)/);
      assert.equal(html.includes("allTasks = data.tasks"), false);
      assert.match(html, /await removalChain;/);
    });
    it("carries a flash across a redraw until it has played out", () => {
      const {flashElapsed, FLASH_MS} = load();
      const flash = {taskId: "a", at: 1000};
      assert.equal(flashElapsed(flash, "a", 1000), 0);
      assert.equal(flashElapsed(flash, "a", 1000 + FLASH_MS - 1), FLASH_MS - 1);
      assert.equal(flashElapsed(flash, "a", 1000 + FLASH_MS), null);
      assert.equal(flashElapsed(flash, "b", 1100), null);
      assert.equal(flashElapsed(null, "a", 1100), null);
    });
  });
  describe("snooze", () => {
    // 22 Oct 2026 is a Thursday: the 24th is a Saturday, the 25th a Sunday, the 26th a Monday.
    it("steps dates across month and year ends", () => {
      const {addDaysTo} = load();
      assert.equal(addDaysTo("2026-10-31", 1), "2026-11-01");
      assert.equal(addDaysTo("2026-12-31", 1), "2027-01-01");
      assert.equal(addDaysTo("2028-02-28", 1), "2028-02-29");
    });
    it("snoozes to tomorrow", () => {
      const {snoozeDateFor} = load();
      assert.equal(snoozeDateFor("tomorrow", "2026-10-22"), "2026-10-23");
      assert.equal(snoozeDateFor("tomorrow", "2026-12-31"), "2027-01-01");
    });
    it("snoozes to the next Monday after today, a week ahead when today is a Monday", () => {
      const {snoozeDateFor} = load();
      for (const [today, monday] of [["2026-10-22", "2026-10-26"], ["2026-10-24", "2026-10-26"], ["2026-10-25", "2026-10-26"], ["2026-10-26", "2026-11-02"], ["2026-10-27", "2026-11-02"], ["2026-12-30", "2027-01-04"]]) {
        assert.equal(snoozeDateFor("monday", today), monday, today);
      }
    });
    it("gives no date for an unknown choice or an unusable today", () => {
      const {snoozeDateFor} = load();
      assert.equal(snoozeDateFor("later", "2026-10-22"), null);
      assert.equal(snoozeDateFor("tomorrow", ""), null);
      assert.equal(snoozeDateFor("monday", undefined), null);
    });
    it("takes a typed day only when it is a date after today", () => {
      const {snoozeDateFromInput} = load();
      assert.equal(snoozeDateFromInput("2026-10-23", "2026-10-22"), "2026-10-23");
      for (const value of ["2026-10-22", "2026-10-01", "", "soon", undefined]) assert.equal(snoozeDateFromInput(value, "2026-10-22"), null, String(value));
    });
    it("is snoozed only while the date is after today", () => {
      const {isSnoozedTask} = load();
      assert.equal(isSnoozedTask({snoozedUntil: "2026-10-23"}, "2026-10-22"), true);
      assert.equal(isSnoozedTask({snoozedUntil: "2026-10-22"}, "2026-10-22"), false);
      assert.equal(isSnoozedTask({snoozedUntil: "2026-10-21"}, "2026-10-22"), false);
      assert.equal(isSnoozedTask({}, "2026-10-22"), false);
      assert.equal(isSnoozedTask({snoozedUntil: "soon"}, "2026-10-22"), false);
    });
    it("words the chip with the day, and has none once the snooze is over", () => {
      const {snoozeChipText} = load();
      assert.match(snoozeChipText({snoozedUntil: "2026-10-25"}, "2026-10-22"), /^Snoozed until Sun,? 25 Oct$/);
      assert.equal(snoozeChipText({snoozedUntil: "2026-10-22"}, "2026-10-22"), "");
      assert.equal(snoozeChipText({}, "2026-10-22"), "");
    });
    it("finds a new time at once only for a scheduled task that is neither pinned nor waiting on materials", () => {
      const {snoozeNeedsReschedule} = load();
      const scheduled = {googleCalendarEventId: "ev1", scheduledStart: "2026-10-23T09:00:00+13:00", scheduledEnd: "2026-10-23T09:30:00+13:00"};
      assert.equal(snoozeNeedsReschedule(scheduled), true);
      assert.equal(snoozeNeedsReschedule({googleCalendarEventId: "ev1"}), true);
      assert.equal(snoozeNeedsReschedule({title: "not on the calendar"}), false);
      assert.equal(snoozeNeedsReschedule({...scheduled, locked: true}), false);
      assert.equal(snoozeNeedsReschedule({...scheduled, materials: [{id: "m", text: "Paint", checked: false}]}), false);
      assert.equal(snoozeNeedsReschedule({...scheduled, materials: [{id: "m", text: "Paint", checked: true}]}), true);
    });
    it("keeps Snooze off the task card, with a dialog outside the edit modal", () => {
      const list = html.slice(html.indexOf("function taskItemHtml"), html.indexOf("function renderTasks"));
      assert.equal(list.includes("data-action"), false);
      assert.equal(list.includes("<button"), false);
      assert.match(list, /snoozeChip\(t\)/);
      const dialog = html.indexOf("id=\"snoozeModal\"");
      assert.ok(dialog > html.indexOf("id=\"editModal\""));
      for (const id of ["snoozeDate", "snoozeSetBtn", "unsnoozeBtn"]) assert.ok(html.indexOf(`id="${id}"`) > dialog, id);
      assert.match(html.slice(html.indexOf("id=\"unsnoozeBtn\""), html.indexOf(">", html.indexOf("id=\"unsnoozeBtn\""))), /hidden/);
    });
  });
  describe("needsRedirectSignIn", () => {
    it("is true for the errors that mean a popup cannot be used here", () => {
      const {needsRedirectSignIn} = load();
      for (const code of ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"]) {
        assert.equal(needsRedirectSignIn(code), true, code);
      }
    });
    it("is false for a closed popup, a cancelled request, other errors and no code", () => {
      const {needsRedirectSignIn} = load();
      for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/network-request-failed", "", undefined]) {
        assert.equal(needsRedirectSignIn(code), false, String(code));
      }
    });
  });
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
    it("keeps the header the same height at the top of the page and scrolled: nothing above it scrolls away", () => {
      const rule = (selector) => {
        const m = html.match(new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`));
        assert.ok(m, `${selector} rule`);
        return m[1];
      };
      // The page has no top margin or padding, so the sticky header sits at the same place scrolled or not
      const body = rule("body");
      assert.match(body, /margin:\s*0 auto 20px/);
      assert.match(body, /padding:\s*0 15px/);
      assert.doesNotMatch(body, /margin-top|padding-top/);
      // Its own top padding is part of the pinned header, so it stays when the page scrolls
      const header = rule("\\.app-header");
      assert.match(header, /padding-top:\s*8px/);
      assert.doesNotMatch(header, /margin-top/);
      assert.doesNotMatch(html, /\bhtml\s*\{[^}]*(margin|padding)/);
    });
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
    it("puts a live search box at the top of the Queue (below the active task), above Tags, redrawing the list as you type", () => {
      const q = at(`id="queueCard"`);
      const search = at(`id="taskSearch"`, q);
      assert.ok(search > q && search < at(`id="tagsDetails"`, q));
      assert.match(html.slice(html.lastIndexOf("<input", search), html.indexOf(">", search)), /type="search"[^>]*placeholder="Search tasks"/);
      const input = html.slice(html.indexOf(`getElementById("taskSearch").addEventListener("input"`), html.indexOf(`getElementById("clearSearchBtn").addEventListener("click"`));
      assert.match(input, /renderTasks\(\)/);
      assert.match(html, /filterTasks\(rest, selectedTagFilter, selectedProjectFilter, document\.getElementById\("taskSearch"\)\.value\)/);
    });
    it("shows a Clear button beside the search box only while it holds text", () => {
      const row = html.slice(at(`class="search-row"`), at("</div>", at(`class="search-row"`)));
      assert.ok(row.indexOf(`id="taskSearch"`) < row.indexOf(`id="clearSearchBtn"`));
      assert.match(row, /id="clearSearchBtn"[^>]*\bhidden\b[^>]*>Clear</);
      assert.match(html, /clearSearchBtn"\)\.hidden = document\.getElementById\("taskSearch"\)\.value === ""/);
      assert.match(html, /\.search-row button\[hidden\]\s*\{\s*display:\s*none/);
    });
    it("lists the tag chips alphabetically", () => {
      const bar = html.slice(html.indexOf("function renderFilterBar"), html.indexOf("function setFilter"));
      assert.match(bar, /sortedTags\(allTasks\)\.forEach/);
    });
    it("has no delete button on the task cards: a task is deleted only from the edit modal, after a confirmation", () => {
      const list = html.slice(html.indexOf("function renderTasks"), html.indexOf("function renderTasks") + 6000);
      assert.doesNotMatch(list, /data-action="delete"|delete-btn/);
      assert.doesNotMatch(html, /\.delete-btn/);
      const click = html.slice(html.indexOf(`getElementById("taskList").addEventListener("click"`), html.indexOf(`getElementById("taskList").addEventListener("click"`) + 700);
      assert.doesNotMatch(click, /deleteTask/);
      const fromModal = html.slice(html.indexOf("async function deleteTaskFromModal"), html.indexOf("async function deleteTask("));
      assert.match(fromModal, /if \(!confirm\("Delete this task\?"\)\) return;\s*const taskId/);
      assert.ok(fromModal.indexOf("confirm(") < fromModal.indexOf("closeEditModal()"), "cancelling keeps the modal open");
    });
    it("has an Undo footnote at the bottom of the page, shown after a delete or completion and kept until the server's window ends", () => {
      const note = at(`id="undoNote"`);
      assert.ok(note > at("</main>", at(`id="pageSettings"`)) && note < at(`id="editModal"`));
      assert.match(html.slice(html.lastIndexOf("<", note), note), /^<footer /);
      assert.match(html, /\.undo-note\[hidden\]\s*\{\s*display:\s*none/);
      assert.match(html, /const UNDO_URL = endpoint\("undoRemove"\)/);
      assert.match(html, /showUndoNote\(kind, task\.title\)/);
      assert.match(html, /removeTask\(taskId, "COMPLETE"/);
      assert.match(html, /removeTask\(taskId, "DELETE"/);
      assert.equal(/toast/i.test(html), false);
      const {UNDO_WINDOW_MS, UNDO_NOTE_MS} = load();
      const server = fs.readFileSync(path.join(__dirname, "..", "tasks.js"), "utf8");
      assert.match(server, new RegExp(`UNDO_WINDOW_MS = ${UNDO_WINDOW_MS / 60000} \\* 60 \\* 1000`), "the page's window matches the server's");
      assert.ok(UNDO_NOTE_MS < UNDO_WINDOW_MS && UNDO_NOTE_MS > 8000);
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

  describe("sortedTags", () => {
    it("lists each tag once, alphabetically, whatever order the tasks use them in", () => {
      const tasks = [{tags: ["Work", "Indoor"]}, {tags: ["Outdoor", "Work"]}, {tags: ["Errand"]}];
      assert.deepEqual(load().sortedTags(tasks), ["Errand", "Indoor", "Outdoor", "Work"]);
    });
    it("ignores case when sorting and keeps both spellings, capitalised first on a tie", () => {
      const tasks = [{tags: ["banana", "Apple", "cherry"]}, {tags: ["Banana", "apple"]}];
      assert.deepEqual(load().sortedTags(tasks), ["Apple", "apple", "Banana", "banana", "cherry"]);
    });
    it("copes with tasks without tags, and does not modify them", () => {
      const tasks = [{}, {tags: ["b", "a"]}, {tags: []}];
      assert.deepEqual(load().sortedTags(tasks), ["a", "b"]);
      assert.deepEqual(tasks[1].tags, ["b", "a"]);
      assert.deepEqual(load().sortedTags([]), []);
    });
  });

  describe("removalMessage", () => {
    it("says what was done to the task", () => {
      const h = load();
      assert.equal(h.removalMessage("COMPLETE", "Mow lawn"), "Completed “Mow lawn”");
      assert.equal(h.removalMessage("DELETE", "Mow lawn"), "Deleted “Mow lawn”");
    });
    it("shortens a long title to 40 characters including the ellipsis", () => {
      const msg = load().removalMessage("DELETE", "A".repeat(60));
      assert.equal(msg, `Deleted “${"A".repeat(39)}…”`);
    });
    it("leaves a title of exactly 40 characters alone, and copes with a missing one", () => {
      const h = load();
      assert.equal(h.removalMessage("COMPLETE", "B".repeat(40)), `Completed “${"B".repeat(40)}”`);
      assert.equal(h.removalMessage("DELETE", ""), "Deleted task");
      assert.equal(h.removalMessage("COMPLETE", undefined), "Completed task");
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

  describe("jobSheetPayload", () => {
    it("sends the contractor text alone, as typed, for the server to clean", () => {
      assert.deepEqual(load().jobSheetPayload("A Builder\nPh 021"), {jobSheet: {contractorInfo: "A Builder\nPh 021"}});
    });
    it("sends empty text for nothing, so the information can be cleared", () => {
      for (const v of ["", undefined, null]) assert.deepEqual(load().jobSheetPayload(v), {jobSheet: {contractorInfo: ""}});
    });
    it("takes the settings round trip through the server's validation", () => {
      const {applySettingsUpdate, mergeSettings} = require("../settings");
      const r = applySettingsUpdate(mergeSettings(undefined), load().jobSheetPayload(" Ph 021 \n"));
      assert.equal(r.settings.jobSheet.contractorInfo, " Ph 021");
    });
  });

  describe("settingsPayload", () => {
    const form = {location: {name: "Oslo", latitude: 59.9, longitude: 10.7, extra: "dropped"}, timeZone: "Europe/Oslo", scheduleDays: "14", gapMinutes: "10", scheduleOrder: "NUMBER", dayStart: "08:30", dayEnd: "16:00", lunchEnabled: 1, lunchTime: "12:30", lunchMinutes: "45", enabled: 1, frequency: "INTERVAL", time: "06:30", intervalMinutes: "30"};
    it("builds the updateSettings body from the form", () => {
      const h = load();
      assert.deepEqual(h.settingsPayload(form), {
        location: {name: "Oslo", latitude: 59.9, longitude: 10.7},
        timeZone: "Europe/Oslo",
        scheduleDays: 14,
        gapMinutes: 10,
        scheduleOrder: "NUMBER",
        day: {start: "08:30", end: "16:00"},
        lunch: {enabled: true, time: "12:30", minutes: 45},
        schedule: {enabled: true, frequency: "INTERVAL", time: "06:30", intervalMinutes: 30},
      });
    });
    it("sends URGENCY for anything but NUMBER", () => {
      const h = load();
      assert.equal(h.settingsPayload({...form, scheduleOrder: undefined}).scheduleOrder, "URGENCY");
      assert.equal(h.settingsPayload({...form, scheduleOrder: "bogus"}).scheduleOrder, "URGENCY");
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
      assert.equal(r.settings.scheduleOrder, "NUMBER");
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
    it("applies a search together with the tag and project filters", () => {
      const h = load();
      const list = [
        {id: "a", title: "Mow lawn", tags: ["Outdoor"], projectId: "p1"},
        {id: "b", title: "Mow verge", tags: ["Outdoor"], projectId: "p2"},
        {id: "c", title: "Mop floor", tags: ["Indoor"], projectId: "p1"},
      ];
      assert.deepEqual(ids(h.filterTasks(list, null, null, "mo")), ["a", "b", "c"]);
      assert.deepEqual(ids(h.filterTasks(list, null, null, "mow")), ["a", "b"]);
      assert.deepEqual(ids(h.filterTasks(list, "Outdoor", "p1", "mow")), ["a"]);
      assert.deepEqual(ids(h.filterTasks(list, "Indoor", null, "mow")), []);
      assert.deepEqual(ids(h.filterTasks(list, null, null, "   ")), ["a", "b", "c"]);
    });
    it("copes with tasks without tags, and does not modify its input", () => {
      const copy = JSON.stringify(tasks);
      assert.deepEqual(ids(load().filterTasks(tasks, "Indoor", null)), ["c"]);
      assert.equal(JSON.stringify(tasks), copy);
    });
  });
  describe("matchesSearch", () => {
    const task = {id: "a", title: "Fit the Sink", tags: ["Plumbing"], projectId: "p1", materials: [{id: "m1", text: "Sealant", checked: false}]};
    const find = (q, t = task) => load().matchesSearch(t, q);
    it("matches everything for an empty or blank search", () => {
      for (const q of ["", "  ", undefined, null]) assert.equal(find(q), true);
    });
    it("ignores case and matches part of a word in the title", () => {
      assert.equal(find("sink"), true);
      assert.equal(find("FIT TH"), true);
      assert.equal(find("ink"), true);
      assert.equal(find("tap"), false);
    });
    it("needs every word to be in the title, in any order", () => {
      assert.equal(find("sink fit"), true);
      assert.equal(find("sink garden"), false);
    });
    it("searches the title only, not tags, project or materials", () => {
      assert.equal(find("plumbing"), false);
      assert.equal(find("sealant"), false);
      assert.equal(find("p1"), false);
    });
    it("copes with a task without a usable title", () => {
      assert.equal(find("x", {id: "b"}), false);
      assert.equal(find("x", {id: "b", title: 5}), false);
    });
  });
  describe("Settings: delete duplicate tasks", () => {
    it("asks the server first with a dry run, then deletes only after a confirmation", () => {
      const fn = html.slice(html.indexOf("async function removeDuplicateTasks"), html.indexOf("async function downloadExport"));
      assert.match(fn, /post\(\{ dryRun: true \}\)/);
      assert.ok(fn.indexOf("dryRun: true") < fn.indexOf("confirm("));
      assert.ok(fn.indexOf("confirm(") < fn.indexOf("post({})"));
      assert.ok(html.includes("id=\"dedupBtn\""));
      assert.match(html, /endpoint\("removeDuplicateTasks"\)/);
    });
  });

  describe("manualTaskBody with a new project", () => {
    const form = {title: "Tile floor", priority: "MEDIUM", estimatedMinutes: "60", tags: "", dueDate: "", newProjectName: "  Bathroom reno ", projectOrder: "3"};
    it("sends the name and the order, never a project id", () => {
      const {manual} = load().manualTaskBody({...form, projectId: "stale"});
      assert.equal(manual.newProject, "Bathroom reno");
      assert.equal(manual.projectOrder, 3);
      assert.equal("projectId" in manual, false);
    });
    it("sends an empty order as null and ignores a blank name", () => {
      assert.equal(load().manualTaskBody({...form, projectOrder: ""}).manual.projectOrder, null);
      const {manual} = load().manualTaskBody({...form, newProjectName: "   ", projectId: "p1"});
      assert.equal("newProject" in manual, false);
      assert.equal(manual.projectId, "p1");
    });
    it("is accepted by the server-side change builder", () => {
      const {manualTaskChange} = require("../tasks");
      assert.equal(manualTaskChange(load().manualTaskBody(form).manual).title, "Tile floor");
    });
    it("has the page offer the choice and close the details form after an add", () => {
      assert.ok(html.includes("id=\"manualNewProject\""));
      assert.match(html, /new Option\("＋ New project…", NEW_PROJECT\)/);
      const finish = html.slice(html.indexOf("function finishAdd"), html.indexOf("The project suggestion dialog"));
      assert.match(finish, /manualToggle"\)\.checked = false/);
      assert.match(finish, /manualFields"\)\.hidden = true/);
      assert.match(finish, /data\.project && data\.projects/);
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
    it("adds trimmed comments only when there are some", () => {
      assert.equal(load().manualTaskBody({...form, comments: "  Use the blue paint.\nAsk Sam. "}).manual.comments, "Use the blue paint.\nAsk Sam.");
      for (const comments of ["", "   ", undefined]) assert.equal("comments" in load().manualTaskBody({...form, comments}).manual, false, JSON.stringify(comments));
    });
    it("gives a new task its comments through the server-side merge", () => {
      const {manualTaskChange, mergeTaskChanges} = require("../tasks");
      const body = load().manualTaskBody({...form, comments: " Hinge is loose "}).manual;
      const merged = mergeTaskChanges([], [manualTaskChange(body)], () => "id1", [], {comments: true});
      assert.equal(merged.tasks[0].comments, "Hinge is loose");
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
    it("completePrompt: names the task and mentions the next occurrence of a repeating one", () => {
      const {completePrompt: c} = load();
      assert.equal(c({title: "Mow lawn"}), "Mark \"Mow lawn\" as complete?");
      assert.equal(c({title: "Mow lawn", recurrence: {frequency: "WEEKLY", interval: 1}}), "Mark \"Mow lawn\" as complete? It repeats, so its next occurrence will be added.");
      assert.equal(c(undefined), "Mark this task as complete?");
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

  describe("Stats summary", () => {
    it("fmtMinutes and decimalHours: words and decimal hours", () => {
      const {fmtMinutes, decimalHours} = load();
      assert.equal(fmtMinutes(0), "0m");
      assert.equal(fmtMinutes(45), "45m");
      assert.equal(fmtMinutes(65), "1h 5m");
      assert.equal(fmtMinutes(120), "2h");
      assert.equal(decimalHours(0), "0.00");
      assert.equal(decimalHours(200), "3.33");
      assert.equal(decimalHours(90), "1.50");
      assert.equal(decimalHours("x"), "0.00");
    });
    it("hoursText: words and decimal hours, with the estimated part when there is one", () => {
      const {hoursText} = load();
      assert.equal(hoursText(200, 0), "3h 20m (3.33 h)");
      assert.equal(hoursText(200), "3h 20m (3.33 h)");
      assert.equal(hoursText(200, 30), "3h 20m (3.33 h) · 30m est.");
      assert.equal(hoursText(0, 0), "0m (0.00 h)");
    });
    it("projectWeekText: the hours and task count of a week, singular for one task", () => {
      const {projectWeekText} = load();
      assert.equal(projectWeekText({count: 4, minutes: 200, estimatedMinutes: 0}), "3h 20m (3.33 h) · 4 tasks");
      assert.equal(projectWeekText({count: 1, minutes: 30, estimatedMinutes: 30}), "30m (0.50 h) · 30m est. · 1 task");
    });
    it("weekRangeText: the Monday-to-Sunday span of a week, across a month or year end", () => {
      const {weekRangeText} = load();
      assert.equal(weekRangeText("2026-10-19"), "19 Oct – 25 Oct");
      assert.equal(weekRangeText("2026-10-26"), "26 Oct – 1 Nov");
      assert.equal(weekRangeText("2026-12-28"), "28 Dec – 3 Jan");
      assert.equal(weekRangeText("nonsense"), "nonsense");
    });
    it("pickStatsProject: keeps the current choice while it exists, else the project with the newest week", () => {
      const {pickStatsProject} = load();
      const entries = [
        {projectId: "a", weeks: [{weekStart: "2026-10-05"}]},
        {projectId: "b", weeks: [{weekStart: "2026-10-19"}, {weekStart: "2026-10-12"}]},
        {projectId: "c", weeks: [{weekStart: "2026-10-12"}]},
      ];
      assert.equal(pickStatsProject(entries, "c"), "c");
      assert.equal(pickStatsProject(entries, "gone"), "b");
      assert.equal(pickStatsProject(entries, null), "b");
      assert.equal(pickStatsProject([entries[0], entries[2]], null), "c");
      assert.equal(pickStatsProject([], "a"), null);
      assert.equal(pickStatsProject(undefined, null), null);
    });
    it("parseTagList: trims and drops empty entries", () => {
      const {parseTagList} = load();
      assert.deepEqual(parseTagList(" Home ,, Paid ,"), ["Home", "Paid"]);
      assert.deepEqual(parseTagList(""), []);
      assert.deepEqual(parseTagList(undefined), []);
    });
    it("zonedDateTime: the date and time of day on a zone's wall clock", () => {
      const {zonedDateTime} = load();
      assert.deepEqual(zonedDateTime("2026-10-17T20:30:00.000Z", "Pacific/Auckland"), {date: "2026-10-18", time: "09:30"});
      assert.deepEqual(zonedDateTime("2026-10-25T11:30:00Z", "Pacific/Auckland"), {date: "2026-10-26", time: "00:30"});
      assert.deepEqual(zonedDateTime("2026-07-01T00:00:00Z", "Pacific/Auckland"), {date: "2026-07-01", time: "12:00"});
      assert.deepEqual(zonedDateTime("nope", "Pacific/Auckland"), {date: "", time: ""});
    });
    describe("completed task edit form", () => {
      const NZ = "Pacific/Auckland";
      const row = {title: "Mow lawn", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 125, tags: ["Garden", "Outdoor"], comments: "Front only", projectId: "p1", completedAt: "2026-10-17T20:30:00.000Z"};
      const same = (load_) => load_.completedFormValues(row, NZ);

      it("completedFormValues: starts the form from the row, with the time in minutes and the completion on the zone's clock", () => {
        const {completedFormValues} = load();
        assert.deepEqual(completedFormValues(row, NZ), {priority: "LOW", estimatedMinutes: 30, trackedMinutes: 2, tags: "Garden, Outdoor", materials: "", comments: "Front only", projectId: "p1", date: "2026-10-18", time: "09:30"});
      });
      it("reopenPrompt: names the task, says it returns with its tracked time and leaves Stats", () => {
        const {reopenPrompt} = load();
        const text = reopenPrompt({title: "Mow lawn", trackedSeconds: 2700});
        assert.match(text, /^Reopen "Mow lawn"\?/);
        assert.match(text, /returns to the end of the queue with its 45m of tracked time and leaves Stats and Project hours until it is completed again\./);
        assert.doesNotMatch(text, /repeats/);
      });
      it("reopenPrompt: leaves the time out when there is none, and warns that a repeating task comes back without repeating", () => {
        const {reopenPrompt} = load();
        assert.doesNotMatch(reopenPrompt({title: "Mow lawn", trackedSeconds: 0}), /tracked time/);
        assert.doesNotMatch(reopenPrompt({title: "Mow lawn"}), /tracked time/);
        assert.match(reopenPrompt({title: "Mow lawn", recurrence: {frequency: "WEEKLY", interval: 1}}), /It repeats, and its next occurrence is already in the queue, so this one comes back without repeating\./);
        assert.match(reopenPrompt(null), /^Reopen this task\?/);
      });
      it("the Reopen button sits in the completed form and reopens through its own endpoint, saving unsaved edits first", () => {
        assert.match(html, /<button class="btn-secondary" onclick="reopenCompletedEntry\(\)">Reopen<\/button>/);
        assert.match(html, /const REOPEN_COMPLETED_URL = endpoint\("reopenCompletedTask"\);/);
        const fn = html.slice(html.indexOf("async function reopenCompletedEntry"), html.indexOf("async function deleteCompletedEntry"));
        assert.match(fn, /confirm\(reopenPrompt\(\{ \.\.\.row, \.\.\.result\.fields \}\)\)/);
        assert.ok(fn.indexOf("UPDATE_COMPLETED_URL") < fn.indexOf("REOPEN_COMPLETED_URL"), "edits are saved before the reopen");
        assert.match(fn, /setTasks\(data\.tasks \|\| allTasks\)/);
        assert.match(fn, /templates = null;/);
        assert.match(fn, /await fetchCompleted\(\);/);
        assert.match(fn, /alert\("Failed to reopen: " \+ err\.message\)/);
      });
      it("completedFormValues: falls back for a row missing fields", () => {
        const {completedFormValues} = load();
        const v = completedFormValues({completedAt: "2026-10-17T20:30:00.000Z"}, NZ);
        assert.deepEqual([v.priority, v.estimatedMinutes, v.trackedMinutes, v.tags, v.comments, v.projectId], ["MEDIUM", 15, 0, "", "", ""]);
      });
      it("completedChanges: sends nothing for an untouched form, so a tracked time is not rounded just by saving", () => {
        const api = load();
        assert.deepEqual(api.completedChanges(row, same(api), NZ), {fields: {}});
      });
      it("completedChanges: sends only what changed", () => {
        const api = load();
        const form = {...same(api), priority: "HIGH", trackedMinutes: "90", tags: "Garden, Paid", projectId: "", date: "2026-10-19", time: "10:15", comments: "  Front and back  "};
        assert.deepEqual(api.completedChanges(row, form, NZ), {fields: {priority: "HIGH", trackedSeconds: 5400, tags: ["Garden", "Paid"], comments: "Front and back", projectId: null, completedDate: "2026-10-19", completedTime: "10:15"}});
      });
      it("completedChanges: clears the comments with empty text and the time with 0 or an empty box", () => {
        const api = load();
        assert.deepEqual(api.completedChanges(row, {...same(api), comments: "   "}, NZ), {fields: {comments: null}});
        assert.deepEqual(api.completedChanges(row, {...same(api), trackedMinutes: "0"}, NZ), {fields: {trackedSeconds: 0}});
        assert.deepEqual(api.completedChanges(row, {...same(api), trackedMinutes: ""}, NZ), {fields: {trackedSeconds: 0}});
      });
      it("completed materials: listed one per line from the stored items or texts, and sent as a plain list only when changed", () => {
        const api = load();
        const withMats = {...row, materials: [{id: "a", text: "Tap", checked: false}, {id: "b", text: " PTFE tape ", checked: true}, {id: "c", text: "  "}]};
        assert.deepEqual(api.completedMaterialTexts(withMats), ["Tap", "PTFE tape"]);
        assert.equal(api.completedFormValues(withMats, NZ).materials, "Tap\nPTFE tape");
        assert.deepEqual(api.parseMaterialLines(" Tap \r\n\n  PTFE tape\n"), ["Tap", "PTFE tape"]);
        assert.deepEqual(api.completedChanges(withMats, api.completedFormValues(withMats, NZ), NZ), {fields: {}});
        assert.deepEqual(api.completedChanges(withMats, {...api.completedFormValues(withMats, NZ), materials: "Tap\n\nPTFE tape\nWasher"}, NZ), {fields: {materials: ["Tap", "PTFE tape", "Washer"]}});
        assert.deepEqual(api.completedChanges(withMats, {...api.completedFormValues(withMats, NZ), materials: "  \n"}, NZ), {fields: {materials: null}});
        assert.deepEqual(api.completedChanges(row, {...same(api), materials: "Brush"}, NZ), {fields: {materials: ["Brush"]}});
        assert.deepEqual(api.completedChanges(row, {...same(api), materials: ""}, NZ), {fields: {}});
      });
      it("completedChanges: sends the project only when it changed, null for none", () => {
        const api = load();
        assert.deepEqual(api.completedChanges(row, {...same(api), projectId: "p2"}, NZ), {fields: {projectId: "p2"}});
        assert.deepEqual(api.completedChanges({...row, projectId: undefined}, {...same(api), projectId: ""}, NZ), {fields: {}});
      });
      it("completedChanges: reports an unusable estimate, time, date or time of day", () => {
        const api = load();
        assert.match(api.completedChanges(row, {...same(api), estimatedMinutes: "0"}, NZ).error, /estimate/);
        assert.match(api.completedChanges(row, {...same(api), estimatedMinutes: ""}, NZ).error, /estimate/);
        assert.match(api.completedChanges(row, {...same(api), trackedMinutes: "-5"}, NZ).error, /time spent/);
        assert.match(api.completedChanges(row, {...same(api), trackedMinutes: "abc"}, NZ).error, /time spent/);
        assert.match(api.completedChanges(row, {...same(api), date: ""}, NZ).error, /date and time/);
        assert.match(api.completedChanges(row, {...same(api), time: ""}, NZ).error, /date and time/);
      });
      it("completedChanges: needs both the date and the time of day even when only one changed", () => {
        const api = load();
        assert.deepEqual(api.completedChanges(row, {...same(api), time: "11:00"}, NZ), {fields: {completedDate: "2026-10-18", completedTime: "11:00"}});
      });
    });
    describe("completed list search and pages", () => {
      const rowsOf = (n) => Array.from({length: n}, (_, i) => ({archiveId: `a${i}`, title: `Job ${i}`}));
      const noProject = () => "";
      it("matchesCompletedSearch: every word must appear in the title, tags, materials, comments or project, in any order and case", () => {
        const {matchesCompletedSearch: m} = load();
        const row = {title: "Fit tap", tags: ["Plumbing"], materials: [{id: "a", text: "PTFE tape"}], comments: "Washer replaced", projectId: "p1"};
        assert.equal(m(row, "", ""), true);
        assert.equal(m(row, "   ", ""), true);
        assert.equal(m(row, "TAP plumb", ""), true);
        assert.equal(m(row, "ptfe", ""), true);
        assert.equal(m(row, "washer fit", ""), true);
        assert.equal(m(row, "kitchen", "Kitchen reno"), true);
        assert.equal(m(row, "kitchen", ""), false);
        assert.equal(m(row, "tap bathroom", "Kitchen reno"), false);
      });
      it("matchesCompletedSearch: #123 finds job number 123 exactly, alone or with other words", () => {
        const {matchesCompletedSearch: m} = load();
        const row = {title: "Fit tap", jobNumber: 123, projectId: "p1"};
        assert.equal(m(row, "#123", ""), true);
        assert.equal(m(row, "#0123", ""), true);
        assert.equal(m(row, "#12", ""), false);
        assert.equal(m(row, "#1234", ""), false);
        assert.equal(m(row, "#124", ""), false);
        assert.equal(m(row, "#123 tap", ""), true);
        assert.equal(m(row, "#123 basin", ""), false);
        assert.equal(m(row, "#123 kitchen", "Kitchen reno"), true);
        assert.equal(m({title: "Fit tap"}, "#123", ""), false);
        assert.equal(m({title: "Fit tap", jobNumber: "123"}, "#123", ""), false);
        assert.equal(m(row, "#", ""), true);
        assert.equal(m(row, "# tap", ""), true);
        assert.equal(m({title: "Item #5a"}, "#5a", ""), true);
      });
      it("matchesCompletedSearch: copes with rows missing fields and with odd types", () => {
        const {matchesCompletedSearch: m} = load();
        assert.equal(m({}, "x", ""), false);
        assert.equal(m({}, "", ""), true);
        assert.equal(m({title: "Mow", tags: [5, null, "Lawn"], materials: "junk", comments: 7}, "lawn", undefined), true);
        assert.equal(m({title: "Mow"}, undefined, ""), true);
      });
      it("completedBrowse: pages the newest-first list 50 to a page, keeping its order", () => {
        const {completedBrowse, COMPLETED_PAGE_SIZE} = load();
        assert.equal(COMPLETED_PAGE_SIZE, 50);
        const rows = rowsOf(120);
        const p1 = completedBrowse(rows, "", 1, noProject);
        assert.deepEqual([p1.items.length, p1.page, p1.pages, p1.total, p1.all, p1.from, p1.to], [50, 1, 3, 120, 120, 1, 50]);
        assert.equal(p1.items[0].archiveId, "a0");
        const p3 = completedBrowse(rows, "", 3, noProject);
        assert.deepEqual([p3.items.length, p3.from, p3.to, p3.items[0].archiveId], [20, 101, 120, "a100"]);
      });
      it("completedBrowse: clamps an out-of-range or unusable page", () => {
        const {completedBrowse} = load();
        const rows = rowsOf(120);
        assert.equal(completedBrowse(rows, "", 99, noProject).page, 3);
        for (const page of [0, -4, NaN, undefined, "x"]) assert.equal(completedBrowse(rows, "", page, noProject).page, 1, String(page));
        assert.equal(completedBrowse(rows, "", "2", noProject).page, 2);
      });
      it("completedBrowse: pages only the matches, and says so when none match or there are no rows", () => {
        const {completedBrowse} = load();
        const rows = rowsOf(120);
        const b = completedBrowse(rows, "job 11", 1, noProject);
        assert.deepEqual(b.items.map((r) => r.archiveId), ["a11", "a110", "a111", "a112", "a113", "a114", "a115", "a116", "a117", "a118", "a119"]);
        assert.deepEqual([b.total, b.all, b.pages], [11, 120, 1]);
        const none = completedBrowse(rows, "zzz", 4, noProject);
        assert.deepEqual([none.items.length, none.page, none.pages, none.total, none.from, none.to], [0, 1, 1, 0, 0, 0]);
        assert.deepEqual([completedBrowse([], "", 1, noProject).total, completedBrowse(undefined, "", 1).total], [0, 0]);
      });
      it("completedBrowse: matches a task's project by the name the page looks up", () => {
        const {completedBrowse} = load();
        const rows = [{archiveId: "x", title: "Fit tap", projectId: "p1"}, {archiveId: "y", title: "Mow lawn"}];
        const names = (id) => ({p1: "Kitchen reno"})[id];
        assert.deepEqual(completedBrowse(rows, "kitchen", 1, names).items.map((r) => r.archiveId), ["x"]);
        assert.deepEqual(completedBrowse(rows, "kitchen", 1).items, []);
      });
      it("pagerItems: has no links for a single page", () => {
        const {pagerItems} = load();
        assert.deepEqual(pagerItems(1, 1), []);
        assert.deepEqual(pagerItems(1, 0), []);
      });
      it("pagerItems: gives Previous, every page number when there are few, and Next, disabled at the ends", () => {
        const {pagerItems} = load();
        const label = (it) => (it.kind === "page" ? (it.current ? `[${it.page}]` : String(it.page)) : it.kind === "gap" ? "..." : `${it.kind}${it.disabled ? "-off" : ""}`);
        assert.equal(pagerItems(1, 3).map(label).join(" "), "prev-off [1] 2 3 next");
        assert.equal(pagerItems(3, 3).map(label).join(" "), "prev 1 2 [3] next-off");
        assert.deepEqual(pagerItems(2, 3).filter((i) => i.kind === "prev" || i.kind === "next").map((i) => i.page), [1, 3]);
      });
      it("pagerItems: keeps the first and last page and two either side of the current, with a gap where more are skipped", () => {
        const {pagerItems} = load();
        const label = (it) => (it.kind === "page" ? (it.current ? `[${it.page}]` : String(it.page)) : it.kind === "gap" ? "..." : it.kind);
        assert.equal(pagerItems(1, 20).map(label).join(" "), "prev [1] 2 3 ... 20 next");
        assert.equal(pagerItems(10, 20).map(label).join(" "), "prev 1 ... 8 9 [10] 11 12 ... 20 next");
        assert.equal(pagerItems(20, 20).map(label).join(" "), "prev 1 ... 18 19 [20] next");
        assert.equal(pagerItems(4, 20).map(label).join(" "), "prev 1 2 3 [4] 5 6 ... 20 next");
      });
      it("completedCountText: words the range, the matches and what was not loaded", () => {
        const {completedBrowse, completedCountText} = load();
        const rows = rowsOf(120);
        assert.equal(completedCountText(completedBrowse(rows, "", 2, noProject), "", false), "Showing 51\u2013100 of 120 completed tasks.");
        assert.equal(completedCountText(completedBrowse(rows, "job 11", 1, noProject), "job 11", false), "Showing 1\u201311 of 11 matches (120 completed tasks).");
        assert.equal(completedCountText(completedBrowse(rows, "job 119", 1, noProject), "job 119", false), "Showing 1 of 1 match (120 completed tasks).");
        assert.equal(completedCountText(completedBrowse(rows, "zzz", 1, noProject), "zzz", false), "No completed tasks match the search.");
        assert.equal(completedCountText(completedBrowse(rows, "", 1, noProject), "", true), "Showing 1\u201350 of 120 completed tasks. Only the newest 120 are loaded.");
      });
    });
    it("jobStatsText: words the window count, total, average and estimate", () => {
      const {jobStatsText} = load();
      assert.equal(jobStatsText({count: 6, completedCount: 24, averageMinutes: 45, estimatedMinutes: 40}, 8), "6 in 8 wks · 24 total · avg 45m · est. 40m");
      assert.equal(jobStatsText({count: 2, completedCount: 2, averageMinutes: 65, estimatedMinutes: 60}, 8), "2 in 8 wks · 2 total · avg 1h 5m · est. 1h");
    });
    it("jobStatsText: leaves out an average or estimate the job does not have", () => {
      const {jobStatsText} = load();
      assert.equal(jobStatsText({count: 3, completedCount: 3, averageMinutes: null, estimatedMinutes: 15}, 8), "3 in 8 wks · 3 total · est. 15m");
      assert.equal(jobStatsText({count: 3, completedCount: 3, averageMinutes: null, estimatedMinutes: null}, 8), "3 in 8 wks · 3 total");
    });
    it("streakText: words the current and longest streak, singular for one day", () => {
      const {streakText} = load();
      assert.equal(streakText({current: 3, longest: 9, currentLimited: false, longestLimited: false}), "Current streak: 3 days · Longest: 9 days");
      assert.equal(streakText({current: 1, longest: 1, currentLimited: false, longestLimited: false}), "Current streak: 1 day · Longest: 1 day");
    });
    it("streakText: says so when there is no current streak, and marks a number that may be larger with a +", () => {
      const {streakText} = load();
      assert.equal(streakText({current: 0, longest: 4, currentLimited: false, longestLimited: false}), "Current streak: none right now · Longest: 4 days");
      assert.equal(streakText({current: 56, longest: 56, currentLimited: true, longestLimited: true}), "Current streak: 56+ days · Longest: 56+ days");
      assert.equal(streakText({current: 2, longest: 10, currentLimited: false, longestLimited: true}), "Current streak: 2 days · Longest: 10+ days");
    });
    it("streakText: is empty without streak data or any completion", () => {
      const {streakText} = load();
      for (const bad of [undefined, null, {}, {current: 0, longest: 0}]) assert.equal(streakText(bad), "", String(JSON.stringify(bad)));
    });
    it("statProjectName: the project's name, or Deleted project for the shared entry without one", () => {
      const {statProjectName} = load();
      assert.equal(statProjectName({projectId: "p1", name: "Kitchen reno"}), "Kitchen reno");
      assert.equal(statProjectName({projectId: null, name: null}), "Deleted project");
      assert.equal(statProjectName({name: ""}), "Deleted project");
      assert.equal(statProjectName(undefined), "Deleted project");
    });
    it("the summary shows the streak and a By project section built from the summary's fields", () => {
      assert.match(html, /streakText\(summary\.streak\)/);
      assert.match(html, /summary\.byProject/);
      assert.match(html, /By project/);
    });
  });

  describe("dark mode toggle", () => {
    it("keeps the choice under one key, the one the early script in the head reads", () => {
      assert.equal(load().THEME_KEY, "taskhub-theme");
      assert.ok(html.includes(`localStorage.getItem("${load().THEME_KEY}")`));
    });
    it("normalizeTheme: only light and dark are choices, anything else follows the device", () => {
      const {normalizeTheme} = load();
      assert.equal(normalizeTheme("light"), "light");
      assert.equal(normalizeTheme("dark"), "dark");
      for (const other of [null, undefined, "", "auto", "Dark", "blue", 1]) assert.equal(normalizeTheme(other), "auto", String(other));
    });
    it("isDarkTheme: a chosen theme wins, otherwise the device decides", () => {
      const {isDarkTheme} = load();
      assert.equal(isDarkTheme("dark", false), true);
      assert.equal(isDarkTheme("light", true), false);
      assert.equal(isDarkTheme("auto", true), true);
      assert.equal(isDarkTheme(null, false), false);
    });
    it("themeFromToggle: ticked is dark, unticked is light", () => {
      const {themeFromToggle} = load();
      assert.equal(themeFromToggle(true), "dark");
      assert.equal(themeFromToggle(false), "light");
    });
    it("themeMetaMedia: a choice fixes the browser UI colour, auto restores the device queries", () => {
      const {themeMetaMedia} = load();
      assert.deepEqual(themeMetaMedia("dark"), {light: "not all", dark: "all"});
      assert.deepEqual(themeMetaMedia("light"), {light: "all", dark: "not all"});
      assert.deepEqual(themeMetaMedia("auto"), {light: "(prefers-color-scheme: light)", dark: "(prefers-color-scheme: dark)"});
    });
    it("has a Dark mode checkbox on the Settings page, outside the saved settings form", () => {
      const page = html.slice(html.indexOf("id=\"pageSettings\""), html.indexOf("id=\"undoNote\""));
      assert.match(page, /<input type="checkbox" id="darkMode"> Dark mode/);
      assert.equal(/settingsPayload[^;]*darkMode|darkMode[^;]*settingsPayload/.test(html), false);
    });
  });

  describe("data export", () => {
    it("jobSheetFilename: names a task, project week or project to date, folding accents to ASCII words", () => {
      const {jobSheetFilename} = load();
      assert.equal(jobSheetFilename({kind: "WEEK", name: "Kitchen reno", weekStart: "2026-10-19", date: "2026-10-24"}), "jobsheet-kitchen-reno-week-2026-10-19.pdf");
      assert.equal(jobSheetFilename({kind: "PROJECT", name: "Kitchen reno", date: "2026-10-24"}), "jobsheet-kitchen-reno-to-2026-10-24.pdf");
      assert.equal(jobSheetFilename({kind: "TASK", name: "Fit tap", date: "2026-10-20"}), "jobsheet-fit-tap-2026-10-20.pdf");
      assert.equal(jobSheetFilename({kind: "PROJECT", name: "Whangaparāoa — Māori St!", date: "2026-10-24"}), "jobsheet-whangaparaoa-maori-st-to-2026-10-24.pdf");
    });
    it("jobSheetFilename: shortens long names, falls back to job, and leaves off a missing date", () => {
      const {jobSheetFilename} = load();
      const long = jobSheetFilename({kind: "TASK", name: "a".repeat(30) + " " + "b".repeat(30), date: "2026-10-20"});
      assert.equal(long, `jobsheet-${"a".repeat(30)}-${"b".repeat(9)}-2026-10-20.pdf`);
      assert.equal(jobSheetFilename({kind: "TASK", name: "🌿🌿", date: "2026-10-20"}), "jobsheet-job-2026-10-20.pdf");
      assert.equal(jobSheetFilename({kind: "PROJECT", name: undefined, date: "soon"}), "jobsheet-job.pdf");
      assert.equal(jobSheetFilename({kind: "WEEK", name: "X", weekStart: "bad", date: "2026-10-24"}), "jobsheet-x.pdf");
    });
    it("exportFilename: dates the file, or leaves the date off when there is none", () => {
      const {exportFilename} = load();
      assert.equal(exportFilename("2026-10-24"), "taskhub-export-2026-10-24.json");
      for (const bad of ["", undefined, null, "today"]) assert.equal(exportFilename(bad), "taskhub-export.json", String(bad));
    });
    it("exportSummary: counts what the file holds, singular for one", () => {
      const {exportSummary} = load();
      assert.equal(exportSummary({tasks: [1, 2], projects: [1], completedTasks: Array(5).fill(1)}), "2 tasks, 1 project, 5 completed");
      assert.equal(exportSummary({tasks: [1], projects: [], completedTasks: [1]}), "1 task, 0 projects, 1 completed task");
    });
    it("exportSummary: copes with missing lists and notes a cut-off archive", () => {
      const {exportSummary} = load();
      assert.equal(exportSummary({}), "0 tasks, 0 projects, 0 completed");
      assert.equal(exportSummary(undefined), "0 tasks, 0 projects, 0 completed");
      assert.equal(exportSummary({tasks: [], projects: [], completedTasks: [1, 2], completedTruncated: true}), "0 tasks, 0 projects, 2 completed (the newest completed tasks only)");
    });
    it("has a Download button on the Settings page that calls exportData with the sign-in token", () => {
      const page = html.slice(html.indexOf("id=\"pageSettings\""), html.indexOf("id=\"undoNote\""));
      assert.match(page, /id="exportBtn"/);
      assert.match(html, /const EXPORT_URL = endpoint\("exportData"\)/);
      assert.match(html, /apiFetch\(EXPORT_URL\)/);
      assert.match(html, /getElementById\("exportBtn"\)\.addEventListener\("click", downloadExport\)/);
    });
  });

  describe("queue sorting", () => {
    const now = new Date("2026-10-22T09:00:00+13:00");
    const ids = (list) => list.map((t) => t.id);
    const tasks = () => [
      {id: "t1", order: 1, priority: "LOW", dueDate: "2026-10-30", addedAt: "2026-10-20T01:00:00.000Z", scheduledStart: "2026-10-28T10:00:00+13:00"},
      {id: "t2", order: 2, priority: "HIGH", addedAt: "2026-10-18T01:00:00.000Z", scheduledStart: "2026-10-27T15:00:00+13:00"},
      {id: "t3", order: 3, priority: "MEDIUM", dueDate: "2026-10-25"},
      {id: "t4", order: 4, priority: "HIGH", dueDate: "2026-10-25", addedAt: "2026-10-21T01:00:00.000Z", scheduledStart: "2026-10-27"},
    ];

    it("offers Priority, Date added, Due date, Scheduled date, Task number and Name, and falls back to Scheduled date", () => {
      const {SORT_OPTIONS, normalizeSortKey} = load();
      assert.deepEqual(SORT_OPTIONS.map((o) => o[1]), ["Priority", "Date added", "Due date", "Scheduled date", "Task number", "Name"]);
      assert.equal(normalizeSortKey("due"), "due");
      assert.equal(normalizeSortKey("order"), "scheduled");
      assert.equal(normalizeSortKey("nonsense"), "scheduled");
      assert.equal(normalizeSortKey(undefined), "scheduled");
    });
    it("sorts by scheduled date, ascending, unless told otherwise, and the page starts there", () => {
      const {sortTasks} = load();
      assert.deepEqual(ids(sortTasks(tasks())), ids(sortTasks(tasks(), "scheduled", false)));
      assert.deepEqual(ids(sortTasks(tasks(), "order", false)), ids(sortTasks(tasks(), "scheduled", false)));
      assert.ok(html.includes("let sortKey = \"scheduled\""));
    });
    it("does not show the task number on a task card", () => {
      const card = html.slice(html.indexOf("function taskItemHtml"), html.indexOf("function renderTasks"));
      assert.ok(!card.includes("t.order"));
    });
    it("sorts by priority, highest first when ascending, ties by task number", () => {
      const {sortTasks} = load();
      assert.deepEqual(ids(sortTasks(tasks(), "priority", false, now)), ["t2", "t4", "t3", "t1"]);
      assert.deepEqual(ids(sortTasks(tasks(), "priority", true, now)), ["t1", "t3", "t2", "t4"]);
    });
    it("sorts by date added, oldest first, with tasks that have none counted as the oldest", () => {
      const {sortTasks} = load();
      assert.deepEqual(ids(sortTasks(tasks(), "added", false, now)), ["t3", "t2", "t1", "t4"]);
      assert.deepEqual(ids(sortTasks(tasks(), "added", true, now)), ["t4", "t1", "t2", "t3"]);
    });
    it("sorts by due date, earliest first, with tasks that have none counted as the latest", () => {
      const {sortTasks} = load();
      assert.deepEqual(ids(sortTasks(tasks(), "due", false, now)), ["t3", "t4", "t1", "t2"]);
      assert.deepEqual(ids(sortTasks(tasks(), "due", true, now)), ["t2", "t1", "t3", "t4"]);
    });
    it("sorts by scheduled date, earliest first, with unscheduled tasks counted as the latest", () => {
      const {sortTasks} = load();
      assert.deepEqual(ids(sortTasks(tasks(), "scheduled", false, now)), ["t4", "t2", "t1", "t3"]);
      assert.deepEqual(ids(sortTasks(tasks(), "scheduled", true, now)), ["t3", "t1", "t2", "t4"]);
    });
    it("sorts by name A to Z ignoring case, with numbers in numeric order and same-named tasks together by task number", () => {
      const {sortTasks} = load();
      const list = [
        {id: "w", order: 1, title: "Water plants"},
        {id: "t10", order: 2, title: "Task 10"},
        {id: "b2", order: 3, title: "buy milk"},
        {id: "t2", order: 4, title: "Task 2"},
        {id: "a", order: 5, title: "  Answer email"},
        {id: "b1", order: 6, title: "Buy milk"},
        {id: "none", order: 7},
      ];
      assert.deepEqual(ids(sortTasks(list, "name", false, now)), ["none", "a", "b2", "b1", "t2", "t10", "w"]);
      assert.deepEqual(ids(sortTasks(list, "name", true, now)), ["w", "t10", "t2", "b2", "b1", "a", "none"]);
      assert.deepEqual(ids(list), ["w", "t10", "b2", "t2", "a", "b1", "none"], "the input is not reordered");
    });
    it("places an all-day slot before a timed one on the same local day, and orders timed slots by local time", () => {
      const {sortTasks} = load();
      const list = [
        {id: "late", order: 1, scheduledStart: "2026-10-27T16:30:00+13:00"},
        {id: "early", order: 2, scheduledStart: "2026-10-27T08:05:00+13:00"},
        {id: "allday", order: 3, scheduledStart: "2026-10-27"},
        {id: "prev", order: 4, scheduledStart: "2026-10-26T23:55:00+13:00"},
      ];
      assert.deepEqual(ids(sortTasks(list, "scheduled", false, now)), ["prev", "allday", "early", "late"]);
    });
    it("does not keep snoozed or overdue tasks apart when sorting by another field, and does not modify the input", () => {
      const {sortTasks} = load();
      const list = [{id: "a", order: 1, priority: "LOW", snoozedUntil: "2026-10-30"}, {id: "b", order: 2, priority: "HIGH", dueDate: "2026-10-01"}, {id: "c", order: 3, priority: "MEDIUM"}];
      assert.deepEqual(ids(sortTasks(list, "priority", false, now)), ["b", "c", "a"]);
      assert.deepEqual(ids(list), ["a", "b", "c"]);
    });
    it("shows a Sort by select and a direction button in the Queue card", () => {
      const queue = html.slice(html.indexOf("id=\"queueCard\""), html.indexOf("id=\"taskList\""));
      assert.ok(queue.includes("id=\"sortBy\"") && queue.includes("id=\"sortDirBtn\""));
      assert.ok(html.includes("sortTasks(filtered, sortKey, sortDescending)"));
    });
    it("labels the edit modal's comments box just Comments", () => {
      assert.ok(html.includes("<label for=\"editComments\">Comments</label>"));
    });
  });

  describe("time tracking", () => {
    const T0 = Date.parse("2026-10-24T09:00:00.000Z");

    it("knows whether a timer is running", () => {
      const {isTimerRunning} = load();
      assert.equal(isTimerRunning({}), false);
      assert.equal(isTimerRunning({trackedSeconds: 30}), false);
      assert.equal(isTimerRunning({timerStartedAt: "2026-10-24T09:00:00.000Z"}), true);
    });
    it("adds the running stretch to the saved seconds and never goes negative", () => {
      const {elapsedSecondsOf} = load();
      assert.equal(elapsedSecondsOf({trackedSeconds: 60, timerStartedAt: new Date(T0).toISOString()}, T0 + 15000), 75);
      assert.equal(elapsedSecondsOf({trackedSeconds: 60}, T0), 60);
      assert.equal(elapsedSecondsOf({timerStartedAt: new Date(T0).toISOString()}, T0 - 9000), 0);
      assert.equal(elapsedSecondsOf({}, T0), 0);
    });
    it("formats the elapsed time as m:ss, or h:mm:ss from an hour", () => {
      const {formatElapsed} = load();
      assert.equal(formatElapsed(0), "0:00");
      assert.equal(formatElapsed(65), "1:05");
      assert.equal(formatElapsed(3599), "59:59");
      assert.equal(formatElapsed(3725), "1:02:05");
      assert.equal(formatElapsed(-4), "0:00");
      assert.equal(formatElapsed("x"), "0:00");
    });
    it("words a tracked duration", () => {
      const {durationText} = load();
      assert.deepEqual([0, 45, 60, 89, 3600, 3900, 7200].map(durationText), ["0s", "45s", "1m", "1m", "1h", "1h 5m", "2h"]);
    });
    it("shows a completed task's tracked time, or its estimate marked as one when no time was tracked", () => {
      const {completedTimeText} = load();
      assert.equal(completedTimeText({trackedSeconds: 1500, estimatedMinutes: 60}), "25m");
      assert.equal(completedTimeText({trackedSeconds: 0, estimatedMinutes: 60}), "60m est.");
      assert.equal(completedTimeText({estimatedMinutes: 30}), "30m est.");
      assert.equal(completedTimeText({}), "15m est.");
    });
    it("has no timer button on the task card, a timer button beside Snooze in the edit modal, and no Reschedule button", () => {
      assert.equal(html.includes("data-action=\"timer\""), false);
      assert.match(html, /toggleTimer\(taskId\);\n {8}\}, LONG_PRESS_MS\)/);
      const modal = html.slice(html.indexOf("modal-extra-actions\">"), html.indexOf("modal-actions\">"));
      assert.ok(modal.includes("id=\"editTimerBtn\"") && modal.includes("id=\"editElapsed\"") && modal.includes("snoozeFromModal"));
      assert.equal(html.includes("rescheduleFromModal"), false);
      assert.equal(html.includes("Reschedule</button>"), false);
    });
    it("picks the running task as the active one, else the marked one, else none", () => {
      const {activeTaskOf} = load();
      const running = {id: "r", timerStartedAt: "2026-10-24T09:00:00.000Z", active: true};
      const marked = {id: "m", active: true, trackedSeconds: 30};
      const plain = {id: "p"};
      assert.equal(activeTaskOf([plain, marked, running]), running);
      assert.equal(activeTaskOf([plain, marked]), marked);
      assert.equal(activeTaskOf([plain, {id: "legacy", timerStartedAt: "2026-10-24T09:00:00.000Z"}]).id, "legacy", "a running timer counts even without the mark");
      assert.equal(activeTaskOf([plain]), null);
      assert.equal(activeTaskOf([]), null);
    });
    it("puts the active task in a box above the search row of the Queue card", () => {
      const queue = html.slice(html.indexOf("id=\"queueCard\""), html.indexOf("id=\"taskList\""));
      assert.ok(queue.indexOf("id=\"activeTaskBox\"") > 0);
      assert.ok(queue.indexOf("id=\"activeTaskBox\"") < queue.indexOf("id=\"taskSearch\""));
      assert.ok(html.includes("activeTaskOf(allTasks)"));
    });
  });

  describe("copying a completed task", () => {
    const templates = [
      {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: ["Outdoor", "Garden"], recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: ["Petrol", "Oil"], comments: "Check the blade"},
      {title: "Mow the verge", priority: "MEDIUM", estimatedMinutes: 20, tags: []},
      {title: "Pay rates", priority: "HIGH", estimatedMinutes: 10, tags: []},
    ];
    it("offers nothing for an empty or one-letter text", () => {
      const {templateMatches} = load();
      assert.deepEqual(templateMatches(templates, ""), []);
      assert.deepEqual(templateMatches(templates, " m "), []);
      assert.deepEqual(templateMatches(null, "mow"), []);
    });
    it("matches every typed word in the title, ignoring case, keeping the newest-first order", () => {
      const {templateMatches} = load();
      assert.deepEqual(templateMatches(templates, "MOW").map((t) => t.title), ["Mow lawn", "Mow the verge"]);
      assert.deepEqual(templateMatches(templates, "verge mow").map((t) => t.title), ["Mow the verge"]);
      assert.deepEqual(templateMatches(templates, "zzz"), []);
    });
    it("lists the most often completed first, keeping the newest first among equal counts", () => {
      const {templateMatches} = load();
      const list = [
        {title: "Mow lawn", completedCount: 2},
        {title: "Mow the verge", completedCount: 9},
        {title: "Mow edges", completedCount: 2},
        {title: "Mow roof"},
        {title: "Mow hedge", completedCount: 5},
      ];
      assert.deepEqual(templateMatches(list, "mow").map((t) => t.title), ["Mow the verge", "Mow hedge", "Mow lawn", "Mow edges", "Mow roof"]);
      assert.deepEqual(list.map((t) => t.title)[0], "Mow lawn"); // the input is not reordered
    });
    it("picks the limit from the most common matches, not the newest", () => {
      const {templateMatches} = load();
      const list = [{title: "Mow a", completedCount: 1}, {title: "Mow b", completedCount: 1}, {title: "Mow c", completedCount: 8}];
      assert.deepEqual(templateMatches(list, "mow", 1).map((t) => t.title), ["Mow c"]);
    });
    it("shows at most the limit", () => {
      const {templateMatches} = load();
      assert.equal(templateMatches(templates, "mow", 1).length, 1);
    });
    it("describes a template on one line, leaving out an empty tag list", () => {
      const {templateMeta} = load();
      assert.equal(templateMeta(templates[0]), "LOW · 45 min · Outdoor, Garden");
      assert.equal(templateMeta(templates[2]), "HIGH · 10 min");
      assert.equal(templateMeta({}), "MEDIUM · 15 min");
    });
    it("fills the form with the old details but no due date, and every material unchecked", () => {
      const {templateFormValues} = load();
      const v = templateFormValues(templates[0], ["p1"]);
      assert.deepEqual(v, {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: "Outdoor, Garden", dueDate: "", recurFreq: "WEEKLY", recurInterval: 2, projectId: "p1", projectOrder: 2, materials: [{id: "", text: "Petrol", checked: false}, {id: "", text: "Oil", checked: false}], comments: "Check the blade", history: null});
    });
    it("drops a project that no longer exists, with its order number", () => {
      const {templateFormValues} = load();
      const v = templateFormValues(templates[0], ["other"]);
      assert.equal(v.projectId, "");
      assert.equal(v.projectOrder, "");
    });
    it("carries the job history of a template into the form values and the posted entry", () => {
      const {templateFormValues, manualTaskBody, historyOf} = load();
      const t = {title: "Mow lawn", completedCount: 7, recentSeconds: [1200, 0, 1500], estimatedMinutes: 25};
      assert.deepEqual(historyOf(t), {completedCount: 7, recentSeconds: [1200, 1500]});
      assert.equal(templateFormValues(t).estimatedMinutes, 25);
      assert.deepEqual(templateFormValues(t).history, {completedCount: 7, recentSeconds: [1200, 1500]});
      assert.deepEqual(manualTaskBody({title: "Mow lawn", priority: "LOW", history: {completedCount: 7}}).manual.history, {completedCount: 7});
      assert.ok(!("history" in manualTaskBody({title: "x", priority: "LOW", history: null}).manual));
    });
    it("leaves out unusable history parts", () => {
      const {historyOf} = load();
      assert.equal(historyOf({}), null);
      assert.equal(historyOf({completedCount: 0, recentSeconds: [0, -1, "5"]}), null);
      assert.deepEqual(historyOf({completedCount: 2}), {completedCount: 2});
    });
    it("posts the copied history only while the title still names the same job", () => {
      const {historyForTitle} = load();
      const copied = {title: "Mow lawn", history: {completedCount: 3}};
      assert.deepEqual(historyForTitle(copied, "  MOW lawn "), {completedCount: 3});
      assert.equal(historyForTitle(copied, "Mow the verge"), null);
      assert.equal(historyForTitle(null, "Mow lawn"), null);
      assert.equal(historyForTitle({title: "x", history: null}, "x"), null);
    });
    it("falls back to the form's defaults for a bare template", () => {
      const {templateFormValues} = load();
      assert.deepEqual(templateFormValues({title: "x"}), {title: "x", priority: "MEDIUM", estimatedMinutes: 15, tags: "", dueDate: "", recurFreq: "NONE", recurInterval: 1, projectId: "", projectOrder: "", materials: [], comments: "", history: null});
    });
    it("posts startNow only when ticked", () => {
      const {addTaskExtras} = load();
      assert.deepEqual(addTaskExtras({startNow: false}), {});
      assert.deepEqual(addTaskExtras({startNow: true}), {startNow: true});
    });
    it("lets a free-text add be answered with a project suggestion", () => {
      const {freeTextBody} = load();
      assert.deepEqual(freeTextBody("renovate the bathroom"), {input: "renovate the bathroom", allowProposal: true});
    });
    it("writes a suggested step as a line", () => {
      const {proposalStepText} = load();
      assert.equal(proposalStepText({title: "Sand the walls", estimatedMinutes: 45, tags: ["Indoor", "Prep"]}), "Sand the walls · 45m · Indoor, Prep");
      assert.equal(proposalStepText({title: "Paint", estimatedMinutes: 150, tags: []}), "Paint · 2h 30m");
      assert.equal(proposalStepText({title: "Clean", estimatedMinutes: 60}), "Clean · 1h");
    });
    it("posts an accepted suggestion as it was shown, and nothing else of it", () => {
      const {proposalAcceptBody} = load();
      const proposal = {name: "Bathroom renovation", steps: [{title: "A", priority: "HIGH", estimatedMinutes: 30, tags: []}], extra: 1};
      assert.deepEqual(proposalAcceptBody(proposal, false), {acceptProposal: {name: "Bathroom renovation", steps: proposal.steps}});
      assert.deepEqual(proposalAcceptBody(proposal, true), {acceptProposal: {name: "Bathroom renovation", steps: proposal.steps}, startNow: true});
    });
    it("posts a declined suggestion's single changes", () => {
      const {proposalDeclineBody} = load();
      const changes = [{title: "Renovate the bathroom", order: 1}];
      assert.deepEqual(proposalDeclineBody(changes, false), {apply: {changes}});
      assert.deepEqual(proposalDeclineBody(changes, true), {apply: {changes}, startNow: true});
      assert.deepEqual(proposalDeclineBody(undefined, false), {apply: {changes: []}});
    });
  });
  describe("photos", () => {
    it("has a photo panel in the edit modal of a queued task, keyed by task id", () => {
      assert.ok(html.includes("id=\"editPhotos\""));
      assert.match(html, /showPhotos\(task\.id, "taskId", "editPhotos"\)/);
      assert.match(html, /showPhotos\(id, "archiveId", "cePhotos"\)/);
      assert.match(html, /\[panel\.field\]: key, image/);
      const close = html.slice(html.indexOf("function closeEditModal"), html.indexOf("function closeModalOnOverlay"));
      assert.match(close, /photoPanels\.delete\(/);
    });
    it("keeps the server's limits", () => {
      const {MAX_PHOTOS, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_QUALITY} = load();
      assert.equal(MAX_PHOTOS, 3);
      assert.equal(PHOTO_MAX_BYTES, 300 * 1024);
      assert.equal(PHOTO_MAX_SIDE, 1280);
      assert.equal(PHOTO_QUALITY, 0.7);
    });
    it("scales a picture to 1280 px on its longest side and never enlarges it", () => {
      const {photoTargetSize} = load();
      assert.deepEqual(photoTargetSize(4000, 3000), {width: 1280, height: 960});
      assert.deepEqual(photoTargetSize(3000, 4000), {width: 960, height: 1280});
      assert.deepEqual(photoTargetSize(1280, 720), {width: 1280, height: 720});
      assert.deepEqual(photoTargetSize(640, 480), {width: 640, height: 480});
      assert.deepEqual(photoTargetSize(4000, 3000, 800), {width: 800, height: 600});
    });
    it("rounds to whole pixels and keeps a thin picture at least one pixel", () => {
      const {photoTargetSize} = load();
      assert.deepEqual(photoTargetSize(4001, 3001), {width: 1280, height: 960});
      assert.deepEqual(photoTargetSize(100000, 10), {width: 1280, height: 1});
    });
    it("has no size for a width or height that is not a positive number", () => {
      const {photoTargetSize, photoAttempts} = load();
      for (const [w, h] of [[0, 100], [100, 0], [-5, 5], [NaN, 5], [undefined, 5], ["a", 5]]) {
        assert.equal(photoTargetSize(w, h), null, `${w}x${h}`);
        assert.deepEqual(photoAttempts(w, h), []);
      }
    });
    it("tries the usual size and quality first, then plainer and smaller ones", () => {
      const {photoAttempts} = load();
      const attempts = photoAttempts(4000, 3000);
      assert.deepEqual(attempts[0], {width: 1280, height: 960, quality: 0.7});
      assert.ok(attempts.length > 3);
      for (let i = 1; i < attempts.length; i++) {
        assert.ok(attempts[i].width <= attempts[i - 1].width);
        assert.ok(attempts[i].quality <= attempts[i - 1].quality || attempts[i].width < attempts[i - 1].width);
      }
      assert.ok(attempts.at(-1).width < 1280);
    });
    it("says how many photos a task has", () => {
      const {photoCountText} = load();
      assert.equal(photoCountText(0), "No photos yet");
      assert.equal(photoCountText(1), "1 of 3 photos");
      assert.equal(photoCountText(3), "3 of 3 photos");
      assert.equal(photoCountText(undefined), "No photos yet");
      assert.equal(photoCountText(-1), "No photos yet");
    });
    it("takes the base64 part of a data URL", () => {
      const {base64FromDataUrl} = load();
      assert.equal(base64FromDataUrl("data:image/jpeg;base64,/9j/4AAQ=="), "/9j/4AAQ==");
      assert.equal(base64FromDataUrl("data:image/jpeg;base64,"), "");
      assert.equal(base64FromDataUrl("hello"), "");
      assert.equal(base64FromDataUrl(null), "");
    });
    it("wires the page: file input, viewer and the three endpoints", () => {
      for (const needle of ["id=\"photoInput\"", "accept=\"image/*\"", "id=\"photoModal\"", "endpoint(\"getCompletedPhotos\")", "endpoint(\"addCompletedPhoto\")", "endpoint(\"deleteCompletedPhoto\")", "data-completed-open", "id=\"cePhotos\"", "downloadTaskSheet(document.getElementById('ceId').value"]) {
        assert.ok(html.includes(needle), needle);
      }
      // The cards carry no buttons of their own: photos and the job sheet live in the edit form
      const card = html.slice(html.indexOf("function completedRowHtml"), html.indexOf("// Draw the search box"));
      assert.ok(!card.includes("<button"));
      assert.ok(!html.includes("data-photo-toggle"));
    });
  });

  describe("task numbers", () => {
    const queue = () => [
      {id: "a", order: 2}, {id: "b", order: 5}, {id: "c", order: 9}, // stored ranks have gaps
    ];

    it("numbers the queue 1..n in rank order, however the stored ranks run", () => {
      const {queueNumbers} = load();
      assert.deepEqual([...queueNumbers(queue())], [["a", 1], ["b", 2], ["c", 3]]);
      assert.deepEqual([...queueNumbers([{id: "x", order: 3}, {id: "y", order: 1}])].sort(), [["x", 2], ["y", 1]]);
    });

    it("breaks ties in list order and tolerates a missing rank", () => {
      const {queueNumbers} = load();
      const numbers = queueNumbers([{id: "p", order: 1}, {id: "q", order: 1}, {id: "r"}]);
      assert.equal(numbers.get("r"), 1);
      assert.equal(numbers.get("p"), 2);
      assert.equal(numbers.get("q"), 3);
    });

    it("writes the chip as #n, empty for an unknown task", () => {
      const {queueNumbers, numberChipText} = load();
      const numbers = queueNumbers(queue());
      assert.equal(numberChipText(numbers, "c"), "#3");
      assert.equal(numberChipText(numbers, "zzz"), "");
    });

    it("offers Task number as a sort that follows the queue, reversible", () => {
      const {SORT_OPTIONS, normalizeSortKey, sortTasks} = load();
      assert.ok(SORT_OPTIONS.some((o) => o[0] === "number" && o[1] === "Task number"));
      assert.equal(normalizeSortKey("number"), "number");
      const tasks = [{id: "c", order: 9}, {id: "a", order: 2}, {id: "b", order: 5}];
      assert.deepEqual(sortTasks(tasks, "number", false).map((t) => t.id), ["a", "b", "c"]);
      assert.deepEqual(sortTasks(tasks, "number", true).map((t) => t.id), ["c", "b", "a"]);
    });

    it("sends a task number only when the field holds a different whole number, clamped to the queue length", () => {
      const {queueNumberChange} = load();
      assert.equal(queueNumberChange("1", 3, 5), 1);
      assert.equal(queueNumberChange("3", 3, 5), null);
      assert.equal(queueNumberChange("99", 3, 5), 5);
      assert.equal(queueNumberChange("5", 5, 5), null);
      assert.equal(queueNumberChange("", 3, 5), null);
      assert.equal(queueNumberChange("0", 3, 5), null);
      assert.equal(queueNumberChange("2.5", 3, 5), null);
      assert.equal(queueNumberChange("abc", 3, 5), null);
    });
  });
});

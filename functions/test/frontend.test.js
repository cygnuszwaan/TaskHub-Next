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
    return {confirmView, failureText, shoppingItemText, shoppingWithAdded, shoppingWithout, shoppingWithRestored, withTaskMaterialChecked, MAX_SHOPPING_ITEMS, CONFIRM_TONES, TABS, normalizeTab, removalMessage, sortedTags, scheduleChoice, scheduleFromChoice, DAILY_TIME, DEFAULT_TIME_ZONE, makeFormatters, setTimeZone, getZone: () => appTimeZone, daysUntilDue, dueClass, DUE_SOON_DAYS, runningSeconds, longTimerWarning, DEFAULT_TIMER_WARN_HOURS, jobNumberWords, formatInstant, formatSchedule, geocodeUrl, placeFromGeocode, placesFromGeocode, settingsPayload, jobSheetPayload, parseTravelText, travelBoxText, INVALID_TRAVEL, manualTaskBody, recurrenceFields, scheduleSummary, matchesSearch, projectFields, projectLabel, projectClientName, projectSearchText, clientSummary, clientFormBody, deleteClientPrompt, projectTaskCounts, filterTasks, deleteProjectPrompt, completePrompt, openMaterialsOf, materialsChipText, openMaterialGroups, openMaterialCount, withMaterialChecked, materialsFields, MAX_MATERIALS, needsRedirectSignIn, addDaysTo, snoozeDateFor, snoozeDateFromInput, isSnoozedTask, snoozeChipText, snoozeNeedsReschedule, SORT_OPTIONS, normalizeSortKey, sortTasks, queueNumbers, numberChipText, jobNumberText, queueNumberChange, activeTaskOf, isTimerRunning, elapsedSecondsOf, formatElapsed, durationText, completedTimeText, streakText, statProjectName, jobStatsText, fmtMinutes, decimalHours, hoursText, projectWeekText, weekRangeText, pickHistoryProject, parseTagList, zonedDateTime, completedFormValues, completedChanges, completedMaterialTexts, parseMaterialLines, materialLine, parseMaterialItems, completedMaterialLines, parseCostText, costBoxText, materialCostValue, invalidMaterialCost, COMPLETED_PAGE_SIZE, matchesCompletedSearch, completedBrowse, pagerItems, completedCountText, THEME_KEY, normalizeTheme, isDarkTheme, themeFromToggle, themeMetaMedia, exportFilename, jobSheetFilename, exportSummary, templateMatches, templateMeta, templateFormValues, addTaskExtras, freeTextBody, proposalStepText, proposalAcceptBody, proposalDeclineBody, historyOf, historyForTitle, MAX_PHOTOS, PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_MAX_BYTES, photoTargetSize, photoAttempts, photoCountText, base64FromDataUrl, LONG_PRESS_MS, PRESS_MOVE_PX, pressMoved, timerChipIcon, FLASH_MS, flashElapsed, SWIPE_START_PX, SWIPE_COMMIT_PX, isHorizontalDrag, swipeAction, swipeOffset, deletePrompt, abortPrompt, reopenPrompt, withoutTasks, insertTaskAt, UNDO_WINDOW_MS, UNDO_NOTE_MS, templateStepsText, defaultProjectName, saveTemplateBody, startTemplateBody, deleteTemplatePrompt, startedText, csvRequestBody, csvFilename, sharedText, shareFromSearch, pushState, pushTokenBody, pushTestText, notifyFormValues, notifyPayload, pruneSelection, toggledSelection, taskCountText, batchCountText, batchRemovePrompt, batchRemoveResultText, batchBody, batchSnoozeText};`)();
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
      assert.equal(abortPrompt({title: "Mow lawn"}), "Abort \"Mow lawn\"?\n\nIts timer stops, its tracked time and start time are erased and it returns to the queue.");
      assert.match(abortPrompt(null), /^Abort this task\?/);
    });
    it("wires the swipes by card: queued left delete and right snooze, Active left abort and right complete", () => {
      const up = html.slice(html.indexOf("const onTaskRowUp"), html.indexOf("const onTaskRowClick"));
      assert.match(up, /swipeAction\(s\.dx, s\.dy, s\.active\)/);
      assert.match(up, /action === "ABORT"[\s\S]*await askConfirm\(abortPrompt\(task\), \{ tone: "warning"[\s\S]*abortTask\(s\.id\)/);
      assert.match(up, /action === "COMPLETE"[\s\S]*await confirmComplete\(s\.id\)[\s\S]*completeTask\(s\.id\)/);
      assert.match(up, /action === "DELETE"[\s\S]*await askConfirm\(deletePrompt\(task\), \{ tone: "danger"[\s\S]*deleteTask\(s\.id\)/);
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
      assert.match(html, /body: JSON\.stringify\(\{ taskId, action, \.\.\.extra \}\)/);
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
    it("has a pinned header with the Queue, Materials and Settings tabs, in that order, and nothing else", () => {
      assert.match(html, /\.app-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0/);
      const header = html.slice(at("<header"), at("</header>"));
      assert.ok(header.includes(`id="tabBar"`));
      assert.doesNotMatch(header, /Sign out|<h1/);
      assert.doesNotMatch(html.slice(at(`id="app"`), at(`id="editModal"`)), /signOutUser\(\)/);
      assert.ok(at("<header") - at(`id="app"`) < 40, "the header is the first thing in the app");
      const tabs = [...header.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
      assert.deepEqual(tabs, ["queue", "materials", "history", "settings"]);
      assert.match(header, /data-tab="history">History</);
      assert.ok(header.indexOf(`id="materialsCount"`) > header.indexOf(`data-tab="materials"`));
      assert.ok(header.indexOf(`id="materialsCount"`) < header.indexOf(`data-tab="settings"`));
    });
    it("has one page per tab, with only the Queue page visible at first", () => {
      const pages = [...html.matchAll(/<main id="(\w+)" data-page="(\w+)"([^>]*)>/g)];
      assert.deepEqual(pages.map((m) => m[2]), ["queue", "materials", "history", "settings"]);
      assert.deepEqual(pages.map((m) => /\bhidden\b/.test(m[3])), [false, true, true, true]);
    });
    it("puts add task and the Queue on the Queue page", () => {
      const tasks = at(`id="pageQueue"`);
      const end = at("</main>", tasks);
      for (const id of ["taskInput", "queueCard", "tagsDetails", "projectsDetails", "taskList"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > tasks && i < end, `${id} is on the Queue page`);
      }
      assert.ok(at(`id="taskInput"`) < at(`id="queueCard"`));
      assert.ok(at(`id="pageHistory"`) > end, "the History page is not on the Queue page");
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
    it("keeps Materials and Comments in a collapsed Extra fields section in both edit modals", () => {
      for (const [details, fields, modal] of [["editExtraFields", ["editMaterials", "editComments"], "editModal"], ["ceExtraFields", ["ceMaterials", "ceComments"], "completedEditModal"]]) {
        const start = at(`id="${details}"`);
        const end = at("</details>", start);
        assert.ok(start > at(`id="${modal}"`), `${details} is in ${modal}`);
        assert.doesNotMatch(html.slice(start - 20, start + 40), /\sopen[\s>]/, `${details} starts collapsed`);
        assert.match(html.slice(start, start + 120), /<summary>Extra fields<\/summary>/);
        for (const id of fields) {
          const i = at(`id="${id}"`);
          assert.ok(i > start && i < end, `${id} is inside ${details}`);
        }
      }
      assert.match(html, /getElementById\("editExtraFields"\)\.open = false/);
      assert.match(html, /getElementById\("ceExtraFields"\)\.open = false/);
    });
    it("sizes a material's cost box small inside forms so the row stays within the modal", () => {
      assert.match(html, /\.form-group \.cost-input[^{]*\{[^}]*width:\s*84px/);
      assert.match(html, /\.form-group \.material-row input\[type="number"\][^{]*\{[^}]*width:\s*84px/);
    });
    it("puts the task number and tags fields on one line, with short labels", () => {
      const pair = at(`class="field-pair"`);
      assert.ok(pair > at(`id="editModal"`));
      const num = at(`id="editNumber"`);
      const tags = at(`id="editTags"`);
      const next = at(`<label>Due Date</label>`);
      assert.ok(pair < num && num < tags && tags < next);
      assert.match(html, /<label for="editNumber">Task number<\/label>/);
      assert.match(html, /<label for="editTags">Tags<\/label>/);
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
    it("makes the History page a collapsed Stats card above the project hours and completed list, loaded on each visit", () => {
      const page = at(`id="pageHistory"`);
      const end = at("</main>", page);
      assert.ok(page > at(`id="pageMaterials"`) && end < at(`id="pageSettings"`));
      assert.ok(at(`id="completedList"`) > page && at(`id="completedList"`) < end);
      const open = at(`<details class="card settings-card" id="statsDetails"`, page);
      assert.ok(open > page && open < at(`id="completedList"`), "the Stats card comes first");
      assert.match(html.slice(open, html.indexOf(">", open)), /^<details class="card settings-card" id="statsDetails" hidden$/, "collapsed (no open attribute) until the stats load");
      const close = html.indexOf("</details>", open);
      assert.ok(close < at(`id="completedList"`) && close < end, "the Stats card closes before the project hours and list");
      assert.match(html.slice(open, close), /<summary><h3>Stats<\/h3><\/summary>\s*<div id="statsSummary"><\/div>/);
      assert.equal((html.slice(page, end).match(/<details\b/g) || []).length, 1, "only the Stats card collapses");
      assert.doesNotMatch(html, /completedDetails|Recently [Cc]ompleted/);
      const show = html.slice(at("function showTab"), at("function showTab") + 700);
      assert.match(show, /tab === "history"\) fetchCompleted\(\)/);
    });
    it("puts the summary, down to Most completed jobs, in the Stats card and the project hours outside it", () => {
      const fetchFn = html.slice(at("async function fetchCompleted"), at("async function fetchCompleted") + 2200);
      assert.match(fetchFn, /getElementById\("statsSummary"\)\.innerHTML = summaryHtml/);
      assert.match(fetchFn, /list\.innerHTML = renderProjectHours\(/);
      assert.doesNotMatch(fetchFn, /renderSummary\(data\.summary\) \+/);
      assert.match(fetchFn, /stats\.hidden = summaryHtml === ""/);
      assert.equal((fetchFn.match(/stats\.hidden = true/g) || []).length, 2, "hidden for no completions and for a failed load");
      const summaryFn = html.slice(at("function renderSummary"), at("function renderProjectHours"));
      assert.ok(summaryFn.indexOf("Most completed jobs") > summaryFn.indexOf("By project"));
    });
    it("keeps four tabs on one row by letting them size to their text", () => {
      assert.match(html, /\.tab-btn\s*\{[^}]*flex:\s*1 1 auto;[^}]*font-size:\s*13px/);
    });
    it("makes Settings a page with Save settings, Update now and the schedule result line", () => {
      const page = at(`id="pageSettings"`);
      const end = at("</main>", page);
      assert.ok(page > at(`id="pageMaterials"`) && end < at(`id="editModal"`));
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
      assert.match(fromModal, /if \(!await askConfirm\("Delete this task\?", \{ tone: "danger", confirmLabel: "Delete" \}\)\) return;\s*const taskId/);
      assert.ok(fromModal.indexOf("askConfirm(") < fromModal.indexOf("closeEditModal()"), "cancelling keeps the modal open");
    });
    it("has an Undo bar pinned to the bottom of the screen, shown after a delete or completion and kept until the server's window ends", () => {
      const note = at(`id="undoNote"`);
      assert.ok(note > at("</main>", at(`id="pageSettings"`)) && note < at(`id="editModal"`));
      assert.match(html.slice(html.lastIndexOf("<", note), note), /^<footer /);
      assert.match(html, /\.undo-note\[hidden\]\s*\{\s*display:\s*none/);
      assert.match(html, /\.undo-note \{[^}]*position: sticky; bottom: 0;/);
      assert.match(html, /body:has\(#undoNote:not\(\[hidden\]\)\) \.batch-bar \{ bottom: calc\(44px/, "the Multi-Select bar sits above it");
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
    it("lists the tabs and falls back to Queue for an unknown name", () => {
      const {TABS, normalizeTab} = load();
      assert.deepEqual([...TABS], ["queue", "materials", "history", "settings"]);
      for (const name of TABS) assert.equal(normalizeTab(name), name);
      for (const name of ["", "other", undefined, null, "Queue", "tasks"]) assert.equal(normalizeTab(name), "queue");
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

  describe("material costs and the hourly rate", () => {
    it("jobSheetPayload adds the rate only when given: typed text trimmed, empty as null", () => {
      const {jobSheetPayload} = load();
      assert.deepEqual(jobSheetPayload("A"), {jobSheet: {contractorInfo: "A"}});
      assert.deepEqual(jobSheetPayload("A", " 85.5 "), {jobSheet: {contractorInfo: "A", hourlyRate: "85.5"}});
      for (const v of ["", "  ", null]) assert.deepEqual(jobSheetPayload("A", v), {jobSheet: {contractorInfo: "A", hourlyRate: null}});
    });
    it("jobSheetPayload takes the rate through the server's validation", () => {
      const {applySettingsUpdate, mergeSettings} = require("../settings");
      const {jobSheetPayload} = load();
      assert.equal(applySettingsUpdate(mergeSettings(undefined), jobSheetPayload("", "85.50")).settings.jobSheet.hourlyRate, 85.5);
      assert.equal(applySettingsUpdate(mergeSettings({jobSheet: {hourlyRate: 85}}), jobSheetPayload("", "")).settings.jobSheet.hourlyRate, null);
      assert.match(applySettingsUpdate(mergeSettings(undefined), jobSheetPayload("", "abc")).error, /hourlyRate/);
    });
    it("jobSheetPayload adds the travel rate only when given, typed text trimmed, empty as null", () => {
      const {jobSheetPayload} = load();
      assert.deepEqual(jobSheetPayload("A", "85", " 1.35 "), {jobSheet: {contractorInfo: "A", hourlyRate: "85", travelRate: "1.35"}});
      assert.deepEqual(jobSheetPayload("A", undefined, ""), {jobSheet: {contractorInfo: "A", travelRate: null}});
      assert.equal("travelRate" in jobSheetPayload("A", "85").jobSheet, false);
    });
    it("jobSheetPayload takes the travel rate through the server's validation", () => {
      const {applySettingsUpdate, mergeSettings} = require("../settings");
      const {jobSheetPayload} = load();
      assert.equal(applySettingsUpdate(mergeSettings(undefined), jobSheetPayload("", "", "1.35")).settings.jobSheet.travelRate, 1.35);
      assert.equal(applySettingsUpdate(mergeSettings(undefined), jobSheetPayload("", "", "")).settings.jobSheet.travelRate, null);
      assert.match(applySettingsUpdate(mergeSettings(undefined), jobSheetPayload("", "", "abc")).error, /travelRate/);
    });
    it("parseTravelText: null when empty, the distance for a plain number, undefined otherwise", () => {
      const {parseTravelText, INVALID_TRAVEL} = load();
      for (const v of ["", "  ", null, undefined]) assert.equal(parseTravelText(v), null);
      assert.equal(parseTravelText(" 12.5 "), 12.5);
      assert.equal(parseTravelText("0"), 0);
      for (const v of ["abc", "-3", "1e3", "10000.5", "12,5"]) assert.equal(parseTravelText(v), undefined, v);
      assert.match(INVALID_TRAVEL, /km/);
    });
    it("travelBoxText: the stored distance as text, empty for none", () => {
      const {travelBoxText} = load();
      assert.equal(travelBoxText(12.5), "12.5");
      for (const v of [undefined, null, 0, -1, "12", NaN]) assert.equal(travelBoxText(v), "");
    });
    it("manualTaskBody sends travelKm only for a distance above 0", () => {
      const {manualTaskBody} = load();
      const form = {title: "Fit tap", priority: "LOW", estimatedMinutes: "30"};
      assert.equal(manualTaskBody({...form, travelKm: "12.5"}).manual.travelKm, 12.5);
      for (const v of ["", "0", "abc", undefined]) assert.equal("travelKm" in manualTaskBody({...form, travelKm: v}).manual, false, String(v));
    });
    it("templateFormValues fills Travel from a completed task", () => {
      const {templateFormValues} = load();
      assert.equal(templateFormValues({title: "Fit tap", travelKm: 12.5}).travelKm, "12.5");
      assert.equal(templateFormValues({title: "Fit tap"}).travelKm, "");
    });
    it("completedChanges sends travelKm only when it differs, null to clear and an error for nonsense", () => {
      const {completedChanges, completedFormValues} = load();
      const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 0, travelKm: 12.5, completedAt: "2026-10-17T20:30:00.000Z"};
      const form = () => ({...completedFormValues(row, "Pacific/Auckland")});
      assert.equal(form().travelKm, "12.5");
      assert.deepEqual(completedChanges(row, form(), "Pacific/Auckland"), {fields: {}});
      assert.deepEqual(completedChanges(row, {...form(), travelKm: "20"}, "Pacific/Auckland"), {fields: {travelKm: 20}});
      for (const v of ["", "0"]) assert.deepEqual(completedChanges(row, {...form(), travelKm: v}, "Pacific/Auckland"), {fields: {travelKm: null}}, v);
      assert.match(completedChanges(row, {...form(), travelKm: "far"}, "Pacific/Auckland").error, /Travel/);
      const bare = {...row};
      delete bare.travelKm;
      assert.deepEqual(completedChanges(bare, {...completedFormValues(bare, "Pacific/Auckland"), travelKm: "0"}, "Pacific/Auckland"), {fields: {}});
    });
    it("puts Priority and Time spent on one line of the completed task form, with no estimate box or hint", () => {
      const start = html.indexOf(`id="cePriority"`);
      const tracked = html.indexOf(`id="ceTracked"`);
      assert.ok(start > 0 && tracked > start, "Priority comes before Time spent");
      const between = html.slice(start, tracked);
      assert.doesNotMatch(between, /<\/div>\s*<\/div>/, "Time spent sits in the same flex row as Priority");
      assert.match(html.slice(tracked, tracked + 300), /<\/div>\s*<\/div>/, "the row closes right after Time spent");
      assert.doesNotMatch(html, /ceEstimate|means none was tracked/);
      assert.match(html, /<label for="ceTracked">Time spent \(minutes\)<\/label>/);
    });
    it("has Travel (km) boxes in the Extra fields of both edit modals, in the add form and a Travel rate in Job Sheets", () => {
      const has = (details, id) => {
        const start = html.indexOf(`id="${details}"`);
        const i = html.indexOf(`id="${id}"`);
        assert.ok(start > 0 && i > start && i < html.indexOf("</details>", start), `${id} is in ${details}`);
      };
      has("editExtraFields", "editTravel");
      has("ceExtraFields", "ceTravel");
      assert.ok(html.indexOf("id=\"manualTravel\"") > html.indexOf("id=\"manualMaterials\""));
      assert.ok(html.indexOf("id=\"manualTravel\"") < html.indexOf("id=\"manualComments\""));
      assert.ok(html.indexOf("id=\"editTravel\"") > html.indexOf("id=\"editMaterials\"") && html.indexOf("id=\"editTravel\"") < html.indexOf("id=\"editComments\""));
      const jobSheets = html.indexOf("<h3>Job Sheets</h3>");
      assert.ok(html.indexOf("id=\"travelRate\"") > jobSheets && html.indexOf("id=\"travelRate\"") > html.indexOf("id=\"hourlyRate\""));
    });
    it("parseCostText: null when empty, a number for an amount, undefined otherwise", () => {
      const {parseCostText} = load();
      assert.equal(parseCostText(""), null);
      assert.equal(parseCostText("  "), null);
      assert.equal(parseCostText(undefined), null);
      assert.equal(parseCostText("12"), 12);
      assert.equal(parseCostText(" 12.5 "), 12.5);
      assert.equal(parseCostText("0.05"), 0.05);
      for (const bad of ["abc", "-1", "1.234", "1,000", "$5", "1e3", "5."]) assert.equal(parseCostText(bad), undefined, bad);
    });
    it("costBoxText shows two decimals, or nothing", () => {
      const {costBoxText} = load();
      assert.equal(costBoxText(12.5), "12.50");
      assert.equal(costBoxText(0), "0.00");
      for (const v of [undefined, null, "5", -1, NaN]) assert.equal(costBoxText(v), "");
    });
    it("materialCostValue shows what is being typed, else the stored cost", () => {
      const {materialCostValue} = load();
      assert.equal(materialCostValue({text: "a", cost: 3}), "3.00");
      assert.equal(materialCostValue({text: "a"}), "");
      assert.equal(materialCostValue({text: "a", cost: 3, costText: "3.5x"}), "3.5x");
      assert.equal(materialCostValue({text: "a", cost: 3, costText: ""}), "");
    });
    it("invalidMaterialCost names the first material with a cost that is not an amount", () => {
      const {invalidMaterialCost} = load();
      assert.equal(invalidMaterialCost([{text: "a", costText: "1.5"}, {text: " b ", costText: "x"}, {text: "c", costText: "y"}]), "b");
      assert.equal(invalidMaterialCost([{text: "a", costText: ""}, {text: "b"}, {text: "", costText: "x"}]), null);
      assert.equal(invalidMaterialCost([]), null);
    });
    it("materialsFields sends a stored or typed cost and leaves the key out otherwise", () => {
      const {materialsFields} = load();
      assert.deepEqual(materialsFields([
        {id: "a", text: "Paint", checked: false, cost: 45.5},
        {id: "b", text: "Tape", checked: true, cost: 3, costText: "4"},
        {id: "c", text: "Free", checked: false, cost: 9, costText: ""},
        {id: "d", text: "Bad", checked: false, costText: "x"},
        {id: "e", text: "None", checked: false},
      ]), [
        {id: "a", text: "Paint", checked: false, cost: 45.5},
        {id: "b", text: "Tape", checked: true, cost: 4},
        {id: "c", text: "Free", checked: false},
        {id: "d", text: "Bad", checked: false},
        {id: "e", text: "None", checked: false},
      ]);
    });
    it("parseMaterialItems reads a trailing | amount as a cost and leaves other lines as text", () => {
      const {parseMaterialItems} = load();
      assert.deepEqual(parseMaterialItems(" Tap | 12.5 \n\nPTFE tape\nGlue | lots\nA | B | 3\nFree | 0"), [
        {text: "Tap", cost: 12.5}, {text: "PTFE tape"}, {text: "Glue | lots"}, {text: "A | B", cost: 3}, {text: "Free", cost: 0},
      ]);
    });
    it("completedMaterialLines and parseMaterialItems round trip, costs included", () => {
      const {completedMaterialLines, parseMaterialItems, materialLine} = load();
      const row = {materials: [{id: "a", text: "Tap", checked: true, cost: 12.5}, {id: "b", text: "Tape", checked: true}, "Old string", {id: "c", text: " ", checked: true}]};
      const lines = completedMaterialLines(row);
      assert.deepEqual(lines, ["Tap | 12.50", "Tape", "Old string"]);
      assert.deepEqual(parseMaterialItems(lines.join("\n")).map(materialLine), lines);
    });
    it("completedChanges: costs show in the form, an untouched form sends nothing, an edited cost sends the list", () => {
      const api = load();
      const row = {title: "Fix tap", priority: "MEDIUM", estimatedMinutes: 30, trackedSeconds: 600, tags: [], materials: [{id: "a", text: "Washer", checked: true, cost: 2.5}, {id: "b", text: "Tape", checked: true}], completedAt: "2026-10-19T21:15:00.000Z"};
      const form = api.completedFormValues(row, "Pacific/Auckland");
      assert.equal(form.materials, "Washer | 2.50\nTape");
      assert.deepEqual(api.completedChanges(row, form, "Pacific/Auckland"), {fields: {}});
      assert.deepEqual(api.completedChanges(row, {...form, materials: "Washer | 3\nTape | 1.25\nGlue"}, "Pacific/Auckland"), {fields: {materials: [{text: "Washer", cost: 3}, {text: "Tape", cost: 1.25}, "Glue"]}});
      assert.deepEqual(api.completedChanges(row, {...form, materials: "Washer\nTape"}, "Pacific/Auckland"), {fields: {materials: ["Washer", "Tape"]}});
      assert.deepEqual(api.completedChanges(row, {...form, materials: ""}, "Pacific/Auckland"), {fields: {materials: null}});
    });
    it("completed edits with costs go through the server's validation", () => {
      const {applyCompletedEdit} = require("../completedEdit");
      const api = load();
      const row = {title: "Fix tap", priority: "MEDIUM", estimatedMinutes: 30, tags: [], completedAt: "2026-10-19T21:15:00.000Z"};
      const form = api.completedFormValues(row, "Pacific/Auckland");
      const {fields} = api.completedChanges(row, {...form, materials: "Washer | 2.5\nTape"}, "Pacific/Auckland");
      const r = applyCompletedEdit(row, fields, {projectIds: [], timeZone: "Pacific/Auckland", now: new Date("2026-10-25T00:00:00Z"), makeId: (() => {
        let n = 0;
        return () => `m${++n}`;
      })()});
      assert.deepEqual(r.set.materials, [{id: "m1", text: "Washer", checked: true, cost: 2.5}, {id: "m2", text: "Tape", checked: true}]);
    });
    it("templateFormValues turns template materials, strings or {text, cost}, into unchecked rows keeping costs", () => {
      const {templateFormValues} = load();
      const v = templateFormValues({title: "Paint", materials: [{text: "Paint", cost: 45.5}, {text: "Brush"}, "Tape"]});
      assert.deepEqual(v.materials, [{id: "", text: "Paint", checked: false, cost: 45.5}, {id: "", text: "Brush", checked: false}, {id: "", text: "Tape", checked: false}]);
    });
  });

  describe("due-date card colours", () => {
    const day = (offset) => new Date(Date.UTC(2026, 9, 25 + offset)).toISOString().slice(0, 10);
    const now = new Date("2026-10-25T01:00:00Z"); // 14:00 on 25 Oct in Auckland
    it("colours a card pale red when overdue and amber when due within 2 days, today included", () => {
      const {dueClass, DUE_SOON_DAYS} = load();
      assert.equal(DUE_SOON_DAYS, 2);
      assert.equal(dueClass({dueDate: day(-1)}, now), "due-overdue");
      assert.equal(dueClass({dueDate: day(-30)}, now), "due-overdue");
      assert.equal(dueClass({dueDate: day(0)}, now), "due-soon");
      assert.equal(dueClass({dueDate: day(1)}, now), "due-soon");
      assert.equal(dueClass({dueDate: day(2)}, now), "due-soon");
      assert.equal(dueClass({dueDate: day(3)}, now), "");
    });
    it("leaves a task with no usable due date plain", () => {
      const {dueClass} = load();
      for (const t of [{}, {dueDate: ""}, {dueDate: "soon"}, {dueDate: null}]) assert.equal(dueClass(t, now), "");
    });
    it("applies to queued cards only: the Active task keeps its timer tint", () => {
      assert.match(html, /isActive \? "" : dueClass\(t\)/);
    });
    it("has both colours as variables with identical dark values in both dark blocks", () => {
      assert.equal((html.match(/--card-soon-bg:/g) || []).length, 3);
      assert.equal((html.match(/--card-overdue-bg:/g) || []).length, 3);
      assert.match(html, /\.swipe-row\.swiping \.task-item\.due-soon/);
      assert.match(html, /\.swipe-row\.swiping \.task-item\.due-overdue/);
    });
  });
  describe("long-running timer warning", () => {
    const at = (iso) => Date.parse(iso);
    const running = {id: "a", timerStartedAt: "2026-10-25T00:00:00.000Z", trackedSeconds: 7200};
    it("counts only the current stretch, not the time saved before", () => {
      const {runningSeconds} = load();
      assert.equal(runningSeconds(running, at("2026-10-25T00:10:00.000Z")), 600);
      assert.equal(runningSeconds({id: "a", trackedSeconds: 9999}, at("2026-10-25T00:10:00.000Z")), 0);
      assert.equal(runningSeconds(running, at("2026-10-24T00:00:00.000Z")), 0);
      assert.equal(runningSeconds(null, 5), 0);
    });
    it("warns only once the stretch passes the threshold, offering a cap of the threshold", () => {
      const {longTimerWarning} = load();
      assert.equal(longTimerWarning(running, at("2026-10-25T06:00:00.000Z"), 6), null);
      assert.deepEqual(longTimerWarning(running, at("2026-10-25T07:12:00.000Z"), 6), {stretch: 7 * 3600 + 720, cap: 21600});
      assert.deepEqual(longTimerWarning(running, at("2026-10-25T03:00:01.000Z"), 2), {stretch: 10801, cap: 7200});
    });
    it("never warns for a paused timer, and falls back to 6 hours for an unusable threshold", () => {
      const {longTimerWarning, DEFAULT_TIMER_WARN_HOURS} = load();
      assert.equal(DEFAULT_TIMER_WARN_HOURS, 6);
      assert.equal(longTimerWarning({id: "a", trackedSeconds: 99999}, at("2026-10-25T09:00:00.000Z"), 6), null);
      assert.equal(longTimerWarning(running, at("2026-10-25T05:00:00.000Z"), undefined), null);
      assert.equal(longTimerWarning(running, at("2026-10-25T06:30:00.000Z"), 0).cap, 21600);
    });
    it("keeps the warning's buttons out of the card gestures and sends the cap with PAUSE", () => {
      assert.match(html, /e\.target\.closest\("\.timer-warning"\)\) return null/);
      assert.match(html, /sendTimerAction\(task\.id, "PAUSE", capIt && warning \? \{ capSeconds: warning\.cap \} : \{\}\)/);
    });
    it("has a Warn when a timer has run for field in the Scheduling settings", () => {
      assert.match(html, /<label for="timerWarnHours">Warn when a timer has run for \(hours\)<\/label>/);
    });
  });
  describe("job number search words", () => {
    it("splits hash-and-digits words from plain words, ignoring leading zeros and a bare hash", () => {
      const {jobNumberWords} = load();
      assert.deepEqual(jobNumberWords("#123 Fit tap #0007 #"), {numbers: [123, 7], words: ["fit", "tap"]});
      assert.deepEqual(jobNumberWords(""), {numbers: [], words: []});
      assert.deepEqual(jobNumberWords(undefined), {numbers: [], words: []});
      assert.deepEqual(jobNumberWords("#5a a#5"), {numbers: [], words: ["#5a", "a#5"]});
    });
    it("matchesSearch: a job number word finds that task only, alone or with title words", () => {
      const {matchesSearch: m} = load();
      const t = {title: "Fit tap", jobNumber: 123};
      assert.equal(m(t, "#123"), true);
      assert.equal(m(t, "#12"), false);
      assert.equal(m(t, "#1234"), false);
      assert.equal(m(t, "#123 tap"), true);
      assert.equal(m(t, "#123 basin"), false);
      assert.equal(m({title: "Fit tap"}, "#123"), false);
      assert.equal(m(t, "#"), true);
    });
    it("templateMatches still reads a hash word as text, since templates have no job number", () => {
      const {templateMatches} = load();
      const templates = [{title: "Bin day #3", completedCount: 2}, {title: "Other", completedCount: 1}];
      assert.deepEqual(templateMatches(templates, "#3").map((x) => x.title), ["Bin day #3"]);
    });
  });
  describe("settingsPayload", () => {
    const form = {location: {name: "Oslo", latitude: 59.9, longitude: 10.7, extra: "dropped"}, timeZone: "Europe/Oslo", scheduleDays: "14", gapMinutes: "10", timerWarnHours: "8", scheduleOrder: "NUMBER", dayStart: "08:30", dayEnd: "16:00", lunchEnabled: 1, lunchTime: "12:30", lunchMinutes: "45", enabled: 1, frequency: "INTERVAL", time: "06:30", intervalMinutes: "30"};
    it("builds the updateSettings body from the form", () => {
      const h = load();
      assert.deepEqual(h.settingsPayload(form), {
        location: {name: "Oslo", latitude: 59.9, longitude: 10.7},
        timeZone: "Europe/Oslo",
        scheduleDays: 14,
        gapMinutes: 10,
        timerWarnHours: 8,
        scheduleOrder: "NUMBER",
        day: {start: "08:30", end: "16:00"},
        lunch: {enabled: true, time: "12:30", minutes: 45},
        schedule: {enabled: true, frequency: "INTERVAL", time: "06:30", intervalMinutes: 30},
      });
    });
    it("leaves the timer warning out when its field is empty, so the saved value stays", () => {
      const h = load();
      assert.equal("timerWarnHours" in h.settingsPayload({...form, timerWarnHours: ""}), false);
      assert.equal("timerWarnHours" in h.settingsPayload({...form, timerWarnHours: undefined}), false);
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
  describe("Settings: collapsible cards", () => {
    const page = html.slice(html.indexOf("id=\"pageSettings\""), html.indexOf("</main>", html.indexOf("id=\"pageSettings\"")));
    it("makes every card a details element, collapsed by default, with its title as the summary", () => {
      const cards = [...page.matchAll(/<details class="card settings-card"([^>]*)>\s*<summary><h3>([^<]+)<\/h3><\/summary>/g)];
      assert.deepEqual(cards.map((m) => m[2]), ["Scheduling", "Job Sheets", "Clients", "Appearance", "Notifications", "Backup", "Tidy up"]);
      assert.ok(cards.every((m) => !/\bopen\b/.test(m[1])), "no card starts open");
    });
    it("leaves no plain card on the Settings page and balances the tags", () => {
      assert.doesNotMatch(page, /<div class="card"/);
      assert.equal((page.match(/<details\b/g) || []).length, 7);
      assert.equal((page.match(/<\/details>/g) || []).length, 7);
    });
    it("styles the summary with a marker that turns when the card opens", () => {
      assert.match(html, /\.settings-card\[open\] > summary::after \{ transform: rotate\(90deg\)/);
      assert.match(html, /\.settings-card > summary::-webkit-details-marker \{ display: none/);
    });
  });
  describe("Settings: delete duplicate tasks", () => {
    it("asks the server first with a dry run, then deletes only after a confirmation", () => {
      const fn = html.slice(html.indexOf("async function removeDuplicateTasks"), html.indexOf("async function downloadExport"));
      assert.match(fn, /post\(\{ dryRun: true \}\)/);
      assert.ok(fn.indexOf("dryRun: true") < fn.indexOf("askConfirm("));
      assert.ok(fn.indexOf("askConfirm(") < fn.indexOf("post({})"));
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
      assert.equal(c({title: "Mow lawn", recurrence: {frequency: "WEEKLY", interval: 1}}), "Mark \"Mow lawn\" as complete?\n\nIt repeats, so its next occurrence will be added.");
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

  describe("History summary", () => {
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
    it("pickHistoryProject: keeps the current choice while it exists, else the project with the newest week", () => {
      const {pickHistoryProject} = load();
      const entries = [
        {projectId: "a", weeks: [{weekStart: "2026-10-05"}]},
        {projectId: "b", weeks: [{weekStart: "2026-10-19"}, {weekStart: "2026-10-12"}]},
        {projectId: "c", weeks: [{weekStart: "2026-10-12"}]},
      ];
      assert.equal(pickHistoryProject(entries, "c"), "c");
      assert.equal(pickHistoryProject(entries, "gone"), "b");
      assert.equal(pickHistoryProject(entries, null), "b");
      assert.equal(pickHistoryProject([entries[0], entries[2]], null), "c");
      assert.equal(pickHistoryProject([], "a"), null);
      assert.equal(pickHistoryProject(undefined, null), null);
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
        assert.deepEqual(completedFormValues(row, NZ), {priority: "LOW", trackedMinutes: 2, tags: "Garden, Outdoor", materials: "", comments: "Front only", travelKm: "", projectId: "p1", date: "2026-10-18", time: "09:30"});
      });
      it("reopenPrompt: names the task, says it returns with its tracked time and leaves History", () => {
        const {reopenPrompt} = load();
        const text = reopenPrompt({title: "Mow lawn", trackedSeconds: 2700});
        assert.match(text, /^Reopen "Mow lawn"\?/);
        assert.match(text, /returns to the end of the queue with its 45m of tracked time and leaves History and Project hours until it is completed again\./);
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
        assert.match(fn, /await askConfirm\(reopenPrompt\(\{ \.\.\.row, \.\.\.result\.fields \}\), \{ tone: "info"/);
        assert.ok(fn.indexOf("UPDATE_COMPLETED_URL") < fn.indexOf("REOPEN_COMPLETED_URL"), "edits are saved before the reopen");
        assert.match(fn, /setTasks\(data\.tasks \|\| allTasks\)/);
        assert.match(fn, /templates = null;/);
        assert.match(fn, /await fetchCompleted\(\);/);
        assert.match(fn, /askAlert\(failureText\("Failed to reopen", err\), \{ tone: "error" \}\)/);
      });
      it("completedFormValues: falls back for a row missing fields", () => {
        const {completedFormValues} = load();
        const v = completedFormValues({completedAt: "2026-10-17T20:30:00.000Z"}, NZ);
        assert.deepEqual([v.priority, v.trackedMinutes, v.tags, v.comments, v.projectId], ["MEDIUM", 0, "", "", ""]);
      });
      it("completedChanges: has no estimate in the form and never sends one", () => {
        const api = load();
        assert.equal("estimatedMinutes" in same(api), false);
        assert.deepEqual(api.completedChanges(row, {...same(api), estimatedMinutes: "99"}, NZ), {fields: {}});
        assert.deepEqual(api.completedChanges({...row, estimatedMinutes: undefined}, same(api), NZ), {fields: {}});
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
      it("completedChanges: reports an unusable time, date or time of day", () => {
        const api = load();
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
      it("jobNumberText: the edit forms' job number line, empty without a usable number", () => {
        const {jobNumberText} = load();
        assert.equal(jobNumberText(1), "Job number 1");
        assert.equal(jobNumberText(123456), "Job number 123456");
        for (const v of [undefined, null, 0, -4, 1.5, "12", NaN]) assert.equal(jobNumberText(v), "");
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
      {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: ["Outdoor", "Garden"], recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: ["Petrol", "Oil"], comments: "Check the blade", travelKm: 18},
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
      assert.deepEqual(v, {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: "Outdoor, Garden", dueDate: "", recurFreq: "WEEKLY", recurInterval: 2, projectId: "p1", projectOrder: 2, materials: [{id: "", text: "Petrol", checked: false}, {id: "", text: "Oil", checked: false}], comments: "Check the blade", travelKm: "18", history: null});
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
      assert.deepEqual(templateFormValues({title: "x"}), {title: "x", priority: "MEDIUM", estimatedMinutes: 15, tags: "", dueDate: "", recurFreq: "NONE", recurInterval: 1, projectId: "", projectOrder: "", materials: [], comments: "", travelKm: "", history: null});
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

  describe("clients", () => {
    const clients = [{id: "c1", name: "Jo Smith", address: "1 Beach Rd\nWhangaparāoa", phone: "021 000", email: "jo@x.nz"}];
    const projects = [{id: "p1", name: "Deck", clientId: "c1"}, {id: "p2", name: "Fence"}, {id: "p3", name: "Shed", clientId: "gone"}];
    it("names a project's client, empty with none or an unknown one", () => {
      const {projectClientName} = load();
      assert.equal(projectClientName(projects[0], clients), "Jo Smith");
      assert.equal(projectClientName(projects[1], clients), "");
      assert.equal(projectClientName(projects[2], clients), "");
      assert.equal(projectClientName(null, clients), "");
      assert.equal(projectClientName(projects[0], undefined), "");
    });
    it("searches a project's name and its client's name", () => {
      const {projectSearchText, matchesCompletedSearch, completedBrowse} = load();
      assert.equal(projectSearchText("p1", projects, clients), "Deck Jo Smith");
      assert.equal(projectSearchText("p2", projects, clients), "Fence");
      assert.equal(projectSearchText("zzz", projects, clients), "");
      assert.equal(matchesCompletedSearch({title: "Fit rail"}, "smith", projectSearchText("p1", projects, clients)), true);
      assert.equal(matchesCompletedSearch({title: "Fit rail"}, "smith", projectSearchText("p2", projects, clients)), false);
      const rows = [{title: "A", projectId: "p1"}, {title: "B", projectId: "p2"}, {title: "C"}];
      const found = completedBrowse(rows, "jo deck", 1, (id) => projectSearchText(id, projects, clients));
      assert.deepEqual(found.items.map((r) => r.title), ["A"]);
    });
    it("summarises a client on one line", () => {
      const {clientSummary} = load();
      assert.equal(clientSummary(clients[0]), "1 Beach Rd, Whangaparāoa · 021 000 · jo@x.nz");
      assert.equal(clientSummary({name: "Jo", address: "", phone: "021"}), "021");
      assert.equal(clientSummary({name: "Jo"}), "");
      assert.equal(clientSummary(null), "");
    });
    it("shows a client's own hourly rate in the summary", () => {
      const {clientSummary} = load();
      assert.equal(clientSummary({name: "Jo", phone: "021", hourlyRate: 95}), "021 · $95.00/h");
      assert.equal(clientSummary({name: "Jo", hourlyRate: 72.5}), "$72.50/h");
      assert.equal(clientSummary({name: "Jo", hourlyRate: 0}), "$0.00/h");
      for (const hourlyRate of [undefined, null, -1, "95", NaN]) assert.equal(clientSummary({name: "Jo", hourlyRate}), "");
    });
    it("builds the form body, trimming the name only", () => {
      const {clientFormBody} = load();
      assert.deepEqual(clientFormBody({name: "  Jo ", address: "1 Rd\n", phone: " 1", email: "a@b.nz", hourlyRate: " 95.50 "}), {name: "Jo", address: "1 Rd\n", phone: " 1", email: "a@b.nz", hourlyRate: "95.50"});
      assert.deepEqual(clientFormBody({name: "Jo", hourlyRate: null}), {name: "Jo", address: "", phone: "", email: "", hourlyRate: ""});
      assert.deepEqual(clientFormBody(undefined), {name: "", address: "", phone: "", email: "", hourlyRate: ""});
    });
    it("asks before deleting, saying what happens to its projects", () => {
      const {deleteClientPrompt} = load();
      assert.equal(deleteClientPrompt("Jo", 0), "Delete client \"Jo\"?");
      assert.match(deleteClientPrompt("Jo", 1), /Its project stays on the list, with no client/);
      assert.match(deleteClientPrompt("Jo", 3), /Its 3 projects stay/);
    });
  });

  describe("project templates", () => {
    it("templateStepsText: singular and plural", () => {
      const {templateStepsText: t} = load();
      assert.equal(t(1), "1 step");
      assert.equal(t(0), "0 steps");
      assert.equal(t(7), "7 steps");
    });
    it("defaultProjectName: the template's name unless a project has it, else numbered, ignoring case", () => {
      const {defaultProjectName: d} = load();
      assert.equal(d("Deck", []), "Deck");
      assert.equal(d("Deck", undefined), "Deck");
      assert.equal(d("Deck", [{name: "Other"}]), "Deck");
      assert.equal(d("Deck", [{name: "deck"}]), "Deck 2");
      assert.equal(d("Deck", [{name: "DECK"}, {name: "Deck 2"}, {name: "deck 3"}]), "Deck 4");
    });
    it("builds the bodies updateProjectTemplate takes", () => {
      const h = load();
      assert.deepEqual(h.saveTemplateBody("p1", "Reno"), {action: "SAVE", projectId: "p1", name: "Reno"});
      assert.deepEqual(h.startTemplateBody("t1", "Back deck"), {action: "START", templateId: "t1", name: "Back deck"});
    });
    it("words the delete confirmation and the started message", () => {
      const h = load();
      assert.match(h.deleteTemplatePrompt("Deck"), /Delete template "Deck"\?\n\nProjects already started from it are not affected/);
      assert.equal(h.startedText("Back deck", 1), "Started \"Back deck\" with 1 task.");
      assert.equal(h.startedText("Back deck", 5), "Started \"Back deck\" with 5 tasks.");
    });
    it("has the Start from template controls in the Projects section and Save as template on the chosen project", () => {
      const section = html.slice(html.indexOf("id=\"projectsDetails\""), html.indexOf("id=\"taskList\""));
      for (const id of ["templateSelect", "templateProjectName", "startTemplateBtn", "renameTemplateBtn", "deleteTemplateBtn", "templateEmpty"]) assert.match(section, new RegExp(`id="${id}"`));
      assert.match(html, /data-action="saveTemplate"/);
      assert.match(html, /endpoint\("getProjectTemplates"\)/);
      assert.match(html, /endpoint\("updateProjectTemplate"\)/);
    });
    it("declares every function in the page once, so one never replaces another of the same name", () => {
      const code = html.replace(/\/\/.*$/gm, "");
      const names = [...code.matchAll(/(?:^|\s)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
      const repeated = names.filter((n, i) => names.indexOf(n) !== i);
      assert.deepEqual([...new Set(repeated)], []);
    });
    it("keeps the add field's completed-task search and the project templates on separate loaders", () => {
      assert.match(html, /async function searchTemplates\(\) \{[^}]*await loadTemplates\(\);/);
      assert.match(html, /function loadTemplates\(\) \{\s*if \(templates\) return Promise\.resolve\(templates\);[\s\S]*?apiFetch\(TEMPLATES_URL\)/);
      assert.match(html, /async function loadProjectTemplates\(\) \{\s*try \{\s*const res = await apiFetch\(GET_TEMPLATES_URL\);/);
    });
    it("loads the templates after sign-in", () => {
      const from = html.indexOf("lib.onAuthStateChanged");
      const signedIn = html.slice(from, html.indexOf("showGate(", from));
      assert.match(signedIn, /loadProjectTemplates\(\);/);
      assert.doesNotMatch(signedIn, /(?<![A-Za-z])loadTemplates\(\)/, "the completed-task search loads on its first keystroke, not here");
    });
  });

  describe("completed work CSV", () => {
    it("csvRequestBody: keeps real-looking dates and turns anything else into no limit", () => {
      const {csvRequestBody: b} = load();
      assert.deepEqual(b("2026-10-01", "2026-10-31"), {from: "2026-10-01", to: "2026-10-31"});
      assert.deepEqual(b("", "2026-10-31"), {from: "", to: "2026-10-31"});
      assert.deepEqual(b(undefined, "junk"), {from: "", to: ""});
    });
    it("csvFilename: names the range, one open side, or today", () => {
      const {csvFilename: f} = load();
      assert.equal(f("2026-10-01", "2026-10-31", "2026-10-25"), "completed-work-2026-10-01-to-2026-10-31.csv");
      assert.equal(f("2026-10-01", "", "2026-10-25"), "completed-work-from-2026-10-01.csv");
      assert.equal(f("", "2026-10-31", "2026-10-25"), "completed-work-to-2026-10-31.csv");
      assert.equal(f("", "", "2026-10-25"), "completed-work-2026-10-25.csv");
      assert.equal(f("", "", ""), "completed-work.csv");
    });
    it("has the date range and Download button in the Backup card, posting through apiFetch", () => {
      const backup = html.slice(html.indexOf("<summary><h3>Backup</h3></summary>"), html.indexOf("<summary><h3>Tidy up</h3></summary>"));
      for (const id of ["csvFrom", "csvTo", "csvBtn", "csvStatus"]) assert.match(backup, new RegExp(`id="${id}"`));
      assert.match(backup, /type="date" id="csvFrom"/);
      assert.match(html, /endpoint\("exportCompletedCsv"\)/);
      const fn = html.slice(html.indexOf("async function downloadCsv"), html.indexOf("async function downloadExport"));
      assert.match(fn, /apiFetch\(EXPORT_CSV_URL/);
      assert.match(fn, /csvRequestBody\(from, to\)/);
    });
  });

  describe("share to TaskHub", () => {
    it("sharedText: the text, else the title, with the link added unless the text holds it", () => {
      const {sharedText: t} = load();
      assert.equal(t({text: "Buy tap washers"}), "Buy tap washers");
      assert.equal(t({title: "Tap washers", text: ""}), "Tap washers");
      assert.equal(t({title: "Ignored", text: "Read this"}), "Read this");
      assert.equal(t({text: "Read this", url: "https://a.example/x"}), "Read this https://a.example/x");
      assert.equal(t({text: "Read https://a.example/x now", url: "https://a.example/x"}), "Read https://a.example/x now");
      assert.equal(t({title: "Page", url: "https://a.example/x"}), "Page https://a.example/x");
      assert.equal(t({url: "https://a.example/x"}), "https://a.example/x");
    });
    it("sharedText: collapses whitespace, caps the length and ignores unusable input", () => {
      const {sharedText: t} = load();
      assert.equal(t({text: "  one\n two\t three "}), "one two three");
      assert.equal(t({text: "x".repeat(3000)}).length, 2000);
      for (const v of [undefined, null, {}, {text: 5, url: {}}, {text: "  "}]) assert.equal(t(v), "");
    });
    it("shareFromSearch: reads the query string and says whether it was a share", () => {
      const {shareFromSearch: f} = load();
      assert.deepEqual(f("?title=T&text=Fix%20the%20gate&url=https%3A%2F%2Fa.example"), {text: "Fix the gate https://a.example", shared: true});
      assert.deepEqual(f("?text="), {text: "", shared: true});
      assert.deepEqual(f("?other=1"), {text: "", shared: false});
      assert.deepEqual(f(""), {text: "", shared: false});
      assert.deepEqual(f(undefined), {text: "", shared: false});
    });
    it("keeps the shared text through sign-in and puts it in the add field once signed in, adding nothing", () => {
      assert.match(html, /sessionStorage\.setItem\(SHARE_KEY, text\)/);
      assert.match(html, /history\.replaceState\(null, "", location\.pathname \+ location\.hash\)/);
      const from = html.indexOf("lib.onAuthStateChanged");
      const signedIn = html.slice(from, html.indexOf("showGate(", from));
      assert.match(signedIn, /showApp\(\);\s*applyPendingShare\(\);/);
      const fn = html.slice(html.indexOf("function applyPendingShare"), html.indexOf("// Dark mode:"));
      assert.match(fn, /showTab\("queue"\)/);
      assert.match(fn, /input\.value = text/);
      assert.doesNotMatch(fn, /addTask|apiFetch|fetch\(/);
    });
  });
  describe("notifications card", () => {
    it("explains why a browser cannot use notifications and offers nothing", () => {
      const {pushState} = load();
      const st = pushState({supported: false, permission: "default", enabled: false});
      assert.equal(st.state, "UNSUPPORTED");
      assert.deepEqual([st.canEnable, st.canDisable, st.canTest], [false, false, false]);
      assert.match(st.text, /Home Screen/);
    });
    it("offers to turn on while permission has not been refused", () => {
      const {pushState} = load();
      for (const permission of ["default", "granted"]) {
        const st = pushState({supported: true, permission, enabled: false});
        assert.equal(st.state, "OFF");
        assert.deepEqual([st.canEnable, st.canDisable, st.canTest], [true, false, false]);
      }
    });
    it("is on only with permission and a registered token, and then allows a test and turning off", () => {
      const {pushState} = load();
      const st = pushState({supported: true, permission: "granted", enabled: true});
      assert.equal(st.state, "ON");
      assert.deepEqual([st.canEnable, st.canDisable, st.canTest], [false, true, true]);
    });
    it("treats a token without permission as off, so it can be turned on again or cleared", () => {
      const {pushState} = load();
      const st = pushState({supported: true, permission: "default", enabled: true});
      assert.equal(st.state, "OFF");
      assert.deepEqual([st.canEnable, st.canDisable, st.canTest], [true, true, false]);
    });
    it("explains a blocked site and still lets a saved token be cleared", () => {
      const {pushState} = load();
      const st = pushState({supported: true, permission: "denied", enabled: true});
      assert.equal(st.state, "DENIED");
      assert.deepEqual([st.canEnable, st.canDisable, st.canTest], [false, true, false]);
      assert.equal(pushState({supported: true, permission: "denied", enabled: false}).canDisable, false);
    });
    it("builds the token request body", () => {
      const {pushTokenBody} = load();
      assert.deepEqual(pushTokenBody("REGISTER", "abc"), {action: "REGISTER", token: "abc"});
      assert.deepEqual(pushTokenBody("UNREGISTER", "abc"), {action: "UNREGISTER", token: "abc"});
      assert.deepEqual(pushTokenBody("anything", undefined), {action: "REGISTER", token: ""});
    });
    it("reports a test in words", () => {
      const {pushTestText} = load();
      assert.equal(pushTestText({sent: 1}), "Sent to 1 device.");
      assert.equal(pushTestText({sent: 2, removed: 0}), "Sent to 2 devices.");
      assert.equal(pushTestText({sent: 1, removed: 1}), "Sent to 1 device. 1 no longer reachable and removed.");
      assert.equal(pushTestText(null), "Sent to 0 devices.");
    });
    it("sends the token only to our own functions and asks for permission before anything slow", () => {
      assert.match(html, /const PUSH_TOKEN_URL = endpoint\("updatePushToken"\)/);
      const enable = html.slice(html.indexOf("async function enablePush"), html.indexOf("async function disablePush"));
      assert.ok(enable.indexOf("Notification.requestPermission()") < enable.indexOf("fetchPushToken()"), "the permission prompt comes first, inside the tap");
    });
    it("keeps the token on the device and never in a place the server could not clear", () => {
      assert.match(html, /const PUSH_KEY = "taskhub-push-token"/);
    });
  });
  describe("notification alert choices", () => {
    it("reads the saved choices and defaults what is missing, as the server does", () => {
      const {notifyFormValues} = load();
      assert.deepEqual(notifyFormValues({notify: {runFailed: false, weatherMoved: true, taskStarting: false, leadMinutes: 120}}), {runFailed: false, weatherMoved: true, taskStarting: false, leadMinutes: 120});
      for (const s of [undefined, null, {}, {notify: {}}, {notify: {leadMinutes: "60"}}]) {
        assert.deepEqual(notifyFormValues(s), {runFailed: true, weatherMoved: true, taskStarting: true, leadMinutes: 30});
      }
    });
    it("sends only the notify group, with a numeric lead", () => {
      const {notifyPayload} = load();
      assert.deepEqual(notifyPayload({runFailed: true, weatherMoved: false, taskStarting: true, leadMinutes: "60"}), {notify: {runFailed: true, weatherMoved: false, taskStarting: true, leadMinutes: 60}});
      assert.deepEqual(Object.keys(notifyPayload({})), ["notify"]);
    });
    it("saves on change and puts the controls back when the save fails", () => {
      const fn = html.slice(html.indexOf("async function saveNotifySettings"), html.indexOf("// Save the contractor information alone."));
      assert.match(fn, /notifyPayload\(/);
      assert.match(fn, /catch \(err\) \{\s*renderNotifySettings\(currentSettings\)/);
      for (const id of ["notifyRunFailed", "notifyWeather", "notifyStarting", "notifyLead"]) assert.ok(html.includes(`"${id}"`), id);
    });
  });
  describe("Multi-Select", () => {
    it("keeps the selection to tasks still on the list and toggles one id at a time without touching the original", () => {
      const {pruneSelection, toggledSelection} = load();
      const picked = new Set(["a", "b", "gone"]);
      assert.deepEqual([...pruneSelection(picked, [{id: "a"}, {id: "b"}, {id: "c"}])], ["a", "b"]);
      assert.deepEqual([...pruneSelection(null, [{id: "a"}])], []);
      const on = toggledSelection(new Set(["a"]), "b");
      assert.deepEqual([...on], ["a", "b"]);
      assert.deepEqual([...toggledSelection(on, "a")], ["b"]);
      assert.deepEqual([...picked], ["a", "b", "gone"]);
    });
    it("words the count line, saying how many selected tasks the search and filters hide", () => {
      const {batchCountText, taskCountText} = load();
      assert.equal(batchCountText(0, 0), "Tap tasks to select them");
      assert.equal(batchCountText(3, 0), "3 selected");
      assert.equal(batchCountText(3, 2), "3 selected (2 hidden by the search or filters)");
      assert.equal(taskCountText(1), "1 task");
      assert.equal(taskCountText(4), "4 tasks");
    });
    it("asks before a batch complete or delete, mentions repeating tasks on complete and says there is no Undo", () => {
      const {batchRemovePrompt} = load();
      const tasks = [{title: "A"}, {title: "B", recurrence: {frequency: "WEEKLY", interval: 1}}, {title: "C", recurrence: {frequency: "DAILY", interval: 1}}];
      const complete = batchRemovePrompt("COMPLETE", tasks);
      assert.match(complete, /^Complete 3 tasks\?/);
      assert.match(complete, /2 repeat, so their next occurrences will be added\./);
      assert.match(complete, /Undo is not available for a batch\./);
      assert.match(batchRemovePrompt("COMPLETE", [tasks[1]]), /1 repeats, so its next occurrence will be added\./);
      const del = batchRemovePrompt("DELETE", tasks);
      assert.match(del, /^Delete 3 tasks\?/);
      assert.doesNotMatch(del, /repeat/);
      assert.match(batchRemovePrompt("DELETE", [tasks[0]]), /^Delete 1 task\?/);
    });
    it("reports a batch complete or delete, naming the failures", () => {
      const {batchRemoveResultText} = load();
      assert.equal(batchRemoveResultText("COMPLETE", 4, 0, ""), "Completed 4 tasks.");
      assert.equal(batchRemoveResultText("DELETE", 1, 0, ""), "Deleted 1 task.");
      assert.equal(batchRemoveResultText("DELETE", 4, 1, "Request failed (500)"), "Deleted 3 of 4 tasks. 1 failed (Request failed (500)); it is still selected.");
      assert.equal(batchRemoveResultText("COMPLETE", 4, 2, "x"), "Completed 2 of 4 tasks. 2 failed (x); they are still selected.");
    });
    it("builds the batchUpdateTasks body from the selection and words a snooze result", () => {
      const {batchBody, batchSnoozeText} = load();
      assert.deepEqual(batchBody("SNOOZE", new Set(["a", "b"]), {snoozedUntil: "2026-11-02"}), {action: "SNOOZE", taskIds: ["a", "b"], snoozedUntil: "2026-11-02"});
      assert.deepEqual(batchBody("MOVE_TO_TOP", ["a"]), {action: "MOVE_TO_TOP", taskIds: ["a"]});
      assert.equal(batchSnoozeText(2, "2026-11-02", ""), "Snoozed 2 tasks until 2026-11-02.");
      assert.equal(batchSnoozeText(1, null, ""), "Unsnoozed 1 task.");
      assert.match(batchSnoozeText(2, "2026-11-02", "boom"), /could not be moved yet \(boom\)/);
    });
    it("has a Select button, a bar with the six actions and a dialog for the three that need a choice", () => {
      for (const id of ["selectModeBtn", "batchStatus", "batchBar", "batchCount", "batchAllBtn", "batchNoneBtn", "batchModal", "batchSnoozePane", "batchDuePane", "batchProjectPane", "batchProject", "batchNewProject", "batchProjectSetBtn", "batchDueClearBtn", "batchUnsnoozeBtn"]) assert.ok(html.includes(`id="${id}"`), id);
      for (const action of ["COMPLETE", "DELETE", "SNOOZE", "TOP", "PROJECT", "DUE"]) assert.ok(html.includes(`data-batch="${action}"`), action);
      assert.ok(html.indexOf("id=\"selectModeBtn\"") > html.indexOf("id=\"sortDirBtn\""));
      assert.ok(html.indexOf("id=\"batchBar\"") > html.indexOf("id=\"taskList\""));
      assert.match(html, /new Option\("＋ New project…", NEW_PROJECT\)/);
      assert.match(html, /\{ newProject: name \}/);
    });
    it("makes a queued card take only taps while selecting, and never makes the Active task selectable", () => {
      const down = html.slice(html.indexOf("const onTaskRowDown"), html.indexOf("const onTaskRowMove"));
      assert.match(down, /if \(selectMode && !item\.closest\("#activeTaskBox"\)\) \{ swipe = null; return; \}/);
      assert.ok(down.indexOf("selectMode") < down.indexOf("setTimeout"), "no long press while selecting");
      const click = html.slice(html.indexOf("const onTaskRowClick"), html.indexOf("for (const id of [\"taskList\""));
      assert.match(click, /selectMode && !item\.closest\("#activeTaskBox"\)\) return toggleSelected\(item\.dataset\.id\)/);
      assert.ok(click.indexOf("toggleSelected") < click.indexOf("openEditModal"));
      const row = html.slice(html.indexOf("function swipeRowHtml"), html.indexOf("// The active task's tracked time ticks"));
      assert.match(row, /if \(selectMode && !isActive\) return `<div class="swipe-row">\$\{taskItemHtml\(t\)\}<\/div>`/);
      const render = html.slice(html.indexOf("function renderTaskRows"), html.indexOf("function renderMaterialRows"));
      assert.match(render, /selectedIds = pruneSelection\(selectedIds, rest\)/, "the Active task is left out of `rest`");
      assert.match(render, /shownIds = new Set\(filtered\.map/);
    });
    it("completes and deletes through the single-task calls with no Undo footnote, in queue order, keeping failures selected", () => {
      const fn = html.slice(html.indexOf("async function batchRemove"), html.indexOf("// One call to batchUpdateTasks"));
      assert.match(fn, /hideUndoNote\(\)/);
      assert.match(fn, /selectedTasks\(\)/);
      assert.match(fn, /noUndo: true/);
      assert.match(fn, /COMPLETE_TASK_URL : DIRECT_UPDATE_URL/);
      assert.match(fn, /selectedIds = new Set\(failedIds\)/);
      assert.match(html, /function selectedTasks\(\) \{\s*return sortTasks\(allTasks\.filter\(t => selectedIds\.has\(t\.id\)\), "number", false\);/);
      const remove = html.slice(html.indexOf("function removeTask("), html.indexOf("async function completeTask("));
      assert.match(remove, /if \(!opts\.noUndo\) \{\s*undoNoteTaskId = taskId;\s*showUndoNote/);
      assert.match(remove, /if \(opts\.onError\) opts\.onError\(err, taskId\);\s*else askAlert/);
    });
    it("sends the other actions to batchUpdateTasks, leaves Multi-Select on success and keeps the selection on a failure", () => {
      assert.match(html, /const BATCH_UPDATE_URL = endpoint\("batchUpdateTasks"\);/);
      const fn = html.slice(html.indexOf("async function batchSend"), html.indexOf("// The dialog for the batch actions"));
      assert.match(fn, /apiFetch\(BATCH_UPDATE_URL/);
      assert.match(fn, /if \(data\.projects\) allProjects = data\.projects;/);
      assert.match(fn, /setSelectMode\(false\)/);
      assert.match(fn, /catch \(err\) \{[^}]*askAlert\(/);
      assert.ok(fn.indexOf("catch") > fn.indexOf("setSelectMode(false)"));
      assert.equal(fn.slice(fn.indexOf("catch")).includes("setSelectMode"), false);
      for (const action of ["MOVE_TO_TOP", "SNOOZE", "SET_DUE", "SET_PROJECT"]) assert.ok(html.includes(`batchBody("${action}"`), action);
    });
  });
  describe("the confirmation dialog", () => {
    it("takes the first paragraph as the title and the rest as the detail", () => {
      const {confirmView} = load();
      const v = confirmView("Abort \"Mow lawn\"?\n\nIts timer stops.\n\nThe time is erased.", {tone: "warning", confirmLabel: "Abort"});
      assert.equal(v.title, "Abort \"Mow lawn\"?");
      assert.deepEqual(v.detail, [{text: "Its timer stops.", list: false}, {text: "The time is erased.", list: false}]);
      assert.equal(v.confirmLabel, "Abort");
      assert.equal(v.tone, "warning");
    });
    it("never splits a title on a question mark or quote inside the task's own name", () => {
      const {confirmView} = load();
      const v = confirmView("Delete \"Why? Because 5\" pipe\"?");
      assert.equal(v.title, "Delete \"Why? Because 5\" pipe\"?");
      assert.deepEqual(v.detail, []);
    });
    it("shows a paragraph that starts with a bullet as a list", () => {
      const {confirmView} = load();
      const v = confirmView("Delete 2 duplicate tasks?\n\nThe earlier copy is kept.\n\n\u2022 Mow\n\u2022 Rake\n\u2026and 3 more");
      assert.deepEqual(v.detail.map((d) => d.list), [false, true]);
      assert.equal(v.detail[1].text, "\u2022 Mow\n\u2022 Rake\n\u2026and 3 more");
    });
    it("treats a blank line with spaces on it as a paragraph break and ignores surrounding blank lines", () => {
      const {confirmView} = load();
      const v = confirmView("\n\nDelete it?\n  \nIt is gone.\n\n");
      assert.equal(v.title, "Delete it?");
      assert.deepEqual(v.detail, [{text: "It is gone.", list: false}]);
    });
    it("falls back to a plain question, the info tone and an OK button for missing or odd input", () => {
      const {confirmView} = load();
      for (const v of [confirmView(), confirmView(null, null), confirmView("", {tone: "nonsense", confirmLabel: "  "}), confirmView("   ", {tone: "__proto__"})]) {
        assert.equal(v.title, "Are you sure?");
        assert.equal(v.tone, "info");
        assert.equal(v.confirmLabel, "OK");
        assert.deepEqual(v.detail, []);
      }
    });
    it("opens with Cancel focused for every tone that destroys something, and on the confirm button otherwise", () => {
      const {confirmView} = load();
      assert.equal(confirmView("x?", {tone: "danger"}).focusCancel, true);
      assert.equal(confirmView("x?", {tone: "warning"}).focusCancel, true);
      assert.equal(confirmView("x?", {tone: "success"}).focusCancel, false);
      assert.equal(confirmView("x?", {tone: "info"}).focusCancel, false);
    });
    it("draws an icon for every tone from the tone's colour, never a fixed one", () => {
      const {CONFIRM_TONES} = load();
      assert.deepEqual(Object.keys(CONFIRM_TONES).sort(), ["danger", "edit", "error", "info", "save", "success", "warning"]);
      for (const tone of Object.values(CONFIRM_TONES)) {
        assert.match(tone.icon, /^<svg [^>]*stroke="currentColor"/);
        assert.doesNotMatch(tone.icon, /#[0-9a-fA-F]{3,8}\b/);
      }
    });
    it("splits each prompt into its question and its detail with a blank line", () => {
      const {confirmView, abortPrompt, completePrompt, deleteProjectPrompt, deleteClientPrompt, deleteTemplatePrompt, reopenPrompt, batchRemovePrompt} = load();
      assert.equal(confirmView(abortPrompt({title: "Mow lawn"})).title, "Abort \"Mow lawn\"?");
      assert.equal(confirmView(abortPrompt({title: "Mow lawn"})).detail.length, 1);
      assert.equal(confirmView(completePrompt({title: "Mow lawn", recurrence: {frequency: "WEEKLY", interval: 1}})).detail.length, 1);
      assert.equal(confirmView(completePrompt({title: "Mow lawn"})).detail.length, 0);
      assert.equal(confirmView(deleteProjectPrompt("Garden", 3)).title, "Delete project \"Garden\"?");
      assert.equal(confirmView(deleteProjectPrompt("Garden", 3)).detail.length, 1);
      assert.equal(confirmView(deleteProjectPrompt("Garden", 0)).detail.length, 0);
      assert.equal(confirmView(deleteClientPrompt("Jo", 2)).title, "Delete client \"Jo\"?");
      assert.equal(confirmView(deleteClientPrompt("Jo", 2)).detail.length, 1);
      assert.equal(confirmView(deleteTemplatePrompt("Deck")).title, "Delete template \"Deck\"?");
      assert.equal(confirmView(deleteTemplatePrompt("Deck")).detail.length, 1);
      assert.equal(confirmView(reopenPrompt({title: "Mow lawn"})).title, "Reopen \"Mow lawn\"?");
      assert.equal(confirmView(batchRemovePrompt("DELETE", [{}, {}])).title, "Delete 2 tasks?");
    });
    it("replaces every native confirm() in the page", () => {
      const code = html.replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(code, /(?<![\w.])confirm\(/, "a native confirm() is left");
      const asks = code.match(/(?<!function )askConfirm\(/g) || [];
      assert.equal(asks.length, 12, "the twelve questions the page asks");
    });
    it("marks the dialog up as a modal alert dialog above every other modal, with Cancel and a confirm button", () => {
      assert.match(html, /<div id="confirmModal" class="modal-overlay confirm-overlay"/);
      assert.match(html, /role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmDetail"/);
      assert.match(html, /id="confirmCancelBtn"[^>]*>Cancel</);
      assert.match(html, /id="confirmOkBtn"/);
      const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
      const z = (selector) => Number(new RegExp(`${selector} \\{[^}]*?z-index: (\\d+)`).exec(css)[1]);
      assert.ok(z("\\.confirm-overlay") > z("#photoModal"), "above the photo viewer");
      assert.ok(z("\\.confirm-overlay") > z("\\.modal-overlay"), "above the other modals");
    });
    it("puts the owner's text in the dialog as text, never as markup", () => {
      const fn = html.slice(html.indexOf("function openConfirm"), html.indexOf("function askConfirm"));
      assert.match(fn, /getElementById\("confirmTitle"\)\.textContent = view\.title/);
      assert.match(fn, /p\.textContent = part\.text/);
      assert.equal((fn.match(/innerHTML/g) || []).length, 1, "only the fixed icon markup is set as HTML");
      assert.match(fn, /icon\.innerHTML = view\.icon/);
    });
    it("cancels on Escape, a tap outside the card and a second question, and leaves a modal underneath locked", () => {
      const dom = html.slice(html.indexOf("let confirmPending"), html.indexOf("// Share to TaskHub"));
      assert.match(dom, /e\.key === "Escape"[\s\S]*settleConfirm\(false\)/);
      assert.match(dom, /e\.target\.id === "confirmModal"\) settleConfirm\(false\)/);
      assert.match(dom, /function openConfirm\(text, options\) \{\s*settleConfirm\(false\);/);
      assert.match(dom, /bodyWasLocked: document\.body\.classList\.contains\("modal-open"\)/);
      assert.match(dom, /if \(!pending\.bodyWasLocked\) document\.body\.classList\.remove\("modal-open"\)/);
    });
    it("keeps the swipe card pulled aside until the question is answered, then lets it snap back", () => {
      const up = html.slice(html.indexOf("const onTaskRowUp"), html.indexOf("const onTaskRowClick"));
      assert.match(up, /const onTaskRowUp = async e =>/);
      assert.ok(up.lastIndexOf("await ") < up.indexOf("resetSwipe(s)"), "the card is reset after the last answer");
    });
  });
  describe("the input dialog", () => {
    it("has no text field for a plain question and one for an input question", () => {
      const {confirmView} = load();
      assert.equal(confirmView("Delete it?", {tone: "danger"}).input, null);
      assert.deepEqual(confirmView("Rename project", {input: true, value: "Kitchen", placeholder: "Name"}).input, {value: "Kitchen", placeholder: "Name", maxLength: 100});
    });
    it("starts the field empty, without a placeholder and limited to 100 characters unless told otherwise", () => {
      const {confirmView} = load();
      assert.deepEqual(confirmView("Name it", {input: true}).input, {value: "", placeholder: "", maxLength: 100});
      assert.deepEqual(confirmView("Name it", {input: true, value: null, placeholder: 5, maxLength: 0}).input, {value: "", placeholder: "", maxLength: 100});
      assert.equal(confirmView("Name it", {input: true, maxLength: 40}).input.maxLength, 40);
      assert.equal(confirmView("Name it", {input: true, value: 12}).input.value, "12");
    });
    it("draws the edit and save tones in the info colours", () => {
      const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
      assert.match(css, /\.confirm-icon\.edit, \.confirm-icon\.save \{ background: var\(--time-bg\); color: var\(--time-fg\); \}/);
    });
    it("asks for the three names with the input dialog, and no native prompt() is left", () => {
      const code = html.replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(code, /(?<![\w.])prompt\(/, "a native prompt() is left");
      assert.equal((code.match(/(?<!function )askInput\(/g) || []).length, 3);
      assert.match(code, /await askInput\("Rename project", \{ tone: "edit", confirmLabel: "Rename", value: project\.name \}\);\s*if \(name === null \|\| name === project\.name\) return;/);
      assert.match(code, /await askInput\("Rename template", \{ tone: "edit", confirmLabel: "Rename", value: template\.name \}\);\s*if \(name === null \|\| name === template\.name\) return;/);
      assert.match(code, /await askInput\(`Save as template[^`]*`, \{ tone: "save", confirmLabel: "Save"[^\n]*defaultProjectName\(project\.name[^\n]*\n\s*if \(name === null\) return;/);
    });
    it("answers with the trimmed text or null, and keeps the confirm button off while the field is blank", () => {
      const dom = html.slice(html.indexOf("let confirmPending"), html.indexOf("// Share to TaskHub"));
      assert.match(dom, /const result = pending\.input \? \(answer \? field\.value\.trim\(\) : null\) : answer;/);
      assert.match(dom, /ok\.disabled = !!view\.input && !field\.value\.trim\(\);/);
      assert.match(dom, /"input", e => \{\s*document\.getElementById\("confirmOkBtn"\)\.disabled = !e\.target\.value\.trim\(\);/);
      assert.match(dom, /e\.key === "Enter" && e\.target === field && !e\.isComposing[\s\S]*if \(!ok\.disabled\) settleConfirm\(true\)/);
    });
    it("sets the field's value as a property, never as markup", () => {
      const fn = html.slice(html.indexOf("function openConfirm"), html.indexOf("function askConfirm"));
      assert.match(fn, /field\.value = view\.input\.value;/);
      assert.equal((fn.match(/innerHTML/g) || []).length, 1);
    });
  });
  describe("the alert dialog", () => {
    it("shows an alert with the one button: no Cancel, no text field, the button focused whatever the tone", () => {
      const {confirmView} = load();
      const v = confirmView("Pick a due date.", {alert: true, tone: "warning", input: true, value: "x"});
      assert.equal(v.alert, true);
      assert.equal(v.input, null);
      assert.equal(v.focusCancel, false);
      assert.equal(v.tone, "warning");
      assert.equal(confirmView("Delete it?", {tone: "danger"}).alert, false);
      assert.equal(confirmView("Delete it?", {tone: "danger"}).focusCancel, true);
      assert.equal(confirmView("Pick a due date.", {alert: true, tone: "danger"}).focusCancel, false);
    });
    it("has an error tone drawn in the danger colours", () => {
      const {confirmView} = load();
      assert.equal(confirmView("Failed", {tone: "error"}).tone, "error");
      const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
      assert.match(css, /\.confirm-icon\.danger, \.confirm-icon\.error \{ background: var\(--overdue-bg\); color: var\(--overdue-fg\); \}/);
      assert.match(css, /\.confirm-ok\.danger, \.confirm-actions \.confirm-ok\.error \{ background: var\(--danger\); \}/);
    });
    it("failureText: the failed action as the title and the reason as the detail", () => {
      const {failureText, confirmView} = load();
      assert.equal(failureText("Failed to save changes", new Error("Request failed (500)")), "Failed to save changes\n\nRequest failed (500)");
      assert.equal(failureText("Photo failed", "Too big"), "Photo failed\n\nToo big");
      assert.equal(failureText("Failed to snooze", new Error("  ")), "Failed to snooze");
      assert.equal(failureText("Failed to snooze", null), "Failed to snooze");
      assert.equal(failureText("Failed to snooze", {}), "Failed to snooze");
      const v = confirmView(failureText("Error undoing", new Error("Nothing to undo")), {tone: "error", alert: true});
      assert.equal(v.title, "Error undoing");
      assert.deepEqual(v.detail, [{text: "Nothing to undo", list: false}]);
    });
    it("replaces every native alert() in the page: warnings for a value to fix, errors for a failed call", () => {
      const code = html.replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(code, /(?<![\w.])alert\(/, "a native alert() is left");
      const calls = code.match(/(?<!function )askAlert\(/g) || [];
      assert.equal(calls.length, 29, "the twenty-nine messages the page shows");
      const errors = code.match(/askAlert\(failureText\([^\n]*\{ tone: "error" \}\)/g) || [];
      assert.equal(errors.length, 15, "every failed call is an error alert with the reason as detail");
      const warnings = code.match(/askAlert\([^;\n]*?\{ tone: "warning" \}\)/g) || [];
      assert.equal(warnings.length, 14, "every validation message is a warning alert");
    });
    it("hides Cancel for an alert, shows it again for a question and focuses the button", () => {
      const fn = html.slice(html.indexOf("function openConfirm"), html.indexOf("function askConfirm"));
      assert.match(fn, /cancel\.hidden = view\.alert;/);
      assert.match(fn, /\(view\.focusCancel \? cancel : ok\)\.focus/);
      assert.equal((fn.match(/innerHTML/g) || []).length, 1);
    });
    it("waits for a question that is open and shows alerts one after another, never cancelling anything", () => {
      const dom = html.slice(html.indexOf("let confirmPending"), html.indexOf("// Share to TaskHub"));
      assert.match(dom, /function pumpAlerts\(\) \{\s*if \(confirmPending \|\| !alertQueue\.length\) return;/);
      assert.match(dom, /openConfirm\(next\.text, \{ \.\.\.next\.options, alert: true \}\)\.then\(\(\) => \{\s*next\.resolve\(\);\s*pumpAlerts\(\);/);
      assert.match(dom, /function askAlert\(text, options\) \{\s*return new Promise\(resolve => \{\s*alertQueue\.push\(\{ text, options, resolve \}\);\s*pumpAlerts\(\);/);
      assert.match(dom, /pending\.resolve\(result\);\s*queueMicrotask\(pumpAlerts\);/);
    });
    it("waits for the answer before moving focus to the field the message is about", () => {
      const at = html.indexOf("async function submitTask");
      const fn = html.slice(at, at + 1500);
      assert.match(fn, /await askAlert\("Enter a name for the new project, or choose another project\.", \{ tone: "warning" \}\);\s*document\.getElementById\("manualNewProject"\)\.focus\(\);/);
    });
  });
  describe("the Miscellaneous list", () => {
    it("shoppingItemText: collapses whitespace and trims, empty for blank or missing text", () => {
      const {shoppingItemText} = load();
      assert.equal(shoppingItemText("  Duct \n  tape "), "Duct tape");
      for (const v of ["", "  \n ", null, undefined]) assert.equal(shoppingItemText(v), "");
      assert.equal(shoppingItemText(42), "42");
    });
    it("is a section at the bottom of the Materials to get card, laid out like a task's materials", () => {
      const page = html.slice(html.indexOf("<main id=\"pageMaterials\""), html.indexOf("</main>", html.indexOf("<main id=\"pageMaterials\"")));
      assert.equal((page.match(/<div class="card">/g) || []).length, 1, "one card, not two");
      assert.ok(page.indexOf("id=\"materialsList\"") < page.indexOf("Miscellaneous"), "below the task materials");
      assert.match(page, /<div class="material-group" id="shoppingSection">\s*<div class="material-group-title plain-title">Miscellaneous<\/div>/);
      assert.doesNotMatch(page, /<h3[^>]*>Miscellaneous<\/h3>/);
      assert.match(page, /<input type="text" id="shoppingInput" maxlength="100"/);
      assert.match(page, /id="shoppingAddBtn"/);
      assert.match(page, /id="shoppingList"/);
      assert.match(page, /id="shoppingStatus"/);
      assert.ok(page.indexOf("id=\"shoppingSection\"") < page.indexOf("id=\"materialsStatus\""), "inside the card, before its status line");
    });
    it("shoppingWithAdded: appends the cleaned text with the given id, like the server", () => {
      const {shoppingWithAdded} = load();
      const r = shoppingWithAdded([{id: "a", text: "Glue"}], "  Duct \n tape ", "pending-1");
      assert.equal(r.added, true);
      assert.deepEqual(r.items, [{id: "a", text: "Glue"}, {id: "pending-1", text: "Duct tape"}]);
      assert.deepEqual(r.item, {id: "pending-1", text: "Duct tape"});
    });
    it("shoppingWithAdded: an item already there (ignoring case) is not added twice; a blank text or a full list is an error", () => {
      const {shoppingWithAdded, MAX_SHOPPING_ITEMS} = load();
      const items = [{id: "a", text: "Glue"}];
      const dup = shoppingWithAdded(items, "GLUE", "pending-1");
      assert.equal(dup.added, false);
      assert.equal(dup.items, items);
      assert.deepEqual(dup.item, {id: "a", text: "Glue"});
      assert.ok(shoppingWithAdded(items, "   ", "pending-1").error);
      const full = Array.from({length: MAX_SHOPPING_ITEMS}, (_, n) => ({id: `i${n}`, text: `Item ${n}`}));
      assert.match(shoppingWithAdded(full, "One more", "pending-1").error, /full/);
      assert.equal(MAX_SHOPPING_ITEMS, 100);
    });
    it("shoppingWithout and shoppingWithRestored: take an item off and put it back where it was", () => {
      const {shoppingWithout, shoppingWithRestored} = load();
      const items = [{id: "a", text: "A"}, {id: "b", text: "B"}, {id: "c", text: "C"}];
      const r = shoppingWithout(items, "b");
      assert.deepEqual(r.items.map((i) => i.id), ["a", "c"]);
      assert.equal(r.index, 1);
      assert.deepEqual(r.item, {id: "b", text: "B"});
      assert.deepEqual(shoppingWithRestored(r.items, r.item, r.index), items);
      assert.deepEqual(shoppingWithRestored([{id: "a", text: "A"}], r.item, 5).map((i) => i.id), ["a", "b"], "clamped to the end");
      assert.equal(shoppingWithRestored(items, r.item, 1), items, "not added twice");
      const none = shoppingWithout(items, "zzz");
      assert.equal(none.item, null);
      assert.equal(none.items, items);
      assert.equal(shoppingWithRestored(items, null, 0), items);
    });
    it("withTaskMaterialChecked: sets one material of one task and leaves the other tasks as they were", () => {
      const {withTaskMaterialChecked} = load();
      const t1 = {id: "t1", materials: [{id: "m1", text: "Nails", checked: false}, {id: "m2", text: "Paint", checked: false}]};
      const t2 = {id: "t2", materials: [{id: "m1", text: "Nails", checked: false}]};
      const out = withTaskMaterialChecked([t1, t2], "t1", "m1", true);
      assert.deepEqual(out[0].materials.map((m) => m.checked), [true, false]);
      assert.equal(out[1], t2);
      assert.equal(t1.materials[0].checked, false, "the original is not changed");
      assert.deepEqual(withTaskMaterialChecked(out, "t1", "m1", false)[0].materials.map((m) => m.checked), [false, false]);
    });
    it("loads after sign-in through getShoppingList and changes only through updateShoppingList", () => {
      assert.match(html, /const SHOPPING_URL = endpoint\("getShoppingList"\);/);
      assert.match(html, /const UPDATE_SHOPPING_URL = endpoint\("updateShoppingList"\);/);
      const from = html.indexOf("lib.onAuthStateChanged");
      assert.match(html.slice(from, html.indexOf("showGate(", from)), /loadShoppingList\(\);/);
      assert.match(html, /apiFetch\(SHOPPING_URL\)/);
      assert.match(html, /apiFetch\(UPDATE_SHOPPING_URL/);
    });
    it("adds on the button or Enter and a tick removes the item, each shown at once before the save", () => {
      const add = html.slice(html.indexOf("function addShoppingItemFromInput"), html.indexOf("function checkShoppingItem"));
      assert.match(add, /shoppingItemText\(input\.value\)/);
      assert.match(add, /shoppingWithAdded\(shoppingItems, text, tempId\)/);
      assert.match(add, /input\.value = "";[\s\S]*shoppingItems = result\.items;\s*renderShoppingList\(\);\s*queueShopping\(\{ action: "ADD", text \}/);
      assert.match(html, /getElementById\("shoppingInput"\)\.addEventListener\("keydown", e => \{\s*if \(e\.key === "Enter" && !e\.isComposing\)/);
      assert.match(html, /getElementById\("shoppingAddBtn"\)\.addEventListener\("click", addShoppingItemFromInput\)/);
      const check = html.slice(html.indexOf("function checkShoppingItem"), html.indexOf("// Checking a material shows it gone at once"));
      assert.match(check, /shoppingItems = removed\.items;\s*renderShoppingList\(\);\s*queueShopping\(\{ action: "REMOVE", itemId \}/);
      assert.match(html, /getElementById\("shoppingList"\)\.addEventListener\("change"/);
    });
    it("saves in order in the background, takes a failed change back and shows the server's list once nothing is waiting", () => {
      const fn = html.slice(html.indexOf("function queueShopping"), html.indexOf("function addShoppingItemFromInput"));
      assert.match(fn, /shoppingChain = shoppingChain\.then\(/);
      assert.match(fn, /apiFetch\(UPDATE_SHOPPING_URL/);
      assert.match(fn, /if \(shoppingPending === 0 && Array\.isArray\(data\.items\)\) shoppingItems = data\.items;/);
      assert.match(fn, /catch \(err\) \{\s*shoppingPending--;\s*undo\(\);/);
      assert.match(fn, /"Not saved: " \+ err\.message/);
      assert.match(fn, /finally \{\s*renderShoppingList\(\);/);
      assert.match(fn, /known \|\| body\.itemId/, "an item ticked before its add came back is removed under the id the server gave it");
      assert.doesNotMatch(html, /shoppingBusy/);
    });
    it("gives the typed text back when an add fails", () => {
      const fn = html.slice(html.indexOf("function addShoppingItemFromInput"), html.indexOf("function checkShoppingItem"));
      assert.match(fn, /if \(!input\.value\) input\.value = text;/);
    });
    it("checking a task's material takes it off the Materials card at once and saves in the background", () => {
      const fn = html.slice(html.indexOf("function checkMaterial"), html.indexOf("// Shows a task's job number"));
      assert.match(fn, /allTasks = withTaskMaterialChecked\(allTasks, taskId, materialId, checked\);\s*renderFilterBar\(\);\s*renderTasks\(\);/);
      assert.match(fn, /materialsChain = materialsChain\.then\(/);
      assert.match(fn, /if \(materialsPending === 0\) setTasks\(data\.tasks \|\| allTasks\);/);
      assert.match(fn, /allTasks = withTaskMaterialChecked\(allTasks, taskId, materialId, !checked\);/);
      assert.match(fn, /"Could not save: " \+ err\.message/);
      assert.doesNotMatch(html, /materialsBusy/);
    });
    it("sets the owner's text as escaped markup, and shows nothing until the list has loaded", () => {
      const fn = html.slice(html.indexOf("function renderShoppingList"), html.indexOf("async function loadShoppingList"));
      assert.match(fn, /\$\{esc\(i\.text\)\}/);
      assert.match(fn, /\$\{esc\(i\.id\)\}/);
      assert.match(fn, /!shoppingLoaded \? ""/);
      assert.match(fn, /Nothing on the list\./);
    });
    it("leaves the Materials tab's count to the tasks' materials", () => {
      const fn = html.slice(html.indexOf("function renderMaterialsCard"), html.indexOf("function renderShoppingList"));
      assert.doesNotMatch(fn, /shopping/i);
    });
  });
});

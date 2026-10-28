/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {moveToQueueNumber} = require("../tasks");
const {normalizeUrl: serverNormalizeUrl} = require("../contact");

// public/index.html has no build step, so its pure helpers sit between two marker comments. Load that block
// the way the page does: as plain script text with its own top-level state.
const html = fs.readFileSync(path.join(__dirname, "..", "..", "public", "index.html"), "utf8");
const start = html.indexOf("// <pure-helpers>");
const end = html.indexOf("// </pure-helpers>");
assert.ok(start > 0 && end > start, "pure-helpers markers not found in public/index.html");
const block = html.slice(start, end);

function load() {
  return new Function(`${block}
    return {pickerViewportBox, withNoneRow, clientFormHtml, clientFormValues, clientFormFill, clientFormWarning, INVALID_RATE, MAX_COMMENT_LENGTH, commentsOf, normalizeCommentText, withCommentsList, addCommentBody, deleteCommentBody, commentTimeline, commentLineView, deleteCommentPrompt, commentIdFor, TASK_CACHE_KEY, serializeTaskCache, parseTaskCache, cacheAgeText, offlineNoteText, COMPLETED_CACHE_KEY, COMPLETED_CACHE_ROWS, serializeCompletedCache, parseCompletedCache, completedOfflineNoteText, SHOPPING_CACHE_KEY, serializeShoppingCache, parseShoppingCache, shoppingOfflineNoteText, COMPLETED_FORM_CONTROLS, OFFLINE_COMPLETED_FIELDS, completedFieldDisabled, COMPLETED_CONTROL_SECTIONS, completedSectionsToOpen, ADD_QUEUE_KEY, ADD_QUEUE_MAX, newRequestId, makeQueuedAdd, parseQueue, serializeQueue, isNetworkError, drainQueue, queueCardView, queueDiscardPrompt, queueWithout, queueRetry, addQueueRefusal, formLocation, navigationHref, locationFromBox, taskLocationView, taskLocationChip, confirmView, failureText, shoppingItemText, shoppingWithAdded, shoppingWithout, shoppingWithRestored, withTaskMaterialChecked, MAX_SHOPPING_ITEMS, CONFIRM_TONES, TABS, normalizeTab, removalMessage, checkOffMessage, parseEmailText, INVALID_EMAIL, phoneDigits, phoneHref, smsHref, whatsappNumber, whatsappHref, emailHref, effectiveContact, contactPlaceholder, contactLinks, sortedTags, toggleTagFilter, pruneTagFilter, tagChipItems, projectClientNameById, tagFilterLabel, scheduleChoice, scheduleFromChoice, DAILY_TIME, DEFAULT_TIME_ZONE, makeFormatters, setTimeZone, getZone: () => appTimeZone, daysUntilDue, dueClass, DUE_SOON_DAYS, runningSeconds, longTimerWarning, DEFAULT_TIMER_WARN_HOURS, jobNumberWords, formatInstant, formatSchedule, geocodeUrl, placeFromGeocode, placesFromGeocode, placeQueries, placeLocation, effectiveLocation, projectLocationView, projectLocationKey, PLACES_AUTOCOMPLETE_URL, PLACES_DETAILS_FIELDS, PLACES_MIN_CHARS, PLACES_DEBOUNCE_MS, PLACES_BIAS_RADIUS_M, PLACES_MAX_SUGGESTIONS, newSessionToken, placesDetailsUrl, autocompleteBody, suggestionsFromAutocomplete, placeFromDetails, clientFillFromPlace, placesErrorText, settingsPayload, jobSheetPayload, parseTravelText, travelBoxText, INVALID_TRAVEL, manualTaskBody, recurrenceFields, scheduleSummary, matchesSearch, projectFields, NEW_PROJECT, NEW_CLIENT, NEW_CLIENT_NAME_WARNING, newProjectClientFields, newClientWarning, setClientBody, serverOnlyAddFields, serverOnlyAddText, fieldNamesText, projectLabel, projectClientName, projectSearchText, filterProjects, clientSearchText, filterClients, clientDeleteShown, clientFormBody, deleteClientPrompt, projectTaskCounts, PICKER_MAX_ROWS, PICKER_KINDS, pickerRows, projectFieldView, clientFieldView, filterTasks, deleteProjectPrompt, completePrompt, openMaterialsOf, materialsChipText, openMaterialGroups, openMaterialCount, withMaterialChecked, materialsFields, MAX_MATERIALS, needsRedirectSignIn, addDaysTo, snoozeDateFor, snoozeDateFromInput, isSnoozedTask, snoozeChipText, snoozeNeedsReschedule, SORT_OPTIONS, normalizeSortKey, sortTasks, queueNumbers, numberChipText, jobNumberText, addQueueNumber, bottomTaskNumber, queueNumberChange, activeTaskOf, isTimerRunning, elapsedSecondsOf, formatElapsed, durationText, completedTimeText, streakText, statProjectName, jobStatsText, fmtMinutes, decimalHours, hoursText, projectWeekText, weekRangeText, pickHistoryProject, historyProjectChoices, parseTagList, zonedDateTime, completedFormValues, completedChanges, completedMaterialTexts, parseMaterialLines, materialLine, parseMaterialItems, completedMaterialLines, parseCostText, costBoxText, materialCostValue, invalidMaterialCost, COMPLETED_PAGE_SIZE, matchesCompletedSearch, completedBrowse, pagerItems, completedCountText, THEME_KEY, normalizeTheme, isDarkTheme, themeFromToggle, themeMetaMedia, exportFilename, jobSheetFilename, exportSummary, templateMatches, templateFormValues, manualSectionsToOpen, addTaskExtras, freeTextBody, proposalStepText, proposalAcceptBody, proposalDeclineBody, historyOf, historyForTitle, MAX_PHOTOS, PHOTO_MAX_SIDE, PHOTO_QUALITY, PHOTO_MAX_BYTES, photoTargetSize, photoAttempts, photoCountText, base64FromDataUrl, DOUBLE_TAP_MS, tapKind, PRESS_MOVE_PX, pressMoved, timerChipIcon, FLASH_MS, flashElapsed, SWIPE_START_PX, SWIPE_COMMIT_PX, isHorizontalDrag, swipeAction, swipeOffset, deletePrompt, abortPrompt, reopenPrompt, withoutTasks, insertTaskAt, UNDO_WINDOW_MS, UNDO_NOTE_MS, templateStepsText, defaultProjectName, saveTemplateBody, startTemplateBody, deleteTemplatePrompt, startedText, csvRequestBody, csvFilename, sharedText, shareFromSearch, pushState, pushTokenBody, pushTestText, notifyFormValues, notifyPayload, pruneSelection, toggledSelection, taskCountText, batchCountText, batchRemovePrompt, batchRemoveResultText, batchBody, batchSnoozeText, dragTargetIndex, reorderQueueNumber, moveToQueueNumberInList, reorderMessage, TOAST_MS, REORDER_HINT_TEXT, reorderAllowed, LONG_PRESS_MS, MAX_URL_LENGTH, INVALID_URL, normalizeUrl, parseUrlText, projectUrlView, projectUrlKey, effectiveUrl, urlPlaceholder};`)();
}

describe("public/index.html helpers", () => {
  describe("comments", () => {
    const c = (n, at = 1761500000000 + n * 1000, text = `Note ${n}`) => ({id: `comment-000${n}`, at, text});
    it("commentsOf keeps usable comments in order as {id, at, text} and gives none for anything else", () => {
      const {commentsOf} = load();
      assert.deepEqual(commentsOf({comments: [{...c(1), extra: 1}, c(2)]}), [c(1), c(2)]);
      for (const item of [undefined, null, 5, {}, {comments: "An old text note"}, {comments: null}, {comments: {}}]) assert.deepEqual(commentsOf(item), [], JSON.stringify(item));
      assert.deepEqual(commentsOf({comments: [c(1), null, {id: "", at: 1, text: "x"}, {...c(2), at: 0}, {...c(3), at: 1.5}, {...c(4), text: "  "}, {...c(5), text: 5}, {...c(1), text: "again"}, c(6)]}), [c(1), c(6)]);
    });
    it("normalizeCommentText trims, cuts to the limit and gives null for blank or not text", () => {
      const {normalizeCommentText, MAX_COMMENT_LENGTH} = load();
      assert.equal(normalizeCommentText("  Rang Sam.\nNo answer. "), "Rang Sam.\nNo answer.");
      assert.equal(normalizeCommentText("x".repeat(MAX_COMMENT_LENGTH + 5)).length, MAX_COMMENT_LENGTH);
      for (const v of ["", "  \n", null, undefined, 5, {}]) assert.equal(normalizeCommentText(v), null);
    });
    it("withCommentsList sets the list, removes the key for an empty one and leaves its input alone", () => {
      const {withCommentsList} = load();
      const item = {id: "a", comments: [c(1)]};
      assert.deepEqual(withCommentsList(item, [c(1), c(2)]).comments, [c(1), c(2)]);
      assert.equal("comments" in withCommentsList(item, []), false);
      assert.equal("comments" in withCommentsList({id: "a"}, undefined), false);
      assert.deepEqual(item, {id: "a", comments: [c(1)]});
    });
    it("builds the add and delete bodies for a task or a History entry", () => {
      const {addCommentBody, deleteCommentBody} = load();
      assert.deepEqual(addCommentBody("taskId", "t1", "comment-0001", "Hi"), {taskId: "t1", id: "comment-0001", text: "Hi"});
      assert.deepEqual(addCommentBody("archiveId", "arch-1", "comment-0001", "Hi"), {archiveId: "arch-1", id: "comment-0001", text: "Hi"});
      assert.deepEqual(deleteCommentBody("taskId", "t1", "comment-0001"), {taskId: "t1", id: "comment-0001"});
      assert.deepEqual(deleteCommentBody("archiveId", "arch-1", "comment-0001"), {archiveId: "arch-1", id: "comment-0001"});
    });
    it("shows the timeline oldest first with the time on the owner's clock", () => {
      const {commentTimeline, setTimeZone} = load();
      setTimeZone("Pacific/Auckland");
      const at = Date.parse("2026-10-20T01:05:00Z");
      const [first, second] = commentTimeline({comments: [c(1, at, "Rang Sam"), c(2, at + 3600e3, "Back at 3")]});
      assert.equal(first.id, "comment-0001");
      assert.equal(first.text, "Rang Sam");
      assert.match(first.when, /2:05/);
      assert.match(second.when, /3:05/);
      assert.deepEqual(commentTimeline({}), []);
    });
    it("shows the latest comment on a card with how many came earlier", () => {
      const {commentLineView, setTimeZone} = load();
      setTimeZone("Pacific/Auckland");
      assert.equal(commentLineView({}), null);
      assert.equal(commentLineView({comments: "An old text note"}), null);
      const one = commentLineView({comments: [c(1)]});
      assert.equal(one.text, "Note 1");
      assert.doesNotMatch(one.meta, /earlier/);
      const three = commentLineView({comments: [c(1), c(2), c(3)]});
      assert.equal(three.text, "Note 3");
      assert.match(three.meta, /\+2 earlier/);
    });
    it("asks before deleting, showing the start of a long comment on one line", () => {
      const {deleteCommentPrompt} = load();
      assert.match(deleteCommentPrompt(c(1, 1, "Rang\nSam")), /Delete this comment\?[\s\S]*Rang Sam/);
      assert.ok(deleteCommentPrompt(c(1, 1, "w".repeat(500))).length < 160);
    });
    it("keeps the id for the same text so a send repeated after a lost reply cannot add it twice", () => {
      const {commentIdFor} = load();
      let n = 0;
      const make = () => `comment-new${++n}`;
      assert.equal(commentIdFor(null, "Hi", make), "comment-new1");
      assert.equal(commentIdFor({text: "Hi", id: "comment-new1"}, "Hi", make), "comment-new1");
      assert.equal(commentIdFor({text: "Hi", id: "comment-new1"}, "Changed", make), "comment-new2");
    });
    it("History search reads only the title, not a comment's text", () => {
      const {matchesCompletedSearch} = load();
      const row = {title: "Fit tap", comments: [c(1, 1761500000000, "Valve seized")], completedAt: "2026-10-20T01:00:00.000Z"};
      assert.equal(matchesCompletedSearch(row, "tap", ""), true);
      assert.equal(matchesCompletedSearch(row, "seized", ""), false);
    });
    it("keeps adding and deleting a comment on while the saved copy of History is shown (both are held)", () => {
      const {COMPLETED_FORM_CONTROLS, completedFieldDisabled} = load();
      assert.equal(COMPLETED_FORM_CONTROLS.ceCommentText, "comments");
      assert.equal(COMPLETED_FORM_CONTROLS.ceCommentAdd, "comments");
      assert.equal(completedFieldDisabled("comments", true), false);
      assert.equal(completedFieldDisabled("comments", false), false);
      assert.equal(completedFieldDisabled("commentDelete", true), false, "deleting a comment is held too");
      assert.equal(completedFieldDisabled("commentDelete", false), false);
    });
  });
  describe("saved task list", () => {
    it("round-trips for the account that saved it and for no other", () => {
      const {serializeTaskCache, parseTaskCache} = load();
      const text = serializeTaskCache("u1", [{id: "a", title: "Fix gate"}], 1000);
      assert.deepEqual(parseTaskCache(text, "u1"), {tasks: [{id: "a", title: "Fix gate"}], savedAt: 1000});
      assert.equal(parseTaskCache(text, "u2"), null);
      assert.equal(parseTaskCache(text, ""), null);
    });
    it("ignores a copy that is missing, damaged or of another shape", () => {
      const {parseTaskCache} = load();
      for (const bad of [null, undefined, "", "not json", "[]", "{}", JSON.stringify({v: 2, uid: "u1", savedAt: 1, tasks: []}), JSON.stringify({v: 1, uid: "u1", savedAt: "x", tasks: []}), JSON.stringify({v: 1, uid: "u1", savedAt: 1, tasks: "no"})]) {
        assert.equal(parseTaskCache(bad, "u1"), null, String(bad));
      }
    });
    it("drops entries that are not tasks", () => {
      const {parseTaskCache} = load();
      const text = JSON.stringify({v: 1, uid: "u1", savedAt: 5, tasks: [{id: "a"}, null, 3, {title: "no id"}]});
      assert.deepEqual(parseTaskCache(text, "u1").tasks, [{id: "a"}]);
    });
    it("says how old a copy is", () => {
      const {cacheAgeText, offlineNoteText} = load();
      const MIN = 60000;
      assert.equal(cacheAgeText(0, 30 * 1000), "just now");
      assert.equal(cacheAgeText(0, -5 * MIN), "just now");
      assert.equal(cacheAgeText(0, MIN), "1 minute ago");
      assert.equal(cacheAgeText(0, 59 * MIN), "59 minutes ago");
      assert.equal(cacheAgeText(0, 60 * MIN), "1 hour ago");
      assert.equal(cacheAgeText(0, 5 * 60 * MIN), "5 hours ago");
      assert.equal(cacheAgeText(0, 24 * 60 * MIN), "1 day ago");
      assert.equal(cacheAgeText(0, 3 * 24 * 60 * MIN), "3 days ago");
      assert.match(offlineNoteText(0, 5 * MIN), /offline.*5 minutes ago/);
    });
    it("is written by setTasks, cleared on sign-out and shown only for a connection failure", () => {
      assert.match(html, /function setTasks\(list\) \{[^}]*saveTaskCache\(list\)/);
      assert.doesNotMatch(html.slice(html.indexOf("function setTasks(list)"), html.indexOf("let lastSyncAt")), /saveTaskCache\(allTasks\)/, "the saved copy holds the server's list, not the one shown with waiting changes on it");
      assert.match(html, /clearTaskCache\(\); \/\/ signed out/);
      const fetchBody = html.slice(html.indexOf("async function fetchTasks()"), html.indexOf("async function submitTask()"));
      assert.match(fetchBody, /isNetworkError\(err, navigator\.onLine\)/);
      assert.match(fetchBody, /readTaskCache\(\)/);
    });
  });
  describe("saved Miscellaneous list", () => {
    it("round-trips for the account that saved it and for no other", () => {
      const {serializeShoppingCache, parseShoppingCache} = load();
      const text = serializeShoppingCache("u1", [{id: "a", text: "Nails"}, {id: "b", text: "Glue"}], 1000);
      assert.deepEqual(parseShoppingCache(text, "u1"), {items: [{id: "a", text: "Nails"}, {id: "b", text: "Glue"}], savedAt: 1000});
      assert.equal(parseShoppingCache(text, "u2"), null);
      assert.equal(parseShoppingCache(text, ""), null);
    });
    it("keeps an empty list as a valid copy", () => {
      const {serializeShoppingCache, parseShoppingCache} = load();
      assert.deepEqual(parseShoppingCache(serializeShoppingCache("u1", [], 7), "u1"), {items: [], savedAt: 7});
      assert.deepEqual(parseShoppingCache(serializeShoppingCache("u1", undefined, 7), "u1"), {items: [], savedAt: 7});
    });
    it("ignores a copy that is missing, damaged or of another shape", () => {
      const {parseShoppingCache} = load();
      for (const bad of [null, undefined, "", "not json", "[]", "{}", JSON.stringify({v: 2, uid: "u1", savedAt: 1, items: []}), JSON.stringify({v: 1, uid: "u1", savedAt: "x", items: []}), JSON.stringify({v: 1, uid: "u1", savedAt: 1, items: "no"})]) {
        assert.equal(parseShoppingCache(bad, "u1"), null, String(bad));
      }
    });
    it("keeps only the id and text of usable items, and at most MAX_SHOPPING_ITEMS", () => {
      const {serializeShoppingCache, parseShoppingCache, MAX_SHOPPING_ITEMS} = load();
      const mixed = [{id: "a", text: "Nails", extra: 1}, null, 3, {id: "", text: "No id"}, {id: "b"}, {id: "c", text: ""}, {id: 5, text: "Number id"}];
      assert.deepEqual(parseShoppingCache(serializeShoppingCache("u1", mixed, 1), "u1").items, [{id: "a", text: "Nails"}]);
      const hand = JSON.stringify({v: 1, uid: "u1", savedAt: 1, items: [{id: "a", text: "Nails"}, "x", {id: "b", text: 2}]});
      assert.deepEqual(parseShoppingCache(hand, "u1").items, [{id: "a", text: "Nails"}]);
      const many = Array.from({length: MAX_SHOPPING_ITEMS + 5}, (_, i) => ({id: `i${i}`, text: `Item ${i}`}));
      assert.equal(parseShoppingCache(serializeShoppingCache("u1", many, 1), "u1").items.length, MAX_SHOPPING_ITEMS);
      const hugeHand = JSON.stringify({v: 1, uid: "u1", savedAt: 1, items: many});
      assert.equal(parseShoppingCache(hugeHand, "u1").items.length, MAX_SHOPPING_ITEMS);
    });
    it("words the note with the copy's age", () => {
      const {shoppingOfflineNoteText} = load();
      assert.match(shoppingOfflineNoteText(0, 5 * 60000), /offline.*Miscellaneous list.*5 minutes ago.*connection/);
    });
    it("is written only with the server's list, cleared on sign-out and shown only for a connection failure", () => {
      const keyLine = html.match(/const SHOPPING_CACHE_KEY = "([^"]+)"/);
      assert.ok(keyLine && keyLine[1] === "taskhub-shopping-cache");
      assert.match(html, /clearShoppingCache\(\); \/\/ nor of the Miscellaneous list/);
      const setFrom = html.slice(html.indexOf("function setShoppingFromServer(items)"), html.indexOf("// Reads the list from the server."));
      assert.match(setFrom, /saveShoppingCache\(items\)/);
      assert.match(setFrom, /showSavedShoppingNote\(null\)/);
      assert.equal((html.match(/saveShoppingCache\(/g) || []).length, 2, "one definition and one call: the server's list is the only thing saved");
      assert.doesNotMatch(html, /saveShoppingCache\(shoppingItems\)/, "the saved copy never holds the page's list with changes not yet saved");
      const queueBody = html.slice(html.indexOf("function queueShopping("), html.indexOf("function addShoppingText("));
      assert.match(queueBody, /shoppingPending === 0 && Array\.isArray\(data\.items\)\) setShoppingFromServer\(data\.items\)/);
      const loadBody = html.slice(html.indexOf("async function loadShoppingList()"), html.indexOf("// Sends one change to the Miscellaneous list"));
      assert.match(loadBody, /isNetworkError\(err, navigator\.onLine\)/);
      assert.match(loadBody, /readShoppingCache\(\)/);
      assert.match(loadBody, /Could not load the list: /);
      assert.match(html, /savedShoppingAt !== null\) loadShoppingList\(\)/);
    });
  });
  describe("held Miscellaneous changes (page)", () => {
    const fnBody = (name, next) => html.slice(html.indexOf(name), html.indexOf(next, html.indexOf(name) + 1));
    it("holds a change behind a waiting shopping action, and after a connection failure, and keeps it shown", () => {
      const fn = fnBody("function queueShopping(", "// Keeps a change to the Miscellaneous list in the action queue");
      assert.match(fn, /if \(hasPendingShopping\(actionQueue\)\) \{[^}]*holdShoppingChange\(change, true\)/);
      assert.ok(fn.indexOf("hasPendingShopping(actionQueue)") < fn.indexOf("apiFetch(UPDATE_SHOPPING_URL"), "the order check comes before any send");
      assert.match(fn, /isNetworkError\(err, navigator\.onLine\) \? holdShoppingChange\(change, false\) : null/);
    });
    it("keeps a held change with the clock's correction, refuses when the queue cannot take it and sends the queue when it was only behind", () => {
      const fn = fnBody("function holdShoppingChange(", "// A held change to the Miscellaneous list posted");
      assert.match(fn, /actionQueueRefusal\(actionQueue\.length, actionQueueUsable\)/);
      assert.match(fn, /makeQueuedAction\(\{ kind: change\.kind, title: change\.fields\.text, fields: change\.fields, now: Date\.now\(\), offset: clockOffsetMs, requestId: change\.requestId \}\)/);
      assert.match(fn, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\)/);
    });
    it("shows an add under an id made from its request id, so it survives a reload", () => {
      const fn = fnBody("function addShoppingText(", "function addShoppingItemFromInput");
      assert.match(fn, /const requestId = newRequestId\(\);\s*const tempId = shoppingTempId\(requestId\);/);
    });
    it("takes a tick on a held add out of the queue instead of queueing a removal, unless the add is on its way", () => {
      const fn = fnBody("function checkShoppingItem(", "// Ticking one offers Undo");
      assert.match(fn, /a\.kind === "SHOPPING_ADD" && a\.status === "PENDING" && shoppingTempId\(a\.requestId\) === itemId && a\.requestId !== sendingActionId/);
      assert.match(fn, /saveActionQueue\(cancelActions\(actionQueue, waitingAdd\.requestId\)\.actions\)/);
      assert.ok(fn.indexOf("cancelActions(") < fn.indexOf("queueShopping("));
    });
    it("sends held changes through sendQueuedAction, after the blockedBy check, and takes the action out of the queue before the list is shown", () => {
      const send = fnBody("async function sendQueuedAction(", "// One action settled by drainQueue");
      assert.ok(send.indexOf("blockedBy(actionQueue, item)") < send.indexOf("sendShoppingAction(item)"));
      const fn = fnBody("async function sendShoppingAction(", "// Adds an item to the Miscellaneous list at once");
      assert.match(fn, /apiFetch\(UPDATE_SHOPPING_URL/);
      assert.match(fn, /shoppingRemovalId\(item, shoppingRealIds, null\)/);
      assert.match(fn, /apiFetch\(SHOPPING_URL\)/);
      assert.ok(fn.lastIndexOf("saveActionQueue(queueWithout(actionQueue, item.requestId))") < fn.lastIndexOf("setShoppingFromServer(data.items)"));
      assert.match(fn, /shoppingRealIds\.set\(tempId, data\.item\.id\)/);
    });
    it("shows the list again when a held change is refused, discarded or retried, and marks held adds as waiting", () => {
      for (const name of ["function settleQueuedAction(", "async function discardQueuedAction(", "function retryQueuedAction("]) {
        assert.match(fnBody(name, "\n    }\n"), /refreshShownShopping\(\)/, name);
      }
      assert.match(fnBody("function renderShoppingList(", "// The saved copy of the Miscellaneous list (SHOPPING_CACHE_KEY)"), /waitingShoppingIds\(actionQueue\)[\s\S]*Waiting to send/);
    });
    it("puts what is waiting on top of every list the server or the saved copy gives", () => {
      assert.match(fnBody("function shownShopping(", "// Draws the list again"), /withPendingShopping\(items, actionQueue\)/);
      assert.match(fnBody("function setShoppingFromServer(", "// Reads the list from the server"), /shoppingItems = shownShopping\(items\)/);
      assert.match(fnBody("async function loadShoppingList(", "// The saved copy of the Miscellaneous list (SHOPPING_CACHE_KEY)"), /shoppingItems = shownShopping\(saved\.items\)/);
    });
  });
  describe("saved completed list", () => {
    const rowsOf = (n) => Array.from({length: n}, (_, i) => ({archiveId: `a${i}`, title: `Job ${i}`, completedAt: 1000 - i}));
    it("round-trips for the account that saved it and for no other", () => {
      const {serializeCompletedCache, parseCompletedCache} = load();
      const text = serializeCompletedCache("u1", rowsOf(3), 5000, false);
      assert.deepEqual(parseCompletedCache(text, "u1"), {rows: rowsOf(3), savedAt: 5000, limited: false});
      assert.equal(parseCompletedCache(text, "u2"), null);
      assert.equal(parseCompletedCache(text, ""), null);
    });
    it("keeps only the newest COMPLETED_CACHE_ROWS entries, in order, and says the copy is limited", () => {
      const {serializeCompletedCache, parseCompletedCache, COMPLETED_CACHE_ROWS} = load();
      assert.equal(COMPLETED_CACHE_ROWS, 200);
      const text = serializeCompletedCache("u1", rowsOf(250), 1, false);
      const copy = parseCompletedCache(text, "u1");
      assert.equal(copy.rows.length, 200);
      assert.deepEqual(copy.rows, rowsOf(250).slice(0, 200));
      assert.equal(copy.limited, true);
      assert.equal(parseCompletedCache(serializeCompletedCache("u1", rowsOf(200), 1, false), "u1").limited, false);
      assert.equal(parseCompletedCache(serializeCompletedCache("u1", rowsOf(2), 1, true), "u1").limited, true, "a list the server already cut stays limited");
    });
    it("accepts an empty list and drops entries that are not objects", () => {
      const {serializeCompletedCache, parseCompletedCache} = load();
      assert.deepEqual(parseCompletedCache(serializeCompletedCache("u1", [], 7), "u1"), {rows: [], savedAt: 7, limited: false});
      assert.deepEqual(parseCompletedCache(serializeCompletedCache("u1", [null, 5, "x", {archiveId: "a"}], 7), "u1").rows, [{archiveId: "a"}]);
      assert.deepEqual(parseCompletedCache(serializeCompletedCache("u1", undefined, 7), "u1").rows, []);
      const hand = JSON.stringify({v: 1, uid: "u1", savedAt: 7, rows: [null, {archiveId: "a"}, 3]});
      assert.deepEqual(parseCompletedCache(hand, "u1").rows, [{archiveId: "a"}]);
    });
    it("reads nothing back from a missing, damaged or foreign copy", () => {
      const {parseCompletedCache} = load();
      for (const bad of [null, undefined, "", "not json", "{}", "[]", JSON.stringify({v: 2, uid: "u1", savedAt: 1, rows: []}), JSON.stringify({v: 1, uid: "u1", savedAt: "x", rows: []}), JSON.stringify({v: 1, uid: "u1", savedAt: 1}), JSON.stringify({v: 1, uid: "u1", savedAt: 1, rows: {}})]) {
        assert.equal(parseCompletedCache(bad, "u1"), null, String(bad));
      }
    });
    it("uses a key of its own, apart from the task copy", () => {
      const {COMPLETED_CACHE_KEY, TASK_CACHE_KEY} = load();
      assert.equal(COMPLETED_CACHE_KEY, "taskhub-completed-cache");
      assert.notEqual(COMPLETED_CACHE_KEY, TASK_CACHE_KEY);
    });
    it("words the note with the age of the copy and what needs a connection", () => {
      const {completedOfflineNoteText} = load();
      const MIN = 60000;
      assert.equal(completedOfflineNoteText(0, 5 * MIN), "You're offline. Showing the newest completed tasks as they were 5 minutes ago. Project hours and photos need a connection.");
      assert.match(completedOfflineNoteText(0, 10 * 1000), /as they were just now\./);
    });
    it("leaves only the fields that can be saved offline enabled in the entry's form", () => {
      const {COMPLETED_FORM_CONTROLS, OFFLINE_COMPLETED_FIELDS, completedFieldDisabled} = load();
      assert.deepEqual(OFFLINE_COMPLETED_FIELDS, ["priority", "trackedMinutes", "tags", "travelKm", "location", "phone", "email", "url", "description", "comments", "commentDelete"]);
      for (const field of new Set(Object.values(COMPLETED_FORM_CONTROLS))) {
        assert.equal(completedFieldDisabled(field, false), false, `${field} online`);
        assert.equal(completedFieldDisabled(field, undefined), false, `${field} unknown`);
        assert.equal(completedFieldDisabled(field, true), !OFFLINE_COMPLETED_FIELDS.includes(field), `${field} offline`);
      }
      const enabled = Object.entries(COMPLETED_FORM_CONTROLS).filter(([, field]) => !completedFieldDisabled(field, true)).map(([id]) => id);
      assert.deepEqual(enabled, ["cePriority", "ceTracked", "ceTags", "ceTravel", "ceLocation", "ceLocationClearBtn", "cePhone", "ceEmail", "ceUrl", "ceDescription", "ceCommentText", "ceCommentAdd"]);
      for (const id of ["ceProject", "ceMaterials", "ceDate", "ceTime", "cePlaceSearchBtn", "ceSheetBtn", "ceDeleteBtn"]) assert.ok(!enabled.includes(id), `${id} needs a connection`);
    });
    it("covers every control of the entry's form: each id exists on the page and each form field has a control", () => {
      const {COMPLETED_FORM_CONTROLS} = load();
      for (const id of Object.keys(COMPLETED_FORM_CONTROLS)) assert.match(html, new RegExp(`id="${id}"`), id);
      const modal = html.slice(html.indexOf("id=\"completedEditModal\""), html.indexOf("id=\"completedEditModal\"") + 9000);
      const formInputs = [...modal.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="(ce[A-Za-z]+)"/g)].map((m) => m[1]).filter((id) => id !== "ceId");
      for (const id of formInputs) assert.ok(id in COMPLETED_FORM_CONTROLS, `${id} is not covered by COMPLETED_FORM_CONTROLS`);
    });
    it("is written by fetchCompleted, cleared on sign-out, dropped before the task copy and shown only for a connection failure", () => {
      const fetchBody = html.slice(html.indexOf("async function fetchCompleted()"), html.indexOf("// Projects: create, rename and delete through updateProject"));
      assert.match(fetchBody, /saveCompletedCache\(tasks, data\.listTruncated === true\)/);
      assert.match(fetchBody, /showSavedCompletedNote\(null\); \/\/ a list from the server replaces/);
      assert.match(fetchBody, /isNetworkError\(err, navigator\.onLine\) \? readCompletedCache\(\) : null/);
      assert.match(html, /clearCompletedCache\(\); \/\/ nor of the completed entries/);
      const save = html.slice(html.indexOf("function saveTaskCache(tasks)"), html.indexOf("function readTaskCache()"));
      assert.ok(save.indexOf("clearCompletedCache()") > 0 && save.indexOf("clearCompletedCache()") < save.indexOf("clearTaskCache()"), "the History copy goes first when storage is full");
      const saveCompleted = html.slice(html.indexOf("function saveCompletedCache("), html.indexOf("function readCompletedCache()"));
      assert.doesNotMatch(saveCompleted, /clearTaskCache/, "a full storage never costs the task copy for the History one");
    });
    it("marks Project hours and photos as needing a connection and reads the list again when the connection returns", () => {
      const copy = html.slice(html.indexOf("function showCompletedCopy(saved)"), html.indexOf("async function fetchCompleted()"));
      assert.doesNotMatch(copy, /Stats/);
      assert.match(copy, /Project hours need a connection\./);
      const open = html.slice(html.indexOf("function openCompletedEditor(id)"), html.indexOf("function closeCompletedEditor()"));
      assert.match(open, /Photos need a connection\./);
      assert.match(open, /if \(offline\) .*Photos need a connection\.[^\n]*\n\s*else showPhotos\(id, "archiveId", "cePhotos"\)/);
      assert.match(open, /completedFieldDisabled\(field, offline\)/);
      assert.match(html, /window\.addEventListener\("online", \(\) => \{ if \(savedCompletedAt !== null\) fetchCompleted\(\); \}\);/);
      assert.match(html, /getElementById\("completedRetryBtn"\)\.addEventListener\("click", fetchCompleted\)/);
    });
  });
  describe("task card gestures", () => {
    it("treats a drift beyond the tolerance as a scroll, not a press", () => {
      const {pressMoved, PRESS_MOVE_PX} = load();
      assert.equal(pressMoved(0, 0), false);
      assert.equal(pressMoved(PRESS_MOVE_PX, 0), false);
      assert.equal(pressMoved(0, -(PRESS_MOVE_PX + 1)), true);
      assert.equal(pressMoved(8, 8), true);
      assert.equal(pressMoved(undefined, undefined), false);
    });
    it("tells a double-tap from a single tap: the same card again within the window, edges included", () => {
      const {tapKind, DOUBLE_TAP_MS} = load();
      assert.equal(DOUBLE_TAP_MS, 300);
      const first = {id: "a", at: 10000};
      assert.equal(tapKind(null, "a", 10000), "single");
      assert.equal(tapKind(undefined, "a", 10000), "single");
      assert.equal(tapKind(first, "a", 10000), "double", "no time between the taps");
      assert.equal(tapKind(first, "a", 10000 + DOUBLE_TAP_MS - 1), "double");
      assert.equal(tapKind(first, "a", 10000 + DOUBLE_TAP_MS), "double", "the window's far edge counts");
      assert.equal(tapKind(first, "a", 10000 + DOUBLE_TAP_MS + 1), "single");
      assert.equal(tapKind(first, "b", 10100), "single", "a tap on another card is a new single tap");
      assert.equal(tapKind(first, "a", 9999), "single", "a clock that went back is not a double-tap");
      assert.equal(tapKind(first, "a", undefined), "single");
      assert.equal(tapKind({id: "a"}, "a", 10000), "single", "a previous tap with no time is not a double-tap");
    });
    it("opens the editor after the double-tap window, and a second tap on the card toggles the timer instead", () => {
      const click = html.slice(html.indexOf("const onTaskRowClick"), html.indexOf("for (const id of [\"taskList\""));
      assert.match(click, /const kind = tapKind\(pendingTap, taskId, now\);\s*cancelPendingTap\(\);/);
      assert.match(click, /if \(kind === "double"\) \{[\s\S]*navigator\.vibrate\(30\)[\s\S]*cardFlash = \{ taskId, at: now \};\s*applyFlash\(\);\s*toggleTimer\(taskId\);\s*return;\s*\}/);
      assert.match(click, /pendingTap = \{ id: taskId, at: now, timer: setTimeout\(\(\) => \{ pendingTap = null; openEditModal\(taskId\); \}, DOUBLE_TAP_MS\) \};/);
      assert.ok(click.indexOf("tapKind") < click.indexOf("openEditModal"), "the editor opens only from the timeout");
      assert.equal(click.split("openEditModal(").length - 1, 1, "one way into the editor");
      assert.match(html, /const cancelPendingTap = \(\) => \{ if \(pendingTap\) clearTimeout\(pendingTap\.timer\); pendingTap = null; \};/);
      assert.doesNotMatch(click, /completeTask/, "nothing completes by tapping");
    });
    it("takes a Multi-Select tap at once with no wait and no double-tap", () => {
      const click = html.slice(html.indexOf("const onTaskRowClick"), html.indexOf("for (const id of [\"taskList\""));
      assert.ok(click.indexOf("return toggleSelected(item.dataset.id)") < click.indexOf("tapKind("), "the select branch returns before the tap logic");
    });
    it("times a hold on a queued card for LONG_PRESS_MS, and never on the Active task", () => {
      const {LONG_PRESS_MS} = load();
      assert.equal(LONG_PRESS_MS, 500);
      const down = html.slice(html.indexOf("const onTaskRowDown"), html.indexOf("const onTaskRowMove"));
      assert.ok(down.indexOf("if (active) return;") > 0 && down.indexOf("if (active) return;") < down.indexOf("pressTimer = setTimeout"), "the Active task starts no hold");
      assert.match(down, /\}, LONG_PRESS_MS\);/);
      assert.match(down, /pressFired = true;\s*swipe = null;\s*if \(!reorderAllowed\(sortKey, sortDescending\)\) return showToast\(REORDER_HINT_TEXT\);\s*startReorderPress\(press, item\);/);
      assert.doesNotMatch(down, /toggleTimer/, "a hold no longer toggles the timer");
    });
    it("lets a finger that moves before the hold scroll or swipe, and makes the release of a hold do nothing", () => {
      const move = html.slice(html.indexOf("const onTaskRowMove"), html.indexOf("const onTaskRowUp"));
      assert.match(move, /s\.dragging = true;\s*cancelPress\(\);/, "a sideways drag is the swipe");
      assert.match(move, /pressMoved\(e\.clientX - pressStart\.x, e\.clientY - pressStart\.y\)\) cancelPress\(\)/, "an up or down move is a scroll");
      assert.match(move, /else pressStart\.lastY = e\.clientY;/);
      const up = html.slice(html.indexOf("const onTaskRowUp"), html.indexOf("const onTaskRowClick"));
      assert.match(up, /const onTaskRowUp = async e => \{\s*cancelPress\(\);/);
      const click = html.slice(html.indexOf("const onTaskRowClick"), html.indexOf("for (const id of [\"taskList\""));
      assert.match(click, /if \(pressFired\) \{ pressFired = false; return; \}/);
      assert.ok(click.indexOf("pressFired") < click.indexOf("toggleSelected") && click.indexOf("pressFired") < click.indexOf("tapKind("), "the guard comes before any tap");
      assert.match(html, /box\.addEventListener\("pointerleave", cancelPress\);/);
    });
    it("keeps double-tap zoom and word selection off the cards", () => {
      const rules = (selector) => [...html.matchAll(new RegExp(`\\n\\s*${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(" ");
      for (const selector of [".task-item", ".active-task-box"]) {
        assert.match(rules(selector), /touch-action: manipulation/, selector);
        assert.match(rules(selector), /user-select: none/, selector);
      }
      assert.match(html, /\.swipe-row \.task-item \{[^}]*touch-action: pan-y/);
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
      assert.match(html, /const active = !!item\.closest\("#activeTaskBox"\);\s*swipe = row \? \{ item, row, id: taskId, active,/);
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
      const queue = html.indexOf(`id="offlineNote"`);
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
    it("puts the area preference on the Settings page, after the lunch break, with its two numbers", () => {
      const settings = html.indexOf(`id="pageSettings"`);
      const modal = html.indexOf(`id="editModal"`);
      const ids = ["travelGroupingEnabled", "travelRadiusKm", "travelDeferDays"];
      let previous = html.indexOf(`id="lunchMinutes"`);
      for (const id of ids) {
        const i = html.indexOf(`id="${id}"`);
        assert.ok(i > settings && i < modal, `${id} sits on the Settings page`);
        assert.ok(i > previous, `${id} follows the lunch fields`);
        previous = i;
      }
      assert.match(html.slice(html.indexOf(`id="travelGroupingEnabled"`) - 30, html.indexOf(`id="travelGroupingEnabled"`)), /type="checkbox"/);
      assert.match(html.slice(html.indexOf(`id="travelRadiusKm"`) - 30, html.indexOf(`id="travelRadiusKm"`)), /type="number"/);
      assert.match(html, /id="travelRadiusKm" min="0\.5" max="100"/);
      assert.match(html, /id="travelDeferDays" min="0" max="14" step="1"/);
    });
    it("loads, saves and change-checks the area preference with the other scheduling fields", () => {
      const apply = html.slice(html.indexOf("function applySettings(s)"), html.indexOf("async function saveSettings"));
      for (const id of ["travelGroupingEnabled", "travelRadiusKm", "travelDeferDays"]) {
        assert.ok(apply.includes(`getElementById("${id}")`), `${id} is filled from the saved settings`);
        const changed = html.slice(html.indexOf("function scheduleFieldsChanged"), html.indexOf("function setSettingsStatus"));
        assert.ok(changed.includes(`getElementById("${id}")`), `${id} counts as an unsaved scheduling change`);
        const save = html.slice(html.indexOf("async function saveSettings"), html.indexOf(`document.getElementById("undoNoteBtn")`));
        assert.ok(save.includes(`getElementById("${id}")`), `${id} is read when saving`);
      }
      assert.match(html, /getElementById\("travelGroupingEnabled"\)\.addEventListener\("change", updateTravelGroupingFields\)/);
      assert.match(html, /!saved\.travelGrouping/);
    });
    it("closes every manual section whenever the details form is shown: ticking the box and using a past task", () => {
      const fn = html.slice(html.indexOf("function showManualFields"), html.indexOf("// Opens one section"));
      assert.match(fn, /document\.getElementById\("manualFields"\)\.hidden = !show;/);
      assert.match(fn, /if \(show\) closeFormSections\("manualFields"\);/);
      assert.match(html, /document\.getElementById\("manualToggle"\)\.addEventListener\("change", e => \{\s*showManualFields\(e\.target\.checked\);/);
      const use = html.slice(html.indexOf("function useTemplate"), html.indexOf("function useTemplate") + 400);
      assert.match(use, /toggle\.checked = true;\s*showManualFields\(true\);/);
      assert.equal((html.match(/getElementById\("manualFields"\)/g) || []).length, 1, "only showManualFields touches the details form");
    });
    it("opens the add card section holding the field at fault before a warning", () => {
      const submit = html.slice(html.indexOf("async function submitTask"), html.indexOf("async function submitTask") + 3500);
      assert.match(submit, /warnInSection\("manualAudit", `The cost of/);
      assert.match(submit, /warnInSection\("manualAudit", INVALID_TRAVEL\)/);
      assert.match(submit, /warnInSection\("manualContact", INVALID_EMAIL\)/);
      assert.match(submit, /warnInSection\("manualContact", INVALID_URL\)/);
    });
    it("lays the manual entry out like the edit modal: Description, Tags and Project, then Scheduling, Contact details and Audit trail", () => {
      const manual = html.indexOf(`id="manualFields"`);
      const queue = html.indexOf(`id="offlineNote"`);
      const inOrder = (ids, from, to, what) => {
        let last = from;
        for (const id of ids) {
          const i = html.indexOf(`id="${id}"`);
          assert.ok(i > last && i < to, `${id} sits in ${what}, in order`);
          last = i;
        }
      };
      const sections = ["manualScheduling", "manualContact", "manualAudit"].map((id) => html.indexOf(`<details class="form-section" id="${id}">`));
      assert.ok(sections.every((i, n) => i > manual && i < queue && (n === 0 || i > sections[n - 1])), "three sections, in order");
      inOrder(["manualDescription", "manualTags", "manualProject", "manualProjectOrder", "manualNewProject"], manual, sections[0], "the top level");
      const end = (i) => html.indexOf("</details>", i);
      inOrder(["manualPriority", "manualMinutes", "manualDue", "manualRecurFreq", "manualRecurInterval"], sections[0], end(sections[0]), "Scheduling");
      inOrder(["manualPhone", "manualEmail", "manualUrl", "manualLocation"], sections[1], end(sections[1]), "Contact details");
      inOrder(["manualTravel", "manualMaterials", "manualNewMaterialText", "addManualMaterialBtn"], sections[2], end(sections[2]), "Audit trail");
      for (const id of ["manualScheduling", "manualContact", "manualAudit"]) assert.doesNotMatch(html.slice(html.indexOf(`id="${id}"`) - 40, html.indexOf(`id="${id}"`) + 40), /\sopen[\s>]/, `${id} starts collapsed`);
      assert.doesNotMatch(html.slice(sections[2], end(sections[2])), /manualPhotos|manualComments/, "a task not yet added has no photos or comments");
      assert.match(html.slice(html.indexOf(`id="manualProjectOrder"`), html.indexOf(">", html.indexOf(`id="manualProjectOrder"`))), /disabled/);
      assert.match(html, /id="manualRecurFreq"[^>]*onchange="updateRecurUnit\('manual'\)"/);
      assert.match(html, /id="manualProjectField"[^>]*onclick="openProjectPicker\('manual'\)"/);
      assert.match(html, /id="manualRecurFreq"[\s\S]*?<option value="NONE">Does not repeat<\/option>/);
    });
    it("stops the page behind the edit modal from scrolling with it", () => {
      assert.match(html, /\.modal-card\s*\{[^}]*max-height:\s*90vh;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/);
      assert.match(html, /\.modal-overlay\s*\{[^}]*overscroll-behavior:\s*contain/);
      assert.match(html, /body\.modal-open\s*\{[^}]*overflow:\s*hidden/);
      const open = html.slice(html.indexOf("function openEditModal"), html.indexOf("// \"🔁"));
      assert.match(open, /showLayer\("editModal", backFromEditModal\)/);
      const close = html.slice(html.indexOf("function closeEditModal"), html.indexOf("function closeModalOnOverlay"));
      assert.match(close, /hideLayer\("editModal"\)/);
      assert.match(html, /lock: \(locked\) => document\.body\.classList\.toggle\("modal-open", locked\)/);
    });
    it("has no heading on the add card: the placeholder of the one add-and-search field names what it does, and the manual-entry checkbox has no explanation in brackets", () => {
      assert.doesNotMatch(html, /<h3[^>]*>Add New Task<\/h3>/);
      assert.match(html.slice(html.indexOf(`id="taskInput"`) - 30, html.indexOf(">", html.indexOf(`id="taskInput"`))), /placeholder="Add or search tasks, #job, @client"/);
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
      for (const id of ["taskInput", "queueCard", "tagsDetails", "projectsSection", "queueProjectField", "taskList"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > tasks && i < end, `${id} is on the Queue page`);
      }
      assert.ok(at(`id="queueCard"`) < at(`id="taskInput"`) && at(`id="taskInput"`) < at(`id="offlineNote"`), "the add field is in the Queue card, above the filters and the list");
      assert.equal(html.slice(at(`id="pageQueue"`), end).split(`class="card"`).length, 2, "the Queue page has one card only");
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
    it("keeps Description, Tags and Project at the top level of both edit modals, above every section", () => {
      for (const [modal, prefix] of [["editModal", "edit"], ["completedEditModal", "ce"]]) {
        const first = at(`<details class="form-section"`, at(`id="${modal}"`));
        for (const id of [`${prefix}Description`, `${prefix}Tags`, `${prefix}Project`]) {
          const i = at(`id="${id}"`);
          assert.ok(i > at(`id="${modal}"`) && i < first, `${id} is above the sections`);
        }
        assert.ok(at(`id="${prefix}Description"`) < at(`id="${prefix}Tags"`), "Description comes before Tags");
      }
    });
    it("holds Phone, Email, Link and Location in Contact details, and Travel, Materials, Photos and Comments in Audit trail", () => {
      for (const [prefix, modal] of [["edit", "editModal"], ["ce", "completedEditModal"]]) {
        const contact = at(`<details class="form-section" id="${prefix}Contact">`);
        const contactEnd = at("</details>", contact);
        const audit = at(`<details class="form-section" id="${prefix}Audit">`);
        const auditEnd = at("</details>", audit);
        assert.ok(contact > at(`id="${modal}"`) && contactEnd < audit, "Contact details comes before Audit trail");
        assert.match(html.slice(contact, contact + 120), /<summary>Contact details<\/summary>/);
        assert.match(html.slice(audit, audit + 120), /<summary>Audit trail<\/summary>/);
        const inOrder = (ids, from, to) => {
          let last = from;
          for (const id of ids) {
            const i = at(`id="${id}"`);
            assert.ok(i > last && i < to, `${id} is in its section, in order`);
            last = i;
          }
        };
        inOrder([`${prefix}Phone`, `${prefix}Email`, `${prefix}Url`, `${prefix}Location`], contact, contactEnd);
        inOrder([`${prefix}Travel`, `${prefix}Materials`, `${prefix}Photos`, `${prefix}Comments`], audit, auditEnd);
      }
      assert.ok(at(`id="ceSheetBtn"`) > at(`id="ceComments"`) && at(`id="ceSheetBtn"`) < at("</details>", at(`id="ceAudit"`)), "the job sheet button ends the completed form's Audit trail");
      assert.doesNotMatch(html.slice(at(`id="editModal"`), at(`id="photoInput"`)), /Sheet|job sheet/i, "the queued modal has no job sheet download");
    });
    it("has no Extra fields section left", () => {
      assert.doesNotMatch(html, /ExtraFields|Extra fields/);
    });
    it("gives both edit modals one section style, every section closed each time a modal opens", () => {
      assert.doesNotMatch(html, /extra-fields/);
      assert.match(html, /\.form-section > summary \{/);
      for (const [modal, ids] of [["editModal", ["editScheduling", "editContact", "editAudit"]], ["completedEditModal", ["ceScheduling", "ceContact", "ceAudit"]]]) {
        const start = at(`id="${modal}"`);
        const end = at("</div>\n  </div>\n", start);
        for (const id of ids) {
          const i = at(`<details class="form-section" id="${id}">`);
          assert.ok(i > start && i < end, `${id} is a form-section of ${modal}`);
          assert.doesNotMatch(html.slice(i, i + 60), /\sopen[\s>]/, `${id} starts collapsed`);
        }
      }
      const fn = html.slice(at("function closeFormSections"), at("function warnInSection"));
      assert.match(fn, /#\$\{modalId\} details\.form-section/);
      assert.match(fn, /section\.open = false/);
      assert.match(html, /closeFormSections\("editModal"\)/);
      assert.match(html, /closeFormSections\("completedEditModal"\)/);
    });
    it("holds the scheduling fields of each edit modal in a Scheduling section", () => {
      const queued = [["editNumber", "Top"], "editPriority", "editDuration", "editDueDate", "clearDueDateBtn", "editRecurFreq", "editRecurInterval"].flat();
      const sectionOf = (id) => {
        const start = at(`id="${id}"`);
        return [start, at("</details>", start)];
      };
      const [qs, qe] = sectionOf("editScheduling");
      for (const id of queued.filter((x) => x !== "Top")) {
        const i = at(`id="${id}"`);
        assert.ok(i > qs && i < qe, `${id} is in the queued Scheduling section`);
      }
      assert.ok(at(">Top</button>", qs) < qe, "the Top button is in it");
      assert.ok(at(">Bottom</button>", qs) < qe, "the Bottom button is in it");
      const [cs, ce] = sectionOf("ceScheduling");
      for (const id of ["cePriority", "ceTracked", "ceDate", "ceTime"]) {
        const i = at(`id="${id}"`);
        assert.ok(i > cs && i < ce, `${id} is in the completed Scheduling section`);
      }
      for (const [prefix, details] of [["edit", "editScheduling"], ["ce", "ceScheduling"]]) {
        const open = at(`id="${details}"`);
        for (const id of [`${prefix}Tags`, `${prefix}Project`, `${prefix}ContactActions`, `${prefix}NavigateActions`]) {
          assert.ok(at(`id="${id}"`) < open, `${id} stays above Scheduling`);
        }
      }
    });
    it("opens, for the completed form working offline, the sections that hold a field left to edit", () => {
      const {completedSectionsToOpen, COMPLETED_CONTROL_SECTIONS, COMPLETED_FORM_CONTROLS, completedFieldDisabled} = load();
      assert.deepEqual([...completedSectionsToOpen(false)], [], "online, every section starts closed");
      assert.deepEqual([...completedSectionsToOpen(undefined)], []);
      assert.deepEqual([...completedSectionsToOpen(true)].sort(), ["ceAudit", "ceContact", "ceScheduling"], "offline, Priority and Time spent, the contact fields, Travel and comments stay editable");
      for (const [control, section] of Object.entries(COMPLETED_CONTROL_SECTIONS)) {
        assert.ok(control in COMPLETED_FORM_CONTROLS, `${control} is a control of the form`);
        const el = html.indexOf(`id="${control}"`);
        const start = html.indexOf(`id="${section}"`);
        assert.ok(el > start && el < html.indexOf("</details>", start), `${control} sits in ${section}`);
      }
      assert.match(html, /for \(const id of completedSectionsToOpen\(offline\)\) openFormSection\(id\);/);
      assert.equal(completedFieldDisabled("materials", true), true, "Materials is not editable offline");
    });
    it("sizes a material's cost box small inside forms so the row stays within the modal", () => {
      assert.match(html, /\.form-group \.cost-input[^{]*\{[^}]*width:\s*84px/);
      assert.match(html, /\.form-group \.material-row input\[type="number"\][^{]*\{[^}]*width:\s*84px/);
    });
    it("puts Tags on its own line at the top level and Task number in Scheduling, with short labels", () => {
      const modal = at(`id="editModal"`);
      const tags = at(`id="editTags"`);
      const scheduling = at(`id="editScheduling"`);
      const num = at(`id="editNumber"`);
      assert.ok(modal < tags && tags < scheduling && scheduling < num);
      assert.doesNotMatch(html.slice(modal, at(`id="editProject"`)), /field-pair/, "no row shares the Tags line");
      assert.match(html, /<label for="editNumber">Task number<\/label>/);
      // the field and both buttons fill the whole row: no narrow wrapper, and the input takes the space the buttons leave
      const row = html.slice(html.lastIndexOf(`<div class="form-group"`, num), html.indexOf("</details>", num));
      assert.doesNotMatch(row.slice(0, row.indexOf("<label")), /max-width/);
      assert.match(row, /fillTaskNumber\('edit', 'top'\)[^]*fillTaskNumber\('edit', 'bottom'\)/);
      assert.match(html, /\.field-with-btn > input \{[^}]*flex: 1/);
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
    it("makes the History page the project hours and completed list, with no Stats card, loaded on each visit", () => {
      const page = at(`id="pageHistory"`);
      const end = at("</main>", page);
      assert.ok(page > at(`id="pageMaterials"`) && end < at(`id="pageSettings"`));
      assert.ok(at(`id="completedList"`) > page && at(`id="completedList"`) < end);
      assert.equal(html.slice(page, end).includes("statsDetails"), false);
      assert.deepEqual(html.slice(page, end).match(/<details\b[^>]*id="(\w+)"/g).map((m) => m.match(/id="(\w+)"/)[1]), ["completedTagsDetails"], "only the Tags section collapses");
      assert.doesNotMatch(html, /completedDetails|Recently [Cc]ompleted/);
      const show = html.slice(at("function showTab"), at("function showTab") + 700);
      assert.match(show, /tab === "history"\) fetchCompleted\(\)/);
      const fetchFn = html.slice(at("async function fetchCompleted"), at("// The Stats card on the Settings page"));
      assert.match(fetchFn, /getElementById\("completedProject"\)\.innerHTML = renderProjectHours\(/);
      assert.match(html.slice(at("function showCompletedCopy"), at("async function fetchCompleted")), /getElementById\("completedProject"\)\.innerHTML = '<p class="settings-note">Project hours need a connection\./);
      assert.doesNotMatch(fetchFn, /stats|renderSummary/i);
      const summaryFn = html.slice(at("function renderSummary"), at("function renderProjectHours"));
      assert.ok(summaryFn.indexOf("Most completed jobs") > summaryFn.indexOf("By project"));
    });
    it("orders the History page as the search box, the Tags section, the Project section, then the count line, pager and list", () => {
      const page = at(`id="pageHistory"`);
      const order = ["completedSearch", "completedTagsDetails", "completedProject", "completedCount", "completedRows"].map((id) => at(`id="${id}"`, page));
      assert.deepEqual([...order].sort((a, b) => a - b), order);
      assert.ok(at(`id="completedList"`, page) < at(`id="completedBrowser"`, page), "the status messages stay above the browser");
      assert.ok(at(`id="completedProject"`, page) > at(`id="completedBrowser"`, page), "the Project section sits inside the browser");
    });
    it("puts a collapsed Stats card last on the Settings page, read on each visit through a one-entry getCompletedTasks", () => {
      const page = at(`id="pageSettings"`);
      const end = at("</main>", page);
      const open = at(`<details class="card settings-card" id="statsDetails"`, page);
      assert.ok(open > at("<summary><h3>Tidy up</h3></summary>", page) && open < end, "the Stats card comes after Tidy up");
      assert.match(html.slice(open, html.indexOf(">", open)), /^<details class="card settings-card" id="statsDetails" hidden$/, "collapsed (no open attribute) until the stats load");
      const close = html.indexOf("</details>", open);
      assert.match(html.slice(open, close), /<summary><h3>Stats<\/h3><\/summary>\s*<div id="statsSummary"><\/div>/);
      const show = html.slice(at("function showTab"), at("function showTab") + 800);
      assert.match(show, /tab === "settings"\) \{\s*fetchStats\(\);/);
      const fn = html.slice(at("async function fetchStats"), at("async function fetchStats") + 1400);
      assert.match(fn, /\$\{COMPLETED_URL\}\?limit=1/);
      assert.match(fn, /\(data\.tasks \|\| \[\]\)\.length === 0 \? "" : renderSummary\(data\.summary\)/);
      assert.match(fn, /stats\.hidden = summaryHtml === ""/);
      assert.match(fn, /Stats need a connection\./);
      assert.equal((fn.match(/stats\.hidden = true/g) || []).length, 1, "hidden for a failed load that is not a lost connection");
      assert.doesNotMatch(fn, /\.open\b/, "the open state is left alone");
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
    it("has no Projects card of its own: the Queue's Project field sits just below the collapsible Tags section, its project actions in the modal's Manage section", () => {
      const q = at(`id="queueCard"`);
      const tags = at(`<details class="filter-section" id="tagsDetails">`, q);
      const projects = at(`<div class="project-section" id="projectsSection">`, q);
      assert.ok(q < tags && closeOf(tags) < projects && projects < at(`id="taskList"`, q));
      assert.ok(at(`id="tagFilterBar"`, tags) < closeOf(tags));
      assert.ok(at(`id="queueProjectLabel"`, projects) < at(`id="queueProjectField"`, projects), "the label sits to the left of the field");
      for (const id of ["queueProjectField", "projectsStatus"]) {
        assert.ok(at(`id="${id}"`, projects) > projects && at(`id="${id}"`, projects) < at(`id="sortBy"`, q), `${id} sits in the Project section`);
      }
      const page = html.slice(projects, at(`id="sortBy"`, q));
      for (const id of ["projectActions", "projectNewClient", "projectLocation", "projectUrl", "projectTemplateAction"]) assert.ok(!page.includes(`id="${id}"`), `${id} is not under the field any more`);
      assert.equal(html.split(`id="projectsSection"`).length, 2, "one Project section only");
      assert.doesNotMatch(html, /id="projectFilterBar"|id="newProjectName"|id="addProjectBtn"|id="projectsActive"|id="projectsDetails"/, "the old search, Add button and list are gone");
    });
    it("holds the chosen project's actions in a collapsible Manage section of the Project modal, headed by its name, collapsed on every open", () => {
      const modal = at(`id="pickerModal"`);
      const manage = at(`<details class="filter-section" id="pickerManage" hidden>`, modal);
      const end = closeOf(manage);
      assert.ok(at(`id="pickerList"`, modal) < manage && at(`id="pickerStatus"`, modal) < manage && end < at(`onclick="closePicker()"`, modal), "below the list, above Cancel");
      assert.match(html.slice(manage, at("</summary>", manage)), /Manage <small id="pickerManageName">/);
      for (const id of ["projectActions", "projectNewClient", "projectLocation", "projectUrl", "projectTemplateAction"]) {
        const i = at(`id="${id}"`, manage);
        assert.ok(i > manage && i < end, `${id} is in Manage`);
      }
      const fn = html.slice(html.indexOf("function renderPickerManage()"), html.indexOf("function pickerTyped()"));
      assert.match(fn, /pickerState\.kind === "queue" \? allProjects\.find\(p => p\.id === selectedProjectFilter\) \|\| null : null/, "shown for a chosen project only, never for All, and only while the Queue's modal is in front");
      assert.match(fn, /hidden = !chosen/);
      assert.match(fn, /`· \$\{chosen\.name\}`/);
      assert.match(html, /if \(kind === "queue" && !over\) \{[^}]*getElementById\("pickerManage"\)\.open = false;/, "collapsed on every open");
      assert.match(html, /document\.getElementById\("pickerManage"\)\.open = false; \/\/ the new project's Manage starts collapsed too/);
      const render = html.slice(html.indexOf("function renderProjects()"), html.indexOf("// The chosen project's Location row"));
      assert.match(render, /if \(pickerState && pickerState\.kind === "queue"\) renderPicker\(\);/, "a rename or client change redraws the rows and the heading");
    });
    it("lets a picker open over the Project modal and returns to it as it was; Delete closes the modal", () => {
      const open = html.slice(html.indexOf("function openPicker("), html.indexOf("function closePickerOnOverlay"));
      assert.match(open, /const over = pickerState !== null;\s*if \(over\) pickerParents\.push\(\{ state: pickerState, search: search\.value \}\);/);
      assert.match(open, /if \(!over\) \{\s*showLayer\("pickerModal", closePicker\);/, "one layer, shown once");
      assert.match(open, /const parent = pickerParents\.pop\(\) \|\| null;\s*if \(parent\) \{[^}]*pickerState = parent\.state;\s*applyPicker\(parent\.state, parent\.search\);\s*renderPicker\(\);/);
      assert.ok(open.indexOf("pickerParents.pop()") < open.indexOf("hideLayer(\"pickerModal\")"), "the modal is hidden only when no picker is left underneath");
      const del = html.slice(html.indexOf("async function deleteProject("), html.indexOf("// Picking an address saves it"));
      assert.match(del, /await saveProject\(\{ action: "DELETE", projectId \}, `Deleted "\$\{project\.name\}"\.`\) && pickerState && pickerState\.kind === "queue"\) closePicker\(\);/);
    });
    it("shows the Queue's project as a labelled picker button, \"Project\" to its left, disabled until the projects are loaded", () => {
      const line = html.slice(at(`id="queueProjectLabel"`) - 120, at(`</button>`, at(`id="queueProjectField"`)));
      assert.match(line, /<div class="picker-line">\s*<span class="picker-line-label" id="queueProjectLabel">Project<\/span>/);
      assert.match(line, /<button type="button" id="queueProjectField" class="picker-field" aria-haspopup="dialog" aria-labelledby="queueProjectLabel queueProjectField" onclick="openQueueProjectPicker\(\)" disabled>All$/);
      assert.match(html, /const QUEUE_ALL_PROJECTS = "All";/);
      const render = html.slice(html.indexOf("function renderProjects()"), html.indexOf("// The chosen project's Location row"));
      assert.match(render, /field\.textContent = chosen \? chosen\.name \|\| "Untitled project" : QUEUE_ALL_PROJECTS;\s*field\.disabled = false;/);
      assert.doesNotMatch(render, /project-item|projectFilterBar/);
    });
    it("opens the Queue's picker with All first, no Add row and an Add button, and filters the Queue with the pick", () => {
      const fn = html.slice(html.indexOf("function openQueueProjectPicker()"), html.indexOf("async function renameProject"));
      assert.match(fn, /openPicker\("queue", selectedProjectFilter \|\| "", selectQueueProject, \{ opener: document\.getElementById\("queueProjectField"\), allowAdd: false, noneLabel: QUEUE_ALL_PROJECTS, noneDetail: String\(allTasks\.length\), onAdd: addProject \}\);/);
      assert.match(fn, /setProjectFilter\(pick\.id === "" \? null : pick\.id\);/);
      assert.match(html, /<button type="button" id="pickerAddBtn" onclick="addFromPicker\(\)" hidden>Add<\/button>/);
      assert.ok(at(`id="pickerSearch"`) < at(`id="pickerAddBtn"`) && at(`id="pickerAddBtn"`) < at(`id="pickerList"`), "the Add button sits beside the search bar, above the list");
    });
    it("Add creates the project, chooses it and leaves the modal open with the search emptied", () => {
      const add = html.slice(html.indexOf("async function addProject("), html.indexOf("function openQueueProjectPicker"));
      assert.match(add, /saveProject\(\{ action: "CREATE", name: typed \}, `Added "\$\{typed\}"\.`, \(data\) => \{ created = data\.project \|\| null; \}\)/);
      assert.match(add, /setProjectFilter\(created\.id\);\s*return created\.id;/);
      assert.match(add, /return null;/, "a refusal returns null");
      const fromPicker = html.slice(html.indexOf("async function addFromPicker()"), html.indexOf("const PROJECT_PREFIXES"));
      assert.match(fromPicker, /const id = await state\.onAdd\(name\);\s*if \(id && pickerState === state\) \{\s*state\.current = id;\s*state\.active = 0;\s*search\.value = "";\s*renderPicker\(\);/);
      assert.doesNotMatch(fromPicker, /closePicker|pickFromPicker/, "the modal stays open");
      assert.match(html, /else if \(state\.onAdd\) addFromPicker\(\);/, "Enter with nothing to pick adds the typed name");
      assert.match(html, /if \(pickerState && pickerState\.kind === "queue"\) document\.getElementById\("pickerStatus"\)\.textContent = text;/, "the result shows in the modal, over the page's own line");
    });
    it("adds a Project select and an Order number field, disabled until a project is chosen, to the edit modal", () => {
      const modal = at(`id="editModal"`);
      assert.ok(at(`id="editProject"`, modal) < at(`id="editProjectOrder"`, modal));
      assert.match(html.slice(at(`id="editProjectOrder"`, modal), at(">", at(`id="editProjectOrder"`, modal))), /disabled/);
    });
    it("no longer offers Plan My Week anywhere on the page", () => {
      assert.doesNotMatch(html, /Plan My Week/);
    });
    it("has one Queue card with no heading of its own (no collapsible Queue), holding the add field, the filters and the list", () => {
      const q = at(`id="queueCard"`);
      assert.doesNotMatch(html, /queueDetails|Organized Queue|Tap to edit/);
      assert.doesNotMatch(html.slice(at(`id="offlineNote"`, q), at(`id="tagsDetails"`, q)), /<summary|<h3/);
      assert.ok(q < at(`id="tagFilterBar"`, q) && at(`id="tagFilterBar"`, q) < at(`id="taskList"`, q));
      assert.ok(at(`id="taskList"`, q) < at("</main>", q));
    });
    it("uses the add field as the Queue's search box: one box, no second search row in the Queue card, redrawing the list as you type", () => {
      const q = at(`id="queueCard"`);
      const queueCard = html.slice(q, at(`id="taskList"`, q));
      assert.equal(queueCard.includes(`id="taskSearch"`), false);
      assert.equal(queueCard.includes(`class="search-row"`), false);
      const add = html.slice(html.lastIndexOf("<input", at(`id="taskInput"`)), html.indexOf(">", at(`id="taskInput"`)));
      assert.match(add, /type="text"[^>]*placeholder="Add or search tasks, #job, @client"/);
      const input = html.slice(html.indexOf(`getElementById("taskInput").addEventListener("input", () => {`), html.indexOf(`getElementById("clearSearchBtn").addEventListener("click"`));
      assert.match(input, /renderTasks\(\)/);
      assert.match(html, /filterTasks\(rest, selectedTagFilters, selectedProjectFilter, document\.getElementById\("taskInput"\)\.value, t => projectClientNameById\(t\.projectId, allProjects, allClients\)\)/);
      assert.match(html, /id="completedSearch" class="search-box" placeholder="Search completed, #job, @client"/);
      assert.match(html, /completedBrowse\(completedAll, query, completedPageNo, clientName, /);
    });
    it("shows a Clear button between the add field and Add only while the field holds text, and a reset or copied template keeps it in step", () => {
      const row = html.slice(at(`<div class="input-row">`), at(`id="addBtn"`));
      assert.ok(row.indexOf(`id="taskInput"`) < row.indexOf(`id="clearSearchBtn"`));
      assert.match(row, /id="clearSearchBtn"[^>]*\bhidden\b[^>]*>Clear</);
      assert.match(html, /clearSearchBtn"\)\.hidden = document\.getElementById\("taskInput"\)\.value === ""/);
      assert.match(html, /\.input-row button\[hidden\]\s*\{\s*display:\s*none/);
      const reset = html.slice(at("function resetAddForm"), at("function resetAddForm") + 500);
      assert.match(reset, /clearSearchBtn"\)\.hidden = true/);
      assert.match(reset, /renderTasks\(\)/);
      const use = html.slice(at("function useTemplate"), at("// Task number, Repeats, project"));
      assert.match(use, /clearSearchBtn"\)\.hidden = false/);
      assert.match(use, /renderTasks\(\)/);
    });
    it("lists past tasks in the compact picker format: title only, no second line", () => {
      const fn = html.slice(at("function renderTemplateResults"), at("async function searchTemplates"));
      assert.match(fn, /class="project-list"/);
      assert.match(fn, /class="project-item template-option"/);
      assert.match(fn, /project-item-name/);
      assert.equal(/<small>|templateMeta/.test(fn), false);
      assert.match(html, /const TEMPLATE_MAX_ROWS = 8;/);
      assert.match(html, /function templateMatches\(templates, query, limit = TEMPLATE_MAX_ROWS\)/);
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
      assert.doesNotMatch(html.slice(html.lastIndexOf("<", note), html.indexOf(">", note)), /toast/, "the footnote is not the toast");
      const {UNDO_WINDOW_MS, UNDO_NOTE_MS} = load();
      const server = fs.readFileSync(path.join(__dirname, "..", "tasks.js"), "utf8");
      assert.match(server, new RegExp(`UNDO_WINDOW_MS = ${UNDO_WINDOW_MS / 60000} \\* 60 \\* 1000`), "the page's window matches the server's");
      assert.ok(UNDO_NOTE_MS < UNDO_WINDOW_MS && UNDO_NOTE_MS > 8000);
    });
    it("starts the Tags section collapsed", () => {
      const i = at(`id="tagsDetails"`);
      assert.doesNotMatch(html.slice(html.lastIndexOf("<details", i), html.indexOf(">", i)), /\bopen\b/, "tagsDetails is collapsed");
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
    it("manualTaskBody sends a link in the form it is saved in, and none for an empty box", () => {
      const {manualTaskBody} = load();
      const form = {title: "Fit tap", priority: "LOW", estimatedMinutes: "30"};
      assert.equal(manualTaskBody({...form, url: " example.com/job "}).manual.url, "https://example.com/job");
      assert.equal(manualTaskBody({...form, url: "http://example.com/a"}).manual.url, "http://example.com/a");
      for (const v of ["", "  ", null, undefined, "javascript:alert(1)"]) assert.equal("url" in manualTaskBody({...form, url: v}).manual, false, String(v));
    });
    it("templateFormValues fills the link from a completed task", () => {
      const {templateFormValues} = load();
      assert.equal(templateFormValues({title: "Fit tap", url: "https://example.com/job"}).url, "https://example.com/job");
      for (const url of [undefined, null, 5]) assert.equal(templateFormValues({title: "Fit tap", url}).url, "", String(url));
    });
    it("completedChanges sends the link only when it differs, null to clear and an error for a bad one", () => {
      const {completedChanges, completedFormValues, INVALID_URL} = load();
      const zone = "Pacific/Auckland";
      const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 0, url: "https://example.com/job", completedAt: "2026-10-17T20:30:00.000Z"};
      const form = () => ({...completedFormValues(row, zone)});
      assert.equal(form().url, "https://example.com/job");
      assert.deepEqual(completedChanges(row, form(), zone), {fields: {}});
      assert.deepEqual(completedChanges(row, {...form(), url: " https://example.com/job "}, zone), {fields: {}}, "other spacing is no change");
      assert.deepEqual(completedChanges(row, {...form(), url: "other.example/x"}, zone), {fields: {url: "https://other.example/x"}});
      for (const v of ["", "  ", null]) assert.deepEqual(completedChanges(row, {...form(), url: v}, zone), {fields: {url: null}}, String(v));
      assert.equal(completedChanges(row, {...form(), url: "mailto:a@b.co"}, zone).error, INVALID_URL);
      const bare = {...row};
      delete bare.url;
      assert.equal(completedFormValues(bare, zone).url, "");
      assert.deepEqual(completedChanges(bare, {...completedFormValues(bare, zone), url: ""}, zone), {fields: {}}, "none left as none");
      assert.deepEqual(completedChanges(bare, {...completedFormValues(bare, zone), url: "a.example"}, zone), {fields: {url: "https://a.example"}});
    });
    it("lets a link be edited from the saved copy of History", () => {
      const {completedFieldDisabled, COMPLETED_FORM_CONTROLS, OFFLINE_COMPLETED_FIELDS} = load();
      assert.equal(COMPLETED_FORM_CONTROLS.ceUrl, "url");
      assert.ok(OFFLINE_COMPLETED_FIELDS.includes("url"));
      assert.equal(completedFieldDisabled("url", true), false);
    });
    it("takes a task's link from the task, else its project, else the project's client", () => {
      const {effectiveUrl} = load();
      const projects = [{id: "p1", name: "Reno", clientId: "c1", url: "https://project.example/plan"}, {id: "p2", name: "Fence", clientId: "c1"}, {id: "p3", name: "Solo"}, {id: "p4", name: "Bad", clientId: "c1", url: "javascript:alert(1)"}];
      const clients = [{id: "c1", name: "Smith", url: "https://client.example/job"}, {id: "c2", name: "Jones"}];
      assert.deepEqual(effectiveUrl(" example.com/own ", "p1", projects, clients), {url: "https://example.com/own", from: "task"});
      assert.deepEqual(effectiveUrl("", "p1", projects, clients), {url: "https://project.example/plan", from: "project"});
      assert.deepEqual(effectiveUrl("  ", "p2", projects, clients), {url: "https://client.example/job", from: "client"}, "a project with no link uses its client's");
      assert.deepEqual(effectiveUrl("", "p4", projects, clients), {url: "https://client.example/job", from: "client"}, "an unusable stored link is passed over");
      assert.deepEqual(effectiveUrl("", "p3", projects, clients), {url: "", from: ""});
      assert.deepEqual(effectiveUrl("", "", projects, clients), {url: "", from: ""});
      assert.deepEqual(effectiveUrl("", "gone", projects, clients), {url: "", from: ""});
      assert.deepEqual(effectiveUrl(undefined, "p1", undefined, undefined), {url: "", from: ""});
      assert.deepEqual(effectiveUrl("two words", "p1", projects, clients), {url: "", from: "task"}, "a typed link that is wrong gives nothing to open, and does not fall back");
    });
    it("shows the inherited link as the Link box's placeholder", () => {
      const {urlPlaceholder} = load();
      assert.equal(urlPlaceholder({url: "https://project.example/plan", from: "project"}), "From project: https://project.example/plan");
      assert.equal(urlPlaceholder({url: "https://client.example/job", from: "client"}), "From client: https://client.example/job");
      assert.equal(urlPlaceholder({url: "https://example.com/own", from: "task"}), "e.g. example.com/menu");
      assert.equal(urlPlaceholder({url: "", from: ""}), "e.g. example.com/menu");
    });
    it("has a Link box in the add card and both edit forms, and a Link button beside Navigate in both modals", () => {
      assert.match(html, /<input type="url" id="manualUrl" maxlength="500"/);
      for (const prefix of ["edit", "ce"]) {
        assert.match(html, new RegExp(`<input type="url" id="${prefix}Url" maxlength="500"[^>]*oninput="refreshContact\\('${prefix}'\\)"`));
        assert.match(html, new RegExp(`<a id="${prefix}Link" class="contact-btn btn-secondary" href="#" target="_blank" rel="noopener noreferrer" hidden>🔗 Link</a>`));
        assert.ok(html.indexOf(`id="${prefix}ContactActions"`) < html.indexOf(`id="${prefix}Navigate"`) && html.indexOf(`id="${prefix}Navigate"`) < html.indexOf(`id="${prefix}Link"`), "Link follows Navigate, after the contact buttons");
      }
      assert.ok(html.indexOf("id=\"editEmail\"") < html.indexOf("id=\"editUrl\"") && html.indexOf("id=\"ceEmail\"") < html.indexOf("id=\"ceUrl\"") && html.indexOf("id=\"manualEmail\"") < html.indexOf("id=\"manualUrl\""), "after Email");
    });
    it("hides the Navigate row only when neither Navigate nor Link has anything to open, and follows the typed box and the project", () => {
      const fn = html.slice(html.indexOf("function refreshNavigateRow"), html.indexOf("// Brings a form's Phone, Email and Link placeholders"));
      assert.match(fn, /navigate\.hidden = where === "";/);
      assert.match(fn, /open\.hidden = url === "";/);
      assert.match(fn, /`\$\{prefix\}NavigateActions`\)\.hidden = where === "" && url === "";/);
      assert.match(fn, /effectiveUrl\(urlBox\.value, projectId, allProjects, allClients\)\.url/);
      assert.match(html, /refreshNavigateRow\(prefix\);\n\s*\}/, "the location's refresh brings the row along");
      assert.match(html, /urlBox\.placeholder = urlPlaceholder\(effectiveUrl\(urlBox\.value, projectId, allProjects, allClients\)\);/);
    });
    it("warns about a bad link when adding or saving, and sends it with the save", () => {
      assert.match(html, /if \(manual && parseUrlText\(document\.getElementById\("manualUrl"\)\.value\) === undefined\) \{ warnInSection\("manualContact", INVALID_URL\); return; \}/);
      assert.match(html, /if \(url === undefined\) \{ warnInSection\("editContact", INVALID_URL\); return false; \}/);
      assert.match(html, /phone: document\.getElementById\("editPhone"\)\.value\.trim\(\), email, url, description:/);
      assert.match(html, /url: document\.getElementById\("manualUrl"\)\.value,/);
      assert.match(html, /url: document\.getElementById\("ceUrl"\)\.value,/);
      assert.match(html, /document\.getElementById\("manualUrl"\)\.value = "";/, "cleared after each manual add");
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
    it("has Travel (km) boxes in the Audit trail of both edit modals, in the add form and a Travel rate in Job Sheets", () => {
      const has = (details, id) => {
        const start = html.indexOf(`id="${details}"`);
        const i = html.indexOf(`id="${id}"`);
        assert.ok(start > 0 && i > start && i < html.indexOf("</details>", start), `${id} is in ${details}`);
      };
      has("editAudit", "editTravel");
      has("ceAudit", "ceTravel");
      assert.ok(html.indexOf("id=\"manualTravel\"") > html.indexOf("id=\"manualAudit\"") && html.indexOf("id=\"manualTravel\"") < html.indexOf("id=\"manualMaterials\""), "Travel opens the add card's Audit trail, before Materials");
      assert.ok(html.indexOf("id=\"editTravel\"") > html.indexOf("id=\"editAudit\"") && html.indexOf("id=\"editTravel\"") < html.indexOf("id=\"editMaterials\""), "Travel opens the Audit trail, before Materials");
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
      assert.deepEqual(jobNumberWords("#123 Fit tap #0007 #"), {numbers: [123, 7], clients: [], words: ["fit", "tap"]});
      assert.deepEqual(jobNumberWords(""), {numbers: [], clients: [], words: []});
      assert.deepEqual(jobNumberWords(undefined), {numbers: [], clients: [], words: []});
      assert.deepEqual(jobNumberWords("#5a a#5"), {numbers: [], clients: [], words: ["#5a", "a#5"]});
    });
    it("takes at-then-text words as client words, dropping a bare at sign and leaving a mid-word one as text", () => {
      const {jobNumberWords} = load();
      assert.deepEqual(jobNumberWords("@Smith fit @ltd @ #12"), {numbers: [12], clients: ["smith", "ltd"], words: ["fit"]});
      assert.deepEqual(jobNumberWords("jo@x.nz @@a"), {numbers: [], clients: ["@a"], words: ["jo@x.nz"]});
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
    it("sends the area preference only for the fields the form supplies", () => {
      const h = load();
      assert.equal("travelGrouping" in h.settingsPayload(form), false, "no area fields, nothing sent");
      assert.deepEqual(h.settingsPayload({...form, travelGroupingEnabled: true, travelRadiusKm: "7.5", travelDeferDays: "2"}).travelGrouping, {enabled: true, radiusKm: 7.5, maxDeferDays: 2});
      assert.deepEqual(h.settingsPayload({...form, travelGroupingEnabled: false, travelRadiusKm: "", travelDeferDays: "  "}).travelGrouping, {enabled: false});
      assert.deepEqual(h.settingsPayload({...form, travelGroupingEnabled: 1, travelDeferDays: "0"}).travelGrouping, {enabled: true, maxDeferDays: 0});
    });
    it("sends an area preference the server accepts, and leaves bad numbers for it to reject", () => {
      const h = load();
      const {mergeSettings, applySettingsUpdate} = require("../settings");
      const send = (extra) => applySettingsUpdate(mergeSettings(undefined), h.settingsPayload({...form, ...extra}));
      assert.deepEqual(send({travelGroupingEnabled: false, travelRadiusKm: "12", travelDeferDays: "5"}).settings.travelGrouping, {enabled: false, radiusKm: 12, maxDeferDays: 5});
      assert.deepEqual(send({travelRadiusKm: "", travelDeferDays: ""}).settings.travelGrouping, {enabled: true, radiusKm: 5, maxDeferDays: 3}, "empty numbers keep the saved values");
      assert.match(send({travelGroupingEnabled: true, travelRadiusKm: "0"}).error, /travelGrouping\.radiusKm/);
      assert.match(send({travelGroupingEnabled: true, travelDeferDays: "2.5"}).error, /travelGrouping\.maxDeferDays/);
      assert.match(send({travelGroupingEnabled: true, travelDeferDays: "abc"}).error, /travelGrouping\.maxDeferDays/);
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
  describe("filterProjects", () => {
    const projects = [{id: "p1", name: "Kitchen reno", clientId: "c1"}, {id: "p2", name: "Garden path"}, {id: "p3", name: "Bathroom", clientId: "c2"}];
    const clients = [{id: "c1", name: "Smith Ltd"}, {id: "c2", name: "Jones"}];
    const ids = (list) => list.map((p) => p.id);
    it("keeps every project for a blank query", () => {
      const h = load();
      assert.deepEqual(ids(h.filterProjects(projects, clients, "")), ["p1", "p2", "p3"]);
      assert.deepEqual(ids(h.filterProjects(projects, clients, "   ")), ["p1", "p2", "p3"]);
      assert.deepEqual(ids(h.filterProjects(projects, clients, undefined)), ["p1", "p2", "p3"]);
    });
    it("matches the project name, ignoring case", () => {
      assert.deepEqual(ids(load().filterProjects(projects, clients, "KIT")), ["p1"]);
    });
    it("matches the client's name too", () => {
      const h = load();
      assert.deepEqual(ids(h.filterProjects(projects, clients, "smith")), ["p1"]);
      assert.deepEqual(ids(h.filterProjects(projects, clients, "jones")), ["p3"]);
    });
    it("needs every word to match, in the name or the client name", () => {
      const h = load();
      assert.deepEqual(ids(h.filterProjects(projects, clients, "reno smith")), ["p1"]);
      assert.deepEqual(ids(h.filterProjects(projects, clients, "reno jones")), []);
    });
    it("copes with a missing client list and does not modify its input", () => {
      const copy = JSON.stringify(projects);
      assert.deepEqual(ids(load().filterProjects(projects, undefined, "garden")), ["p2"]);
      assert.deepEqual(ids(load().filterProjects(projects, [], "smith")), []);
      assert.equal(JSON.stringify(projects), copy);
    });
  });
  describe("pickerRows", () => {
    const projects = [{id: "p1", name: "Kitchen reno", clientId: "c1"}, {id: "p2", name: "Garden path"}, {id: "p3", name: "Bathroom", clientId: "c2"}, {id: "p4", name: "attic"}];
    const clients = [{id: "c1", name: "Smith Ltd"}, {id: "c2", name: "Jones"}, {id: "c3", name: "Brown"}];
    const ids = (view) => view.rows.map((r) => r.id);
    const project = (query, counts = {}, items = projects) => load().pickerRows("project", query, items, {clients, counts});
    const client = (query, items = clients, owned = projects) => load().pickerRows("client", query, items, {projects: owned});
    it("shows every project for an empty bar, the most used first and equal use in name order", () => {
      assert.deepEqual(ids(project("")), ["p4", "p3", "p2", "p1"], "no use at all: name order, case ignored");
      assert.deepEqual(ids(project("", {p1: 2, p3: 5})), ["p3", "p1", "p4", "p2"]);
      assert.deepEqual(ids(project("   ", {p2: 1})), ["p2", "p4", "p3", "p1"], "blanks are an empty bar");
      assert.deepEqual(ids(project(undefined)), ["p4", "p3", "p2", "p1"]);
    });
    it("gives each project row its client's name as detail, empty for a project with none", () => {
      const rows = project("").rows;
      assert.deepEqual(rows.find((r) => r.id === "p1"), {id: "p1", name: "Kitchen reno", detail: "Smith Ltd"});
      assert.deepEqual(rows.find((r) => r.id === "p2"), {id: "p2", name: "Garden path", detail: ""});
    });
    it("matches projects by name or client name through filterProjects, still ranked by use", () => {
      assert.deepEqual(ids(project("KIT")), ["p1"]);
      assert.deepEqual(ids(project("jones")), ["p3"]);
      assert.deepEqual(ids(project("reno smith")), ["p1"]);
      assert.deepEqual(ids(project("a", {p2: 3})), ["p2", "p4", "p3"], "Garden path, attic and Bathroom contain an a: most used first, then name order");
    });
    it("caps the rows at 8 and says when more matched", () => {
      const many = Array.from({length: 11}, (_, i) => ({id: `p${i}`, name: `Job ${String.fromCharCode(65 + i)}`}));
      const all = project("", {}, many);
      assert.equal(load().PICKER_MAX_ROWS, 8);
      assert.equal(all.rows.length, 8);
      assert.equal(all.more, true);
      assert.deepEqual(ids(all), many.slice(0, 8).map((p) => p.id));
      const narrowed = project("job k", {}, many);
      assert.deepEqual(ids(narrowed), ["p10"]);
      assert.equal(narrowed.more, false);
      const exactly = project("", {}, many.slice(0, 8));
      assert.equal(exactly.rows.length, 8);
      assert.equal(exactly.more, false, "eight is not more than eight");
    });
    it("offers Add for typed text that matches no name, ignoring case and blank runs, as the server's hasName does", () => {
      assert.equal(project("").add, "", "nothing typed, nothing to add");
      assert.equal(project("   ").add, "");
      assert.equal(project("Deck").add, "Deck");
      assert.equal(project("  Deck   build ").add, "Deck build", "blanks collapse as the server reads the name");
      assert.equal(project("kitchen").add, "kitchen", "a part of a name is not the name");
      assert.equal(project("KITCHEN RENO").add, "", "a taken name, any case");
      assert.equal(project("kitchen   reno").add, "", "a taken name with extra blanks");
      assert.equal(project("ATTIC").add, "");
      assert.equal(project("Smith Ltd").add, "Smith Ltd", "a client's name is not a project's name, so it can be added");
      assert.deepEqual(ids(project("Smith Ltd")), ["p1"], "while the project of that client still shows");
    });
    it("checks the name against every project, not only the rows shown", () => {
      const many = Array.from({length: 12}, (_, i) => ({id: `p${i}`, name: `Job ${i}`}));
      const view = project("job 11", {}, many);
      assert.equal(view.add, "");
      assert.deepEqual(ids(view), ["p11"]);
    });
    it("lists clients by their number of projects and matches every word of the name", () => {
      assert.deepEqual(ids(client("")), ["c2", "c1", "c3"], "one project each for Jones and Smith Ltd (name order), none for Brown");
      const owned = [{id: "a", clientId: "c2"}, {id: "b", clientId: "c2"}, {id: "c", clientId: "c1"}, {id: "d"}];
      assert.deepEqual(ids(client("", clients, owned)), ["c2", "c1", "c3"]);
      assert.deepEqual(ids(client("ltd smi", clients, owned)), ["c1"]);
      assert.deepEqual(ids(client("zzz", clients, owned)), []);
      assert.deepEqual(client("", clients, owned).rows[0], {id: "c2", name: "Jones", detail: ""});
      assert.equal(client("jones", clients, owned).add, "");
      assert.equal(client("Jones & Co", clients, owned).add, "Jones & Co");
    });
    it("copes with missing or odd input and does not modify what it is given", () => {
      const h = load();
      assert.deepEqual(h.pickerRows("project", "x", undefined, undefined), {rows: [], more: false, add: "x"});
      assert.deepEqual(h.pickerRows("project", undefined, null, null), {rows: [], more: false, add: ""});
      assert.deepEqual(h.pickerRows("client", "", [null, 5, {id: "c1", name: "Jo"}], {projects: [null, {clientId: "c1"}]}).rows, [{id: "c1", name: "Jo", detail: ""}]);
      const copy = JSON.stringify([projects, clients]);
      project("a", {p1: 1});
      assert.equal(JSON.stringify([projects, clients]), copy);
    });
    it("words each kind's dialog", () => {
      assert.deepEqual(Object.keys(load().PICKER_KINDS), ["project", "client", "hours", "queue"]);
      assert.equal(load().PICKER_KINDS.queue.title, "Projects");
      assert.equal(load().PICKER_KINDS.queue.add("Deck"), "", "the Queue's modal has no Add row");
      assert.equal(load().PICKER_KINDS.project.title, "Choose a project");
      assert.equal(load().PICKER_KINDS.project.add("Deck"), "＋ Add “Deck” as a new project");
      assert.equal(load().PICKER_KINDS.client.add("Jo"), "＋ Add “Jo” as a new client");
    });
    it("lists the Queue's projects in the order given, uncapped, with the task count and client at the right and no Add row", () => {
      const h = load();
      const projects = [{id: "a", name: "Bathroom", clientId: "c1"}, {id: "b", name: "Deck"}, {id: "c", name: "Kitchen reno", clientId: "c2"}];
      const clients = [{id: "c1", name: "Smith Ltd"}, {id: "c2", name: "Jones"}];
      const counts = {a: 2, c: 11};
      const view = h.pickerRows("queue", "", projects, {clients, counts});
      assert.deepEqual(view.rows, [{id: "a", name: "Bathroom", detail: "2 · Smith Ltd"}, {id: "b", name: "Deck", detail: "0"}, {id: "c", name: "Kitchen reno", detail: "11 · Jones"}], "alphabetical as given, not the most used first");
      assert.equal(view.more, false);
      assert.equal(view.add, "");
      assert.deepEqual(h.pickerRows("queue", "SMITH", projects, {clients, counts}).rows.map((r) => r.id), ["a"], "a client's name matches too");
      assert.deepEqual(h.pickerRows("queue", "reno kit", projects, {clients, counts}).rows.map((r) => r.id), ["c"]);
      assert.equal(h.pickerRows("queue", "Brand new", projects, {clients, counts}).add, "", "a name that matches nothing offers no Add row");
      assert.deepEqual(h.pickerRows("queue", "x", undefined, undefined), {rows: [], more: false, add: ""});
      const many = Array.from({length: 12}, (_, i) => ({id: `p${i}`, name: `Job ${i}`}));
      assert.equal(h.pickerRows("queue", "", many, {}).rows.length, 12, "every project is listed");
      assert.equal(h.pickerRows("queue", "", many, {}).more, false);
      assert.deepEqual(projects, [{id: "a", name: "Bathroom", clientId: "c1"}, {id: "b", name: "Deck"}, {id: "c", name: "Kitchen reno", clientId: "c2"}], "the input is not modified");
    });
    it("lists History's projects as given, newest week first, matched by name, with the hours as the detail and no Add row", () => {
      const h = load();
      const entries = [
        {projectId: "b", name: "Deck build", minutes: 200, estimatedMinutes: 0},
        {projectId: "a", name: "Kitchen reno", minutes: 90, estimatedMinutes: 30},
        {projectId: "c", name: ""},
      ];
      const items = h.historyProjectChoices(entries);
      assert.deepEqual(items.map((i) => [i.id, i.name]), [["b", "Deck build"], ["a", "Kitchen reno"], ["c", "Untitled project"]]);
      assert.equal(items[0].detail, h.hoursText(200, 0));
      assert.equal(items[1].detail, h.hoursText(90, 30));
      const view = h.pickerRows("hours", "", items, {});
      assert.deepEqual(view.rows.map((r) => r.id), ["b", "a", "c"], "the given order, not the most used first");
      assert.deepEqual(view.rows[0], {id: "b", name: "Deck build", detail: h.hoursText(200, 0)});
      assert.deepEqual(h.pickerRows("hours", "RENO kit", items, {}).rows.map((r) => r.id), ["a"]);
      assert.equal(h.pickerRows("hours", "Brand new", items, {}).add, "", "no Add row");
      assert.deepEqual(h.pickerRows("hours", "x", undefined, undefined), {rows: [], more: false, add: ""});
      const many = Array.from({length: 10}, (_, i) => ({id: `p${i}`, name: `Job ${i}`, detail: ""}));
      const long = h.pickerRows("hours", "", many, {});
      assert.equal(long.rows.length, h.PICKER_MAX_ROWS);
      assert.equal(long.more, true);
      assert.deepEqual(h.historyProjectChoices(undefined), []);
    });
  });
  describe("projectFieldView", () => {
    const projects = [{id: "p1", name: "Kitchen reno"}];
    it("shows None while no project is chosen", () => {
      const {projectFieldView} = load();
      for (const value of ["", undefined, null, 5]) assert.deepEqual(projectFieldView(value, "", projects, "Unknown project"), {text: "None", inProject: false});
    });
    it("shows a known project's name", () => {
      assert.deepEqual(load().projectFieldView("p1", "", projects, "Unknown project"), {text: "Kitchen reno", inProject: true});
    });
    it("shows New project: Name for the placeholder id, with the name's blanks collapsed", () => {
      const {projectFieldView, NEW_PROJECT} = load();
      assert.equal(projectFieldView(NEW_PROJECT, "  Deck   build ", projects, "Unknown project").text, "New project: Deck build");
      assert.equal(projectFieldView(NEW_PROJECT, "Deck", [], "x").inProject, true);
      assert.equal(projectFieldView(NEW_PROJECT, undefined, projects, "x").text, "New project", "no name yet");
    });
    it("shows the given label for a project the list does not know", () => {
      const {projectFieldView} = load();
      assert.deepEqual(projectFieldView("gone", "", projects, "Unknown project"), {text: "Unknown project", inProject: true});
      assert.equal(projectFieldView("gone", "", projects, "Deleted project").text, "Deleted project");
      assert.equal(projectFieldView("p1", "", undefined, "Unknown project").text, "Unknown project");
    });
  });
  describe("clientFieldView", () => {
    const clients = [{id: "c1", name: "Smith Ltd"}];
    it("shows None and offers Add to client while no client is chosen", () => {
      const {clientFieldView} = load();
      for (const value of ["", undefined, null, 5]) assert.deepEqual(clientFieldView(value, "", clients), {text: "None", hasClient: false, toggle: "Add to client"});
    });
    it("shows a known client's name and offers Remove from client", () => {
      assert.deepEqual(load().clientFieldView("c1", "", clients), {text: "Smith Ltd", hasClient: true, toggle: "Remove from client"});
    });
    it("shows New client: Name for the placeholder id, with the name's blanks collapsed", () => {
      const {clientFieldView, NEW_CLIENT} = load();
      assert.equal(clientFieldView(NEW_CLIENT, "  Jo   Smith ", clients).text, "New client: Jo Smith");
      assert.equal(clientFieldView(NEW_CLIENT, "Jo", []).toggle, "Remove from client");
      assert.equal(clientFieldView(NEW_CLIENT, undefined, clients).text, "New client", "no name yet");
      assert.equal(clientFieldView(NEW_CLIENT, "   ", clients).text, "New client", "a blank name is no name");
    });
    it("shows Unknown client for an id the list does not know", () => {
      const {clientFieldView} = load();
      assert.deepEqual(clientFieldView("gone", "", clients), {text: "Unknown client", hasClient: true, toggle: "Remove from client"});
      assert.equal(clientFieldView("c1", "", undefined).text, "Unknown client");
      assert.equal(clientFieldView("c1", "", [null, {id: "c1"}]).text, "Unknown client", "a client with no name");
    });
  });
  describe("the project picker modal and the Project field", () => {
    const at = (needle, from = 0) => {
      const i = html.indexOf(needle, from);
      assert.ok(i >= 0, `${needle} is on the page`);
      return i;
    };
    it("has one picker dialog with a search bar (combobox) and a list (listbox), above the edit modals", () => {
      const modal = at("id=\"pickerModal\"");
      assert.ok(modal > at("id=\"editModal\"") && modal > at("id=\"completedEditModal\""), "later in the page, so it stacks over the forms that open it");
      assert.ok(modal < at("id=\"confirmModal\""), "and under the question dialog");
      const card = html.slice(modal, at("id=\"confirmModal\""));
      assert.match(card, /<input type="text" id="pickerSearch"[^>]*role="combobox"[^>]*aria-controls="pickerList"/);
      assert.match(card, /<div id="pickerList"[^>]*role="listbox"/);
      assert.match(card, /role="dialog" aria-modal="true" aria-labelledby="pickerTitle"/);
      assert.match(html, /showLayer\("pickerModal", closePicker\)/);
    });
    it("adds a None row only while the search is blank, and places the overlay in the visible screen", () => {
      const {withNoneRow, pickerViewportBox} = load();
      const rows = [{id: "a", name: "A", detail: ""}];
      assert.deepEqual(withNoneRow(rows, "No client", "").map((r) => r.id), ["", "a"]);
      assert.equal(withNoneRow(rows, "No client", "  ")[0].name, "No client");
      assert.deepEqual(withNoneRow(rows, "No client", "a"), rows, "a search shows only matches");
      assert.deepEqual(withNoneRow(rows, "", ""), rows, "no label, no None row");
      assert.deepEqual(withNoneRow(rows, "All", "", 7)[0], {id: "", name: "All", detail: "7"}, "the leading row can carry a detail");
      assert.deepEqual(withNoneRow(rows, "All", "")[0], {id: "", name: "All", detail: ""});
      assert.deepEqual(withNoneRow(rows, "All", "a", 7), rows, "a search drops it, detail or not");
      assert.deepEqual(pickerViewportBox({offsetTop: 0, height: 412.6}), {top: 0, height: 413});
      assert.deepEqual(pickerViewportBox({offsetTop: -3, height: 300}), {top: 0, height: 300});
      assert.equal(pickerViewportBox(null), null);
      assert.equal(pickerViewportBox({height: 0}), null);
      assert.match(html, /#pickerModal \{ align-items: flex-start;/);
    });
    it("styles Link boxes like the other fields and draws the picker's list like the Queue's", () => {
      assert.match(html, /input\[type="email"\], input\[type="url"\], select \{ padding: 10px 12px/);
      assert.match(html, /input\[type="text"\], input\[type="url"\] \{ flex: 1; min-width: 0; \}/);
      assert.match(html, /<div id="pickerList" class="project-list"/);
      assert.doesNotMatch(html, /picker-list|picker-note/);
    });
    it("lists clients as tappable rows with Delete only in the form", () => {
      assert.match(html, /<div id="clientList" class="project-list"/);
      assert.match(html, /id="deleteClientBtn" class="btn-danger"[^>]*hidden>Delete client</);
      const render = html.slice(html.indexOf("function renderClients()"), html.indexOf("const clientForms = {}"));
      assert.match(render, /class="project-item/);
      assert.doesNotMatch(render, /data-action|btn-danger|<button/);
    });
    it("draws rows as options, the same size as the Queue filter's, from existing colour variables only", () => {
      assert.doesNotMatch(html, /\.picker-row \{/);
      assert.match(html, /role="option" id="pickerOpt\$\{i\}"/);
      assert.match(html, /aria-activedescendant/);
      assert.match(html, /\.picker-field \{[^}]*min-height: 44px/);
      assert.match(html, /\.picker-toggle \{ min-height: 44px; \}/);
    });
    it("keeps the hidden input, the field button and the Order number in every form, with no toggle", () => {
      for (const prefix of ["manual", "edit", "ce"]) {
        assert.ok(html.includes(`<input type="hidden" id="${prefix}Project" value="">`), `${prefix} hidden input`);
        assert.match(html, new RegExp(`<button type="button" id="${prefix}ProjectField" class="picker-field"[^>]*onclick="openProjectPicker\\('${prefix}'\\)"[^>]*disabled>None</button>`));
        assert.doesNotMatch(html, new RegExp(`${prefix}ProjectToggle`), `${prefix} has no toggle`);
        assert.match(html, new RegExp(`id="${prefix}ProjectRow">`), `${prefix} field row is always shown`);
        assert.equal(html.split(`id="${prefix}Project"`).length - 1, 1, `${prefix}Project is made once`);
      }
      for (const prefix of ["manual", "edit"]) {
        assert.ok(html.includes(`<input type="hidden" id="${prefix}NewProject" value="">`), `${prefix} new project name`);
        assert.ok(at(`id="${prefix}ProjectOrder"`) > at(`id="${prefix}ProjectField"`) && at(`id="${prefix}ProjectOrder"`) < at(`id="${prefix}NewProject"`), `${prefix} Order sits beside the field`);
      }
      assert.doesNotMatch(html, /<select id="(manual|edit|ce)Project"/, "no select is left");
    });
    it("leaves the Add row out of the completed form's picker", () => {
      assert.match(html, /\}, \{ opener: document\.getElementById\(`\$\{prefix\}ProjectField`\), allowAdd: prefix !== "ce", noneLabel: "None" \}\);/);
      const open = html.slice(at("function openPicker("), at("function closePicker()"));
      assert.match(open, /allowAdd: options\.allowAdd !== false/);
      const render = html.slice(at("function renderPicker()"), at("function pickerTyped()"));
      assert.match(render, /state\.add = state\.allowAdd \? view\.add : ""/);
    });
    it("assigns a form's project only through setProjectField, never the hidden input's value", () => {
      assert.doesNotMatch(html, /getElementById\("(manual|edit|ce)Project"\)\.value = /);
      assert.doesNotMatch(html, /getElementById\("(manual|edit)NewProject"\)\.value = /);
      const setter = html.slice(at("function setProjectField("), at("function openProjectPicker("));
      assert.match(setter, /getElementById\(`\$\{prefix\}Project`\)\.value = value/);
      assert.match(setter, /updateProjectOrderField\(prefix\)/);
      for (const call of ["setProjectField(\"manual\", projectsLoaded ? v.projectId : \"\")", "setProjectField(\"manual\", \"\")", "setProjectField(\"edit\", task.projectId || \"\")", "setProjectField(\"ce\", values.projectId)"]) assert.ok(html.includes(call), call);
    });
    it("picks None in the picker to clear the choice and the Order number, with no Remove button", () => {
      assert.doesNotMatch(html, /toggleProjectField|Remove from project|Add to project<\/button>/);
      const order = html.slice(at("function updateProjectOrderField("), at("// The Client choice under a new project's name"));
      assert.match(order, /if \(!inProject\) input\.value = "";/);
      assert.match(order, /renderProjectField\(prefix\);\s*syncNewProjectClient\(prefix\);\s*refreshContact\(prefix\);/);
    });
    it("keeps the button disabled until getProjects has answered, the completed form's also with its saved copy on screen", () => {
      const locked = html.slice(at("function projectFieldLocked("), at("// Shows the hidden input's choice"));
      assert.match(locked, /!projectsLoaded \|\| \(prefix === "ce" && completedFieldDisabled\("projectId", completedFormLimited\(\)\)\)/);
      assert.match(html, /function renderProjects\(\) \{\s*if \(!projectsLoaded\) return;\s*renderManualProjects\(\);\s*renderProjectFields\(\);/);
      const {COMPLETED_FORM_CONTROLS, completedFieldDisabled} = load();
      for (const id of ["ceProject", "ceProjectField"]) {
        assert.equal(COMPLETED_FORM_CONTROLS[id], "projectId", id);
        assert.equal(completedFieldDisabled(COMPLETED_FORM_CONTROLS[id], true), true, `${id} needs a connection`);
        assert.equal(completedFieldDisabled(COMPLETED_FORM_CONTROLS[id], false), false, id);
      }
    });
    it("shows a project the page does not know as Unknown project, or Deleted project in the completed form", () => {
      const render = html.slice(at("function renderProjectField("), at("function renderProjectFields()"));
      assert.match(render, /prefix === "ce" \? "Deleted project" : "Unknown project"/);
      assert.match(render, /const orderBox = document\.getElementById\(`\$\{prefix\}ProjectOrder`\);\s*[^\n]*\n\s*if \(orderBox\) orderBox\.hidden = !view\.inProject/);
      assert.doesNotMatch(html, /id="ceProjectOrder"/, "the completed form has no Order number, so renderProjectField must tolerate its absence");
    });
    it("picks a row or the Add row by tap or Enter and gives the focus back on closing", () => {
      assert.match(html, /const pick = row\.dataset\.add \? pickerPickAt\(pickerState\.rows\.length\) : \{ id: row\.dataset\.id \};/);
      assert.match(html, /e\.key === "Enter"\) \{\s*e\.preventDefault\(\);\s*const pick = pickerPickAt\(state\.active\);/);
      assert.match(html, /e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*closePicker\(\);/);
      const close = html.slice(at("function closePicker()"), at("function closePickerOnOverlay"));
      assert.match(close, /hideLayer\("pickerModal"\)/);
      assert.match(close, /state\.opener\.focus\(/);
      const pickFn = html.slice(at("function pickFromPicker("), at("// The pick for the option at"));
      assert.ok(pickFn.indexOf("closePicker()") < pickFn.indexOf("state.onPick(pick)"), "it closes first, then reports the choice");
    });
    it("sets row text as text: names are escaped", () => {
      const render = html.slice(at("function renderPicker()"), at("function pickerTyped()"));
      assert.match(render, /data-id="\$\{esc\(row\.id\)\}"><span class="project-item-name">\$\{esc\(row\.name\)\}<\/span>/);
      assert.match(render, /esc\(text\.add\(state\.add\)\)/);
      assert.match(render, /esc\(row\.detail\)/);
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
    it("matches any of several tags (OR), and an empty list means no tag filter", () => {
      const h = load();
      assert.deepEqual(ids(h.filterTasks(tasks, ["Garden", "Indoor"], null)), ["b", "c"]);
      assert.deepEqual(ids(h.filterTasks(tasks, ["Outdoor", "Garden"], null)), ["a", "b"]);
      assert.deepEqual(ids(h.filterTasks(tasks, ["Outdoor", "Indoor"], "p1")), ["a", "c"]);
      assert.deepEqual(ids(h.filterTasks(tasks, [], null)), ["a", "b", "c", "d", "e"]);
    });
    it("toggles a tag in and out of the tag filter without changing the old list", () => {
      const h = load();
      const one = h.toggleTagFilter([], "Outdoor");
      assert.deepEqual(one, ["Outdoor"]);
      const two = h.toggleTagFilter(one, "Garden");
      assert.deepEqual(two, ["Outdoor", "Garden"]);
      assert.deepEqual(h.toggleTagFilter(two, "Outdoor"), ["Garden"]);
      assert.deepEqual(one, ["Outdoor"]);
    });
    it("drops chosen tags no task carries any more", () => {
      assert.deepEqual(load().pruneTagFilter(["Outdoor", "Gone"], tasks), ["Outdoor"]);
      assert.deepEqual(load().pruneTagFilter([], tasks), []);
    });
    it("labels the filter in the Tags heading", () => {
      const h = load();
      assert.equal(h.tagFilterLabel([]), "");
      assert.equal(h.tagFilterLabel(["Outdoor"]), "· Outdoor");
      assert.equal(h.tagFilterLabel(["Outdoor", "Garden"]), "· Outdoor, Garden");
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
      assert.deepEqual(cards.map((m) => m[2]), ["Scheduling", "Job Sheets", "Clients", "Appearance", "Notifications", "Backup", "Tidy up", "Stats"]);
      assert.ok(cards.every((m) => !/\bopen\b/.test(m[1])), "no card starts open");
    });
    it("leaves no plain card on the Settings page and balances the tags", () => {
      assert.doesNotMatch(page, /<div class="card"/);
      assert.equal((page.match(/<details\b/g) || []).length, 8);
      assert.equal((page.match(/<\/details>/g) || []).length, 8);
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

  describe("add card: due date Clear and sections opened for a copied task", () => {
    it("puts a Clear button beside the due date that empties it", () => {
      const box = html.indexOf(`id="manualDue"`);
      const row = html.slice(html.lastIndexOf("<div", box), html.indexOf("</div>", box));
      assert.match(row, /id="clearManualDueBtn"/);
      assert.match(row, /onclick="clearManualDueDate\(\)"/);
      assert.match(html, /function clearManualDueDate\(\) \{\s*document\.getElementById\("manualDue"\)\.value = "";/);
    });
    it("manualSectionsToOpen opens nothing for a bare task", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "Mow lawn", priority: "HIGH", estimatedMinutes: 45})), []);
      for (const bad of [undefined, null, 5, "x", []]) assert.deepEqual(manualSectionsToOpen(bad), [], String(bad));
    });
    it("opens Scheduling only for Repeats, not for priority or estimate", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", priority: "LOW", estimatedMinutes: 90})), []);
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", recurrence: {frequency: "WEEKLY", interval: 2}})), ["manualScheduling"]);
    });
    it("opens Contact details for a phone, email, link or location, each on its own", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      for (const extra of [{phone: "021 555 1234"}, {email: "mo@example.com"}, {url: "https://example.com/menu"}, {location: {name: "12 Beach Rd, Orewa"}}]) {
        assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", ...extra})), ["manualContact"], JSON.stringify(extra));
      }
      assert.deepEqual(manualSectionsToOpen({phone: "   ", email: "", url: "", location: {name: " "}}), []);
    });
    it("opens Audit trail for travel or materials", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", travelKm: 12.5})), ["manualAudit"]);
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", materials: [{id: "m1", text: "Paint", checked: true}]})), ["manualAudit"]);
      assert.deepEqual(manualSectionsToOpen(templateFormValues({title: "T", travelKm: 0, materials: []})), []);
    });
    it("lists every section that has a value, in page order", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      const values = templateFormValues({title: "T", recurrence: {frequency: "DAILY", interval: 1}, phone: "021 1", travelKm: 3, materials: [{id: "m", text: "Tape"}]});
      assert.deepEqual(manualSectionsToOpen(values), ["manualScheduling", "manualContact", "manualAudit"]);
    });
    it("names real sections, and useTemplate opens them after showManualFields has closed them all", () => {
      const {manualSectionsToOpen, templateFormValues} = load();
      const all = manualSectionsToOpen(templateFormValues({title: "T", recurrence: {frequency: "DAILY"}, email: "a@b.co", travelKm: 1}));
      for (const id of all) assert.ok(html.includes(`<details class="form-section" id="${id}">`), id);
      const fn = html.slice(html.indexOf("function useTemplate"), html.indexOf("function resetManualExtras"));
      assert.ok(fn.indexOf("showManualFields(true)") < fn.indexOf("openFormSection(id)"));
      assert.match(fn, /for \(const id of manualSectionsToOpen\(v\)\) openFormSection\(id\)/);
    });
  });

  describe("task number on the add card", () => {
    const form = {title: "Mow lawn", priority: "HIGH", estimatedMinutes: "45", tags: "", dueDate: ""};
    it("addQueueNumber reads a whole number from 1 and nothing else", () => {
      const {addQueueNumber} = load();
      assert.equal(addQueueNumber("3"), 3);
      assert.equal(addQueueNumber(" 12 "), 12);
      assert.equal(addQueueNumber(1), 1);
      for (const bad of ["", "  ", "0", "-2", "1.5", "abc", "1e", undefined, null, NaN]) assert.equal(addQueueNumber(bad), null, String(bad));
    });
    it("bottomTaskNumber is the last place, or the one after it for a task being added, and never below 1", () => {
      const {bottomTaskNumber} = load();
      assert.equal(bottomTaskNumber(7, false), 7);
      assert.equal(bottomTaskNumber(7, true), 8);
      assert.equal(bottomTaskNumber(0, true), 1);
      assert.equal(bottomTaskNumber(0, false), 1);
      assert.equal(bottomTaskNumber(undefined, true), 1);
    });
    it("manualTaskBody sends queueNumber only when the box holds a usable number", () => {
      const {manualTaskBody} = load();
      assert.equal(manualTaskBody({...form, queueNumber: "1"}).manual.queueNumber, 1);
      assert.equal(manualTaskBody({...form, queueNumber: "8"}).manual.queueNumber, 8);
      for (const empty of [undefined, "", "0", "x"]) assert.equal("queueNumber" in manualTaskBody({...form, queueNumber: empty}).manual, false, String(empty));
    });
    it("travels with an add held for later", () => {
      const {makeQueuedAdd, manualTaskBody} = load();
      const item = makeQueuedAdd({kind: "MANUAL", body: manualTaskBody({...form, queueNumber: "1"}), now: "2026-10-28T00:00:00.000Z", requestId: "req-00000001"});
      assert.equal(item.body.manual.queueNumber, 1);
    });
    it("is turned into a rank by the server-side change builder", () => {
      const {manualTaskChange} = require("../tasks");
      assert.equal(manualTaskChange(load().manualTaskBody({...form, queueNumber: "1"}).manual).order, 1);
      assert.equal("order" in manualTaskChange(load().manualTaskBody(form).manual), false);
    });
    it("puts the box with Top and Bottom first in the add card's Scheduling section and sends and clears it", () => {
      const start = html.indexOf(`id="manualScheduling"`);
      const end = html.indexOf("</details>", start);
      const box = html.indexOf(`id="manualNumber"`);
      assert.ok(box > start && box < end);
      assert.ok(box < html.indexOf(`id="manualPriority"`), "before Priority");
      assert.match(html.slice(box, end), /fillTaskNumber\('manual', 'top'\)[^]*fillTaskNumber\('manual', 'bottom'\)/);
      assert.match(html, /queueNumber: document\.getElementById\("manualNumber"\)\.value/);
      const reset = html.slice(html.indexOf("function resetManualExtras"), html.indexOf("function renderManualProjects"));
      assert.match(reset, /getElementById\("manualNumber"\)\.value = ""/);
    });
    it("fills the box through fillTaskNumber: Top types 1, Bottom the list length (edit) or one more (add)", () => {
      const fn = html.slice(html.indexOf("function fillTaskNumber"), html.indexOf("function clearEditDueDate"));
      assert.match(fn, /position === "top" \? 1 : bottomTaskNumber\(allTasks\.length, prefix === "manual"\)/);
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
      assert.match(html, /setProjectField\(prefix, NEW_PROJECT, \{ newName: pick\.name \}\)/);
      const finish = html.slice(html.indexOf("function finishAdd"), html.indexOf("The project suggestion dialog"));
      assert.match(finish, /manualToggle"\)\.checked = false/);
      assert.match(finish, /showManualFields\(false\)/);
      assert.match(finish, /data\.project && data\.projects/);
    });
  });

  describe("a new project's client", () => {
    const form = {title: "Tile floor", priority: "MEDIUM", estimatedMinutes: "60", tags: "", dueDate: "", newProjectName: "Bathroom reno", projectOrder: "1"};
    const jo = {name: "Jo Smith", phone: "", email: "jo@example.com", hourlyRate: "", useWhatsApp: false, location: null, url: ""};
    it("newProjectClientFields gives the whole client, a stored client's id or nothing, and the whole client wins", () => {
      const {newProjectClientFields, NEW_CLIENT} = load();
      assert.deepEqual(newProjectClientFields("", jo), {newClient: jo});
      assert.deepEqual(newProjectClientFields("c1", jo), {newClient: jo});
      assert.deepEqual(newProjectClientFields(" c1 ", null), {newProjectClientId: "c1"});
      for (const id of ["", "  ", null, undefined, 5, NEW_CLIENT]) assert.deepEqual(newProjectClientFields(id, null), {}, String(id));
      for (const bad of ["Jo", 5, [jo], true]) assert.deepEqual(newProjectClientFields("", bad), {}, JSON.stringify(bad));
    });
    it("manualTaskBody sends a stored client's id with a new project, and none without a client", () => {
      const {manual} = load().manualTaskBody({...form, newProjectClientId: "c1"});
      assert.equal(manual.newProject, "Bathroom reno");
      assert.equal(manual.newProjectClientId, "c1");
      assert.equal("newClient" in manual, false);
      const bare = load().manualTaskBody({...form, newProjectClientId: ""}).manual;
      assert.equal("newProjectClientId" in bare, false);
      assert.equal("newClient" in bare, false);
    });
    it("manualTaskBody sends the whole new client, never alongside a client id", () => {
      const {manual} = load().manualTaskBody({...form, newProjectClientId: "c1", newClient: jo});
      assert.deepEqual(manual.newClient, jo);
      assert.equal("newProjectClientId" in manual, false);
    });
    it("manualTaskBody drops a client when no project is made now", () => {
      for (const extra of [{newProjectName: "  "}, {newProjectName: "", projectId: "p1"}]) {
        const {manual} = load().manualTaskBody({...form, ...extra, newProjectClientId: "c1", newClient: jo});
        assert.equal("newProjectClientId" in manual, false);
        assert.equal("newClient" in manual, false);
      }
    });
    it("is accepted by the server: the project and the client are made together and linked", () => {
      const {withNewProject} = require("../projects");
      const {manualTaskChange} = require("../tasks");
      const make = (() => {
        let n = 0;
        return () => `id-${++n}`;
      })();
      const {manual} = load().manualTaskBody({...form, newClient: jo});
      const made = withNewProject([], [manualTaskChange(manual)], manual.newProject, make, [], {newProjectClientId: manual.newProjectClientId, newClient: manual.newClient});
      assert.equal(made.error, undefined);
      assert.equal(made.clientCreated, true);
      assert.equal(made.client.name, "Jo Smith");
      assert.equal(made.project.clientId, made.client.id);
      assert.equal(made.changes[0].projectId, made.project.id);
      const stored = withNewProject([], [manualTaskChange(load().manualTaskBody({...form, newProjectClientId: "c1"}).manual)], "Bathroom reno", make, [{id: "c1", name: "Smith Ltd"}], {newProjectClientId: "c1"});
      assert.equal(stored.project.clientId, "c1");
      assert.equal(stored.clientCreated, false);
    });
    it("newClientWarning wants a name, then a usable email, link and rate", () => {
      const {newClientWarning, NEW_CLIENT_NAME_WARNING, INVALID_EMAIL, INVALID_URL, INVALID_RATE} = load();
      assert.equal(newClientWarning(jo), "");
      for (const name of ["", "   ", undefined, null]) assert.equal(newClientWarning({...jo, name}), NEW_CLIENT_NAME_WARNING, String(name));
      assert.equal(newClientWarning(null), NEW_CLIENT_NAME_WARNING);
      assert.equal(newClientWarning({...jo, email: "jo@"}), INVALID_EMAIL);
      assert.equal(newClientWarning({...jo, url: "javascript:alert(1)"}), INVALID_URL);
      assert.equal(newClientWarning({...jo, hourlyRate: "12.345"}), INVALID_RATE);
      assert.equal(newClientWarning({...jo, hourlyRate: "20000"}), INVALID_RATE);
      assert.equal(newClientWarning({...jo, hourlyRate: "85.00", url: "example.com/job"}), "");
    });
    it("an add that makes a project or a client cannot wait for a connection", () => {
      const {serverOnlyAddFields, serverOnlyAddText, manualTaskBody, freeTextBody} = load();
      assert.deepEqual(serverOnlyAddFields(manualTaskBody(form)), ["newProject"]);
      assert.deepEqual(serverOnlyAddFields(manualTaskBody({...form, newProjectClientId: "c1"})), ["newProject"]);
      assert.deepEqual(serverOnlyAddFields(manualTaskBody({...form, newClient: jo})), ["newProject", "newClient"]);
      assert.deepEqual(serverOnlyAddFields(manualTaskBody({...form, newProjectName: "", projectId: "p1"})), []);
      assert.deepEqual(serverOnlyAddFields(freeTextBody("Mow the lawn")), []);
      for (const body of [null, undefined, {}, {manual: null}, {manual: {title: "x", newProject: "  "}}, "x"]) assert.deepEqual(serverOnlyAddFields(body), [], JSON.stringify(body));
      assert.match(serverOnlyAddText(["newProject"]), /^A new project can only be made with a connection, so nothing was added\./);
      assert.match(serverOnlyAddText(["newProject", "newClient"]), /^A new project and client can only be made/);
    });
    it("the add card and the edit modal hold the Client field, its toggle and the client form", () => {
      for (const prefix of ["manual", "edit"]) {
        assert.ok(html.includes(`id="${prefix}NewProjectClient"`), prefix);
        assert.ok(html.includes(`<input type="hidden" id="${prefix}ClientChoice" value="">`), `${prefix} hidden input`);
        assert.ok(html.includes(`id="${prefix}ClientFormMount"`), prefix);
        assert.match(html, new RegExp(`<button type="button" id="${prefix}ClientField" class="picker-field"[^>]*onclick="openClientPicker\\('${prefix}'\\)"[^>]*>None</button>`), `${prefix} field button`);
        assert.match(html, new RegExp(`<button type="button" id="${prefix}ClientToggle"[^>]*onclick="toggleClientField\\('${prefix}'\\)"[^>]*>Add to client</button>`), `${prefix} toggle`);
        assert.match(html, new RegExp(`id="${prefix}ClientRow" hidden`), `${prefix} field row starts hidden`);
        assert.ok(html.includes(`mountClientForm("${prefix}Client", "${prefix}ClientFormMount", { nameRow: false })`), `${prefix}: the form's Name row is hidden`);
        const nameAt = html.indexOf(`id="${prefix}NewProject"`);
        assert.ok(nameAt > 0 && html.indexOf(`id="${prefix}NewProjectClient"`) > nameAt, `${prefix}: the client choice sits under the new project's name`);
        assert.ok(html.indexOf(`id="${prefix}ClientField"`) < html.indexOf(`id="${prefix}ClientToggle"`) && html.indexOf(`id="${prefix}ClientToggle"`) < html.indexOf(`id="${prefix}ClientFormMount"`), `${prefix}: field, toggle, then the form`);
      }
      assert.doesNotMatch(html, /<select id="(manual|edit)ClientChoice"/, "no select is left");
      assert.doesNotMatch(html, /new Option\("＋ New client…", NEW_CLIENT\)/, "the select's options are gone");
    });
    it("the client form keeps its Name box but hides its row only where the picker names the client", () => {
      const {clientFormHtml} = load();
      const hiddenCount = (markup) => [...markup.matchAll(/ hidden>/g)].length; // the Clear position button is always hidden to start with
      for (const markup of [clientFormHtml("client"), clientFormHtml("projectClient", {}), clientFormHtml("projectClient", null), clientFormHtml("projectClient", {nameRow: true})]) {
        assert.equal(hiddenCount(markup), 1, "the Name row shows");
        assert.match(markup, /<div class="form-group" style="margin:0;">\s*<label for="\w+Name">Name<\/label>/);
      }
      const hidden = clientFormHtml("editClient", {nameRow: false});
      assert.match(hidden, /<div class="form-group" style="margin:0;" hidden>\s*<label for="editClientName">Name<\/label>\s*<input type="text" id="editClientName" maxlength="100"/);
      assert.equal(hiddenCount(hidden), 2, "the Name row, and the Clear position button that was already hidden");
      assert.equal([...hidden.matchAll(/id="([^"]+)"/g)].length, 12, "the same boxes either way");
      assert.match(html, /function mountClientForm\(prefix, containerId, options\) \{\s*document\.getElementById\(containerId\)\.innerHTML = clientFormHtml\(prefix, options\);/);
    });
    it("the Client field follows the picker modal's client kind and the Project field's toggle", () => {
      const open = html.slice(html.indexOf("function openClientPicker("), html.indexOf("function toggleClientField("));
      assert.match(open, /openPicker\("client", document\.getElementById\(`\$\{prefix\}ClientChoice`\)\.value,/);
      assert.match(open, /pick\.name !== undefined\) setClientField\(prefix, NEW_CLIENT, \{ newName: pick\.name \}\);\s*else setClientField\(prefix, pick\.id\);/);
      assert.match(open, /\{ opener \}\);/, "the Add row stays on: a client can be made");
      assert.doesNotMatch(open, /allowAdd/);
      const toggle = html.slice(html.indexOf("function toggleClientField("), html.indexOf("// The place last picked"));
      assert.match(toggle, /=== ""\) openClientPicker\(prefix, document\.getElementById\(`\$\{prefix\}ClientToggle`\)\);\s*else setClientField\(prefix, ""\);/);
    });
    it("the Add row's name goes in the form's Name box and the field reads it; any other choice empties the form", () => {
      const set = html.slice(html.indexOf("function setClientField("), html.indexOf("// Opens the picker for a form's client"));
      assert.match(set, /getElementById\(`\$\{prefix\}ClientChoice`\)\.value = value;/);
      assert.match(set, /if \(value === NEW_CLIENT\) document\.getElementById\(`\$\{prefix\}ClientName`\)\.value = newName;\s*updateNewClientForm\(prefix\);/);
      const render = html.slice(html.indexOf("function renderClientField("), html.indexOf("// Sets a form's client choice"));
      assert.match(render, /clientFieldView\(choice\.value, nameBox \? nameBox\.value : "", allClients\)/);
      assert.match(render, /ClientRow`\)\.hidden = !view\.hasClient/);
      assert.match(render, /ClientToggle`\)\.textContent = view\.toggle/);
      const update = html.slice(html.indexOf("function updateNewClientForm"), html.indexOf("function renderNewClientChoices"));
      assert.match(update, /renderClientField\(prefix\)/);
    });
    it("assigns a form's client only through setClientField, apart from the two resets", () => {
      const assigns = [...html.matchAll(/getElementById\(`\$\{prefix\}ClientChoice`\)\.value = [^;]+;/g)].map((m) => m[0]);
      assert.deepEqual(assigns.sort(), ["getElementById(`${prefix}ClientChoice`).value = \"\";", "getElementById(`${prefix}ClientChoice`).value = value;"], "the reset under syncNewProjectClient and setClientField");
      assert.doesNotMatch(html, /getElementById\("(manual|edit)ClientChoice"\)\.value = /);
      const refresh = html.slice(html.indexOf("function renderNewClientChoices"), html.indexOf("function renderClientField"));
      assert.match(refresh, /choice\.value !== NEW_CLIENT && !allClients\.some\(c => c\.id === choice\.value\)\) choice\.value = "";\s*syncNewProjectClient\(prefix\);/, "a client that is gone is dropped");
    });
    it("the client form's ids do not collide with the other boxes of either form", () => {
      const {clientFormHtml} = load();
      const ids = [...clientFormHtml("manualClient").matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(ids.length, 12);
      for (const id of ids) assert.ok(id.startsWith("manualClient"), id);
      for (const id of [...ids, ...[...clientFormHtml("editClient").matchAll(/id="([^"]+)"/g)].map((m) => m[1])]) {
        assert.equal(html.split(`id="${id}"`).length - 1, 0, `${id} is only made by clientFormHtml`);
      }
      for (const id of ["manualClientChoice", "manualClientFormMount", "editClientChoice", "editClientFormMount", "manualNewProjectClient", "editNewProjectClient", "manualClientLabel", "editClientLabel", "manualClientRow", "editClientRow", "manualClientField", "editClientField", "manualClientToggle", "editClientToggle"]) {
        assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
        assert.ok(![...ids].includes(id), id);
      }
    });
    it("Add and Save check the new client before sending, and the responses' clients refresh every client view", () => {
      const submit = html.slice(html.indexOf("async function submitTask"), html.indexOf("// Shows what an add returned"));
      assert.match(submit, /newProjectClientPick\("manual"\)/);
      assert.match(submit, /newProjectClientId: clientPick\.clientId/);
      assert.match(submit, /serverOnlyAddFields\(body\)/);
      assert.ok(submit.indexOf("clientPick.warning") < submit.indexOf("setLoading(true)"), "a warning stops before anything is sent");
      assert.ok(submit.indexOf("serverOnlyAddFields") < submit.indexOf("queueFailedAdd"), "an add that needs the server is refused before it is kept");
      const save = html.slice(html.indexOf("async function saveTaskEdits"), html.indexOf("// Brings the edit form back"));
      assert.match(save, /newProjectClientPick\("edit"\)/);
      assert.match(save, /newProjectClientFields\(clientPick\.clientId, clientPick\.client\)/);
      assert.match(save, /takeClients\(data\)/);
      const finish = html.slice(html.indexOf("function finishAdd"), html.indexOf("// Clears the add card"));
      assert.match(finish, /takeClients\(data\)/);
      const take = html.slice(html.indexOf("function takeClients"), html.indexOf("// The place last picked"));
      assert.match(take, /allClients = data\.clients/);
      assert.match(take, /refreshClientViews\(\)/);
      const refresh = html.slice(html.indexOf("function refreshClientViews"), html.indexOf("async function loadClients"));
      assert.match(refresh, /renderNewClientChoices\(\)/);
    });
    it("leaving New project empties the client choice and its form", () => {
      const field = html.slice(html.indexOf("function updateProjectOrderField"), html.indexOf("function syncNewProjectClient"));
      assert.match(field, /syncNewProjectClient\(prefix\)/);
      const sync = html.slice(html.indexOf("function syncNewProjectClient"), html.indexOf("function renderNewClientChoices"));
      assert.match(sync, /clientsLoaded && document\.getElementById\(`\$\{prefix\}Project`\)\.value === NEW_PROJECT/);
      assert.match(sync, /ClientChoice`\)\.value = ""/);
      assert.match(sync, /updateNewClientForm\(prefix\)/);
      const update = html.slice(html.indexOf("function updateNewClientForm"), html.indexOf("function renderNewClientChoices"));
      assert.match(update, /fillClientFormBlock\(`\$\{prefix\}Client`, null\)/);
    });
  });

  describe("the Clients card search and Add", () => {
    const clients = [
      {id: "c1", name: "Smith Ltd", phone: "09 555 0000", email: "office@smith.example", location: {name: "Orewa"}},
      {id: "c2", name: "Bare"},
      {id: "c3", name: "Jo Bloggs", location: {name: "Albany"}},
    ];
    const projects = [{id: "p1", name: "Kitchen reno", clientId: "c1"}, {id: "p2", name: "Deck", clientId: "c1"}, {id: "p3", name: "Shed", clientId: "c3"}, {id: "p4", name: "Own"}];
    it("clientSearchText joins the name, location, phone, email and the names of the client's projects", () => {
      const {clientSearchText} = load();
      assert.equal(clientSearchText(clients[0], projects), "Smith Ltd Orewa 09 555 0000 office@smith.example Kitchen reno Deck");
      assert.equal(clientSearchText(clients[1], projects), "Bare");
      assert.equal(clientSearchText(clients[2], projects), "Jo Bloggs Albany Shed");
      assert.equal(clientSearchText({id: "c9", name: " Pad "}, undefined), "Pad");
      for (const bad of [null, undefined, 5, {}]) assert.equal(clientSearchText(bad, projects), "", String(bad));
    });
    it("filterClients keeps a client when every word is in its search text, case ignored", () => {
      const {filterClients} = load();
      const names = (q) => filterClients(clients, projects, q).map((c) => c.name);
      assert.deepEqual(names("smith"), ["Smith Ltd"]);
      assert.deepEqual(names("DECK orewa"), ["Smith Ltd"], "a project name and a location, in any order");
      assert.deepEqual(names("shed"), ["Jo Bloggs"], "by a project's name");
      assert.deepEqual(names("555"), ["Smith Ltd"], "by phone");
      assert.deepEqual(names("office@"), ["Smith Ltd"], "by email");
      assert.deepEqual(names("smith bloggs"), [], "every word must match");
      assert.deepEqual(names("own"), [], "a project with no client belongs to nobody");
    });
    it("filterClients keeps every client for a blank query and does not change its inputs", () => {
      const {filterClients} = load();
      for (const q of ["", "   ", undefined, null]) assert.equal(filterClients(clients, projects, q).length, 3, String(q));
      const before = JSON.stringify([clients, projects]);
      filterClients(clients, projects, "smith");
      assert.equal(JSON.stringify([clients, projects]), before);
      assert.deepEqual(filterClients(undefined, projects, "x"), []);
      assert.equal(filterClients(clients, undefined, "smith").length, 1);
    });
    it("has the search field and Add button above the list, wired like the Projects field", () => {
      const field = html.indexOf("id=\"newClientName\"");
      assert.ok(field > html.indexOf("<h3>Clients</h3>") && field < html.indexOf("id=\"clientList\""), "above the list");
      assert.match(html, /<div class="input-row project-add">\s*<input type="text" id="newClientName" maxlength="100" placeholder="Search clients or projects, or type a new client name" aria-label="[^"]+">\s*<button type="button" id="addClientBtn">Add<\/button>/);
      assert.match(html, /getElementById\("addClientBtn"\)\.addEventListener\("click", addClient\)/);
      assert.match(html, /getElementById\("newClientName"\)\.addEventListener\("input", renderClients\)/);
      assert.match(html, /getElementById\("newClientName"\)\.addEventListener\("keydown", e => \{\s*if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); addClient\(\); \}/);
    });
    it("narrows the list live and says when nothing matches or nothing exists yet", () => {
      const render = html.slice(html.indexOf("function renderClients()"), html.indexOf("// Each Clients form block"));
      assert.match(render, /filterClients\(allClients, allProjects, document\.getElementById\("newClientName"\)\.value\)/);
      assert.match(render, /No clients yet\./);
      assert.match(render, /No clients match the search\./);
      assert.ok(render.indexOf("No clients yet.") < render.indexOf("No clients match the search."), "an empty list is not a failed search");
    });
    it("Add opens the form for a new client named by the typed text and saves nothing", () => {
      const add = html.slice(html.indexOf("function addClient()"), html.indexOf("async function deleteClient"));
      assert.doesNotMatch(add, /saveClientRequest|apiFetch|async/, "nothing is sent");
      assert.match(add, /\.value\.replace\(\/\\s\+\/g, " "\)\.trim\(\);\s*if \(!name\) return;/, "an empty field does nothing");
      assert.match(add, /fillClientForm\(null, \{ name \}\);/);
      assert.match(add, /already exists/);
      assert.ok(add.indexOf("already exists") < add.indexOf("fillClientForm(null, { name })"), "a name in use opens nothing");
      assert.doesNotMatch(add, /newClientName"\)\.value = ""/, "the search text stays until the client is saved");
    });
    it("Save client creates a new client when none is being edited, then closes the form and ends the search", () => {
      const save = html.slice(html.indexOf("async function saveClient()"), html.indexOf("// Add: opens the form"));
      assert.match(save, /editing \? \{ action: "UPDATE", clientId: editing, client \} : \{ action: "CREATE", client \}/);
      assert.ok(save.indexOf("saveClientRequest(") < save.indexOf("fillClientForm(null)"), "the form stays open when the server refuses (a taken name)");
      assert.match(save, /if \(!editing\) \{\s*document\.getElementById\("newClientName"\)\.value = "";[^\n]*\s*renderClients\(\);/);
    });
    it("shows the Clients form only for a draft or an edit, always as Save client", () => {
      assert.match(html, /<div id="clientEdit" hidden>\s*<div id="clientFormMount"/);
      const edit = html.slice(html.indexOf("<div id=\"clientEdit\" hidden>"), html.indexOf("id=\"clientsStatus\""));
      assert.match(edit, /id="saveClientBtn">Save client<\/button>/);
      assert.match(edit, /id="cancelClientBtn" class="btn-secondary">Cancel<\/button>/);
      const fill = html.slice(html.indexOf("function fillClientForm("), html.indexOf("// Everything that shows client names follows a change to the list."));
      assert.match(fill, /editingClientId = client \? client\.id : null;/, "a draft is not an edit");
      assert.match(fill, /getElementById\("clientEdit"\)\.hidden = !client && !draft;/);
      assert.doesNotMatch(fill, /saveClientBtn|cancelClientBtn/, "the buttons never change");
    });
    it("the server accepts a name-only client, which is all a draft holds", () => {
      const {clientFormBody} = load();
      const made = require("../clients").addClient([], clientFormBody({name: "Jo"}), () => "id-1");
      assert.equal(made.error, undefined);
      assert.ok(require("../clients").addClient(made.clients, clientFormBody({name: "jo"}), () => "id-2").error, "a taken name is refused");
    });
  });

  describe("a new client in the Projects section", () => {
    const jo = {name: "Jo Smith", phone: "", email: "jo@example.com", hourlyRate: "", useWhatsApp: false, location: null, url: ""};
    it("setClientBody makes the SET_CLIENT body for each choice of the Client select", () => {
      const {setClientBody, NEW_CLIENT} = load();
      assert.deepEqual(setClientBody("p1", "c1"), {action: "SET_CLIENT", projectId: "p1", clientId: "c1"});
      assert.deepEqual(setClientBody("p1", ""), {action: "SET_CLIENT", projectId: "p1", clientId: null}, "No client takes it off");
      assert.deepEqual(setClientBody("p1", NEW_CLIENT, jo), {action: "SET_CLIENT", projectId: "p1", newClient: jo});
      assert.equal("clientId" in setClientBody("p1", NEW_CLIENT, jo), false, "the new client replaces a client id");
    });
    it("is accepted by the server: the client is made and the project carries it", () => {
      const {setProjectClient} = require("../clients");
      const {setClientBody} = load();
      let n = 0;
      const make = () => `id-${++n}`;
      const body = setClientBody("p1", load().NEW_CLIENT, jo);
      const done = setProjectClient([{id: "p1", name: "Kitchen"}], [], body.projectId, body.clientId, body.newClient, make);
      assert.equal(done.error, undefined);
      assert.equal(done.client.name, "Jo Smith");
      assert.equal(done.project.clientId, done.client.id);
      const taken = setProjectClient([{id: "p1", name: "Kitchen"}], [{id: "c1", name: "Jo Smith"}], "p1", undefined, jo, make);
      assert.ok(taken.error, "a taken name is refused");
    });
    it("keeps the form in fixed markup outside the redrawn actions, with its own Add and Cancel", () => {
      const actions = html.indexOf("id=\"projectActions\"");
      const holder = html.indexOf("id=\"projectNewClient\"");
      const location = html.indexOf("id=\"projectLocation\"");
      assert.ok(actions > 0 && holder > actions && holder < location, "between the project actions and the Location row");
      for (const id of ["projectNewClient", "projectClientFormMount", "projectClientAddBtn", "projectClientCancelBtn"]) assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
      assert.match(html, /<div class="project-location" id="projectNewClient" hidden>/);
      assert.ok(html.includes("mountClientForm(\"projectClient\", \"projectClientFormMount\")"));
      const {clientFormHtml} = load();
      for (const m of clientFormHtml("projectClient").matchAll(/id="([^"]+)"/g)) assert.equal(html.split(`id="${m[1]}"`).length - 1, 0, `${m[1]} is only made by clientFormHtml`);
      const picker = html.slice(html.indexOf("function clientPickerHtml"), html.indexOf("// The client form of the Projects section"));
      assert.equal(html.split("id=\"projectClient\"").length - 1, 1, "the Client button's id is made once, by clientPickerHtml");
      assert.ok(picker.includes("id=\"projectClient\""));
    });
    it("shows the project's client on a button that opens the client picker, even with no clients", () => {
      const picker = html.slice(html.indexOf("function clientPickerHtml"), html.indexOf("function pickProjectClient"));
      assert.doesNotMatch(picker, /<select|<option/);
      assert.match(picker, /if \(!clientsLoaded\) return "";/);
      assert.match(picker, /class="picker-field" data-action="client"/);
      assert.match(picker, /projectNewClientFor === project\.id/);
      assert.match(picker, /"New client"/);
      assert.match(picker, /"No client"/);
    });
    it("the Add row opens the form without saving; any other pick closes it and saves", () => {
      const pick = html.slice(html.indexOf("function pickProjectClient"), html.indexOf("// The client form of the Projects section"));
      assert.match(pick, /openPicker\("client", adding \? NEW_CLIENT : own,/);
      assert.match(pick, /noneLabel: "No client"/);
      const opened = pick.slice(pick.indexOf("if (pick.name !== undefined)"), pick.indexOf("return;\n        }") + 8);
      assert.doesNotMatch(opened, /saveProject/);
      assert.match(opened, /projectNewClientFor = projectId;/);
      assert.match(pick, /if \(projectNewClientFor !== null\) closeProjectClientForm\(\);\s*saveProject\(setClientBody\(projectId, pick\.id\), "Saved\."\);/);
      assert.match(html, /btn\.dataset\.action === "client"\) pickProjectClient\(row\.dataset\.id, btn\)/);
    });
    it("Add checks the client before sending and closes the form only when saved", () => {
      const add = html.slice(html.indexOf("async function addClientToProject"), html.indexOf("async function loadProjects"));
      assert.ok(add.indexOf("newClientWarning(client)") < add.indexOf("saveProject("), "a warning stops before anything is sent");
      assert.match(add, /saveProject\(setClientBody\(projectId, NEW_CLIENT, client\), /);
      assert.ok(add.indexOf("saveProject(") < add.indexOf("closeProjectClientForm();\n          renderProjects"), "the form stays as typed when the server refuses");
      assert.match(add, /button\.disabled = true;[\s\S]*finally \{\s*button\.disabled = false;/);
      const save = html.slice(html.indexOf("async function saveProject"), html.indexOf("async function addProject"));
      assert.match(save, /takeClients\(data\)/);
    });
    it("closes the form when another project is chosen, the project goes or the clients are not loaded", () => {
      const sync = html.slice(html.indexOf("function syncProjectClientForm"), html.indexOf("// Add: creates the client"));
      assert.match(sync, /!chosen \|\| chosen\.id !== projectNewClientFor \|\| !clientsLoaded/);
      const render = html.slice(html.indexOf("function renderProjects"), html.indexOf("actions.innerHTML = chosen ?"));
      assert.ok(render.indexOf("syncProjectClientForm(chosen)") > 0 && render.indexOf("syncProjectClientForm(chosen)") < render.indexOf("allProjects.length === 0"), "also when there are no projects left");
    });
  });

  describe("contact details", () => {
    const clients = [{id: "c1", name: "Smith Ltd", phone: "09 555 0000", email: "office@smith.example"}, {id: "c2", name: "Bare"}];
    const projects = [{id: "p1", name: "Kitchen", clientId: "c1"}, {id: "p2", name: "Shed", clientId: "c2"}, {id: "p3", name: "Own"}];
    it("parses a typed email: empty is none, an address is kept trimmed, anything else is unusable", () => {
      const h = load();
      assert.equal(h.parseEmailText("  "), null);
      assert.equal(h.parseEmailText(" mo@example.com "), "mo@example.com");
      for (const v of ["mo", "mo@", "mo@example", "mo @example.com"]) assert.equal(h.parseEmailText(v), undefined, v);
      assert.match(h.INVALID_EMAIL, /name@example\.com/);
    });
    it("cleans a phone number for dialling, keeping a leading +", () => {
      const h = load();
      assert.equal(h.phoneDigits(" +64 (9) 555-1234 "), "+6495551234");
      assert.equal(h.phoneDigits("021 555 1234"), "0215551234");
      assert.equal(h.phoneDigits("call me"), "");
      assert.equal(h.phoneHref("021 555 1234"), "tel:0215551234");
      assert.equal(h.smsHref("+64 21 555 1234"), "sms:+64215551234");
      assert.equal(h.phoneHref(""), "");
      assert.equal(h.smsHref(null), "");
    });
    it("writes a phone number the way a WhatsApp link wants it", () => {
      const h = load();
      assert.equal(h.whatsappNumber("021 555 1234"), "64215551234");
      assert.equal(h.whatsappNumber("09 555 0000"), "6495550000");
      assert.equal(h.whatsappNumber("+61 412 345 678"), "61412345678");
      assert.equal(h.whatsappNumber("0061 412 345 678"), "61412345678");
      assert.equal(h.whatsappNumber(" +64 (21) 555-1234 "), "64215551234");
      assert.equal(h.whatsappNumber("64 21 555 1234"), "64215551234");
      for (const none of ["", "  ", "call me", null, undefined, "00"]) assert.equal(h.whatsappNumber(none), "", String(none));
      assert.equal(h.whatsappHref("021 555 1234"), "https://wa.me/64215551234");
      assert.equal(h.whatsappHref("call me"), "");
    });
    it("reads whether the client uses WhatsApp, whichever side the number came from", () => {
      const h = load();
      const wa = [{id: "c1", name: "Smith Ltd", phone: "09 555 0000", useWhatsApp: true}, {id: "c2", name: "Bare", useWhatsApp: false}];
      assert.equal(h.effectiveContact({}, "p1", projects, wa).whatsApp, true);
      assert.equal(h.effectiveContact({phone: "021 1"}, "p1", projects, wa).whatsApp, true);
      assert.equal(h.effectiveContact({}, "p2", projects, wa).whatsApp, false);
      assert.equal(h.effectiveContact({}, "p3", projects, wa).whatsApp, false);
      assert.equal(h.effectiveContact({}, "", projects, wa).whatsApp, false);
    });
    it("swaps Call and Text for one WhatsApp button for a WhatsApp client", () => {
      const h = load();
      const task = {title: "Fit tap", jobNumber: 7};
      const wa = [{id: "c1", name: "Smith Ltd", phone: "021 555 1234", email: "office@smith.example", useWhatsApp: true}];
      const eff = h.effectiveContact({}, "p1", projects, wa);
      const links = h.contactLinks(eff, task);
      assert.deepEqual(links.map((l) => l.label), ["💬 WhatsApp", "✉️ Email"]);
      assert.equal(links[0].href, "https://wa.me/64215551234");
      assert.equal(links[0].external, true);
      assert.equal(links[1].external, undefined);
      // a task's own number is used, through WhatsApp, for the client's task
      assert.equal(h.contactLinks(h.effectiveContact({phone: "+61 412 345 678"}, "p1", projects, wa), task)[0].href, "https://wa.me/61412345678");
      // no number: no WhatsApp button, and no Call or Text either
      const noPhone = [{id: "c1", name: "Smith Ltd", email: "office@smith.example", useWhatsApp: true}];
      assert.deepEqual(h.contactLinks(h.effectiveContact({}, "p1", projects, noPhone), task).map((l) => l.label), ["✉️ Email"]);
      // not a WhatsApp client: unchanged
      assert.deepEqual(h.contactLinks(h.effectiveContact({}, "p1", projects, [{...wa[0], useWhatsApp: false}]), task).map((l) => l.label), ["📞 Call", "💬 Text", "✉️ Email"]);
    });
    it("builds a mailto link whose subject is the title and job number", () => {
      const h = load();
      assert.equal(h.emailHref("mo@example.com", {title: "Fit tap & seal", jobNumber: 123}), "mailto:mo@example.com?subject=Fit%20tap%20%26%20seal%20(Job%20123)");
      assert.equal(h.emailHref("mo@example.com", {title: "Fit tap"}), "mailto:mo@example.com?subject=Fit%20tap");
      assert.equal(h.emailHref("mo@example.com", null), "mailto:mo@example.com");
      assert.equal(h.emailHref("  ", {title: "x"}), "");
    });
    it("uses the task's own details, else its client's, each on its own", () => {
      const h = load();
      assert.deepEqual(h.effectiveContact({phone: "", email: ""}, "p1", projects, clients), {phone: "09 555 0000", phoneFrom: "client", email: "office@smith.example", emailFrom: "client", whatsApp: false});
      assert.deepEqual(h.effectiveContact({phone: " 021 111 2222 ", email: ""}, "p1", projects, clients), {phone: "021 111 2222", phoneFrom: "task", email: "office@smith.example", emailFrom: "client", whatsApp: false});
      assert.deepEqual(h.effectiveContact({phone: "1", email: "a@b.co"}, "p1", projects, clients), {phone: "1", phoneFrom: "task", email: "a@b.co", emailFrom: "task", whatsApp: false});
    });
    it("has nothing to inherit without a project, a client or a client's detail", () => {
      const h = load();
      const none = {phone: "", phoneFrom: "", email: "", emailFrom: "", whatsApp: false};
      assert.deepEqual(h.effectiveContact({}, "", projects, clients), none);
      assert.deepEqual(h.effectiveContact({}, "p3", projects, clients), none);
      assert.deepEqual(h.effectiveContact({}, "p2", projects, clients), none);
      assert.deepEqual(h.effectiveContact({}, "gone", projects, clients), none);
      assert.deepEqual(h.effectiveContact(undefined, "p1", undefined, undefined), none);
    });
    it("shows the inherited value as the placeholder only while it would be inherited", () => {
      const h = load();
      assert.equal(h.contactPlaceholder(h.effectiveContact({}, "p1", projects, clients), "phone"), "From client: 09 555 0000");
      assert.equal(h.contactPlaceholder(h.effectiveContact({email: "a@b.co"}, "p1", projects, clients), "email"), "e.g. name@example.com");
      assert.equal(h.contactPlaceholder(h.effectiveContact({}, "", projects, clients), "phone"), "e.g. 021 123 4567");
    });
    it("offers Call, Text and Email only for the details it has", () => {
      const h = load();
      const task = {title: "Fit tap", jobNumber: 7};
      const labels = (eff) => h.contactLinks(eff, task).map((l) => l.label);
      assert.deepEqual(labels(h.effectiveContact({}, "p1", projects, clients)), ["📞 Call", "💬 Text", "✉️ Email"]);
      assert.deepEqual(labels(h.effectiveContact({phone: "021 1"}, "p2", projects, clients)), ["📞 Call", "💬 Text"]);
      assert.deepEqual(labels(h.effectiveContact({email: "a@b.co"}, "", projects, clients)), ["✉️ Email"]);
      assert.deepEqual(labels(h.effectiveContact({}, "", projects, clients)), []);
      assert.equal(h.contactLinks(h.effectiveContact({email: "a@b.co"}, "", projects, clients), task)[0].href, "mailto:a@b.co?subject=Fit%20tap%20(Job%207)");
    });
    it("sends phone and email on a manual entry only when given", () => {
      const h = load();
      const form = {title: "T", priority: "LOW", estimatedMinutes: "", tags: "", dueDate: ""};
      assert.deepEqual(h.manualTaskBody({...form, phone: " 021 555 1234 ", email: " mo@example.com "}).manual.phone, "021 555 1234");
      assert.equal(h.manualTaskBody({...form, phone: " 021 555 1234 ", email: " mo@example.com "}).manual.email, "mo@example.com");
      const bare = h.manualTaskBody({...form, phone: "  ", email: ""}).manual;
      assert.equal("phone" in bare, false);
      assert.equal("email" in bare, false);
    });
    it("names the section holding the field at fault in each completedChanges error", () => {
      const {completedChanges, completedFormValues} = load();
      const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, completedAt: "2026-10-20T01:00:00.000Z"};
      const form = () => ({...completedFormValues(row, "Pacific/Auckland")});
      const section = (change) => completedChanges(row, {...form(), ...change}, "Pacific/Auckland").section;
      assert.equal(section({email: "nope"}), "ceContact");
      assert.equal(section({url: "mailto:a@b.co"}), "ceContact");
      assert.equal(section({travelKm: "far"}), "ceAudit");
      assert.equal(section({trackedMinutes: "-5"}), "ceScheduling");
      assert.equal(section({date: ""}), "ceScheduling");
      assert.equal("section" in completedChanges(row, form(), "Pacific/Auckland"), false, "a good form has no section");
    });
    it("opens the section of the field at fault before each warning, in the queued form and the completed form", () => {
      const edit = html.slice(html.indexOf("async function saveTaskEdits"), html.indexOf("async function snoozeFromModal"));
      assert.match(edit, /warnInSection\("editAudit", `The cost of/);
      assert.match(edit, /warnInSection\("editAudit", INVALID_TRAVEL\)/);
      assert.match(edit, /warnInSection\("editContact", INVALID_EMAIL\)/);
      assert.match(edit, /warnInSection\("editContact", INVALID_URL\)/);
      for (const fn of ["async function saveCompletedEdit", "async function reopenCompletedEntry"]) {
        const body = html.slice(html.indexOf(fn), html.indexOf(fn) + 700);
        assert.match(body, /if \(result\.error\) \{ warnInSection\(result\.section, result\.error\); return; \}/, fn);
      }
    });
    it("completedChanges sends phone and email only when they differ, null to clear, and an error for a bad email", () => {
      const {completedChanges, completedFormValues} = load();
      const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, phone: "021 1", email: "a@b.co", completedAt: "2026-10-20T01:00:00.000Z"};
      const form = () => ({...completedFormValues(row, "Pacific/Auckland")});
      assert.deepEqual(completedChanges(row, form(), "Pacific/Auckland"), {fields: {}});
      assert.deepEqual(completedChanges(row, {...form(), phone: "09 555 0000", email: "new@b.co"}, "Pacific/Auckland"), {fields: {phone: "09 555 0000", email: "new@b.co"}});
      assert.deepEqual(completedChanges(row, {...form(), phone: "  ", email: ""}, "Pacific/Auckland"), {fields: {phone: null, email: null}});
      assert.match(completedChanges(row, {...form(), email: "nope"}, "Pacific/Auckland").error, /Email/);
      const bare = {...row};
      delete bare.phone;
      delete bare.email;
      assert.deepEqual(completedChanges(bare, {...completedFormValues(bare, "Pacific/Auckland")}, "Pacific/Auckland"), {fields: {}});
    });
    it("copies a completed task's phone and email into the add form values", () => {
      const v = load().templateFormValues({title: "T", phone: "021 1", email: "a@b.co"});
      assert.equal(v.phone, "021 1");
      assert.equal(v.email, "a@b.co");
      assert.equal(load().templateFormValues({title: "T"}).phone, "");
    });
    it("puts Phone and Email inside both Contact details sections and the buttons outside them, above", () => {
      for (const [details, prefix] of [["editContact", "edit"], ["ceContact", "ce"]]) {
        const i = html.indexOf(`id="${details}"`);
        const close = html.indexOf("</details>", i);
        for (const id of [`${prefix}Phone`, `${prefix}Email`]) {
          const at = html.indexOf(`id="${id}"`);
          assert.ok(at > i && at < close, `${id} is in ${details}`);
        }
        const buttons = html.indexOf(`id="${prefix}ContactActions"`);
        assert.ok(buttons > 0 && buttons < i, `${prefix} buttons sit above Contact details`);
      }
      assert.ok(html.indexOf("id=\"manualPhone\"") > 0 && html.indexOf("id=\"manualEmail\"") > 0);
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
    it("adds trimmed description only when there are some", () => {
      assert.equal(load().manualTaskBody({...form, description: "  Use the blue paint.\nAsk Sam. "}).manual.description, "Use the blue paint.\nAsk Sam.");
      for (const description of ["", "   ", undefined]) assert.equal("description" in load().manualTaskBody({...form, description}).manual, false, JSON.stringify(description));
    });
    it("gives a new task its description through the server-side merge", () => {
      const {manualTaskChange, mergeTaskChanges} = require("../tasks");
      const body = load().manualTaskBody({...form, description: " Hinge is loose "}).manual;
      const merged = mergeTaskChanges([], [manualTaskChange(body)], () => "id1", [], {description: true});
      assert.equal(merged.tasks[0].description, "Hinge is loose");
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
    it("chooses the History project in the picker modal, not a native select, and keeps the choice on the button", () => {
      const render = html.slice(html.indexOf("function renderProjectHours("), html.indexOf("// Correcting or deleting a completed task"));
      assert.doesNotMatch(render, /<select|<option|onchange=/);
      assert.match(render, /id="historyProjectField" class="picker-field"[^>]*onclick="openHistoryProjectPicker\(\)"/);
      assert.match(render, /openPicker\("hours", historyProjectId, selectHistoryProject, \{ opener: document\.getElementById\("historyProjectField"\), allowAdd: false, noneLabel: HISTORY_ALL_PROJECTS \}\);/);
      assert.match(html, /const HISTORY_ALL_PROJECTS = "All";/);
      assert.match(render, /<span class="picker-line-label" id="historyProjectLabel">Project<\/span><button type="button" id="historyProjectField"/, "the label is Project (not all capitals, not Project hours), to the left of the field on its line");
      assert.doesNotMatch(render, /<div class="summary-label"[^>]*>Project<\/div>/, "no label line above the field");
      assert.match(html, /\.picker-line-label \{[^}]*flex: none;/, "the label keeps its width beside the growing field");
      assert.doesNotMatch(html.slice(html.indexOf(".picker-line-label {"), html.indexOf("}", html.indexOf(".picker-line-label {"))), /text-transform/);
      assert.match(render, /function selectHistoryProject\(pick\) \{[\s\S]*historyProjectId = id;[\s\S]*field\.textContent = [\s\S]*completedPageNo = 1;\s*renderCompletedRows\(\);/);
      assert.match(html, /if \(kind === "hours"\) return \{ items: historyProjectChoices\(projectHoursEntries\), context: \{\} \};/);
      assert.doesNotMatch(html, /<select[^>]*id="historyProject"/);
    });
    it("pickHistoryProject: keeps the current choice while it exists, else All (\"\"), and null with no project", () => {
      const {pickHistoryProject} = load();
      const entries = [{projectId: "a"}, {projectId: "b"}, {projectId: "c"}];
      assert.equal(pickHistoryProject(entries, "c"), "c");
      assert.equal(pickHistoryProject(entries, "gone"), "");
      assert.equal(pickHistoryProject(entries, null), "");
      assert.equal(pickHistoryProject(entries, ""), "");
      assert.equal(pickHistoryProject([], "a"), null);
      assert.equal(pickHistoryProject(undefined, null), null);
    });
    it("tagChipItems: All first, then each tag alphabetically with its count, active as chosen", () => {
      const {tagChipItems} = load();
      const rows = [{tags: ["Garden", "urgent"]}, {tags: ["garden"]}, {tags: []}, {}];
      assert.deepEqual(tagChipItems(rows, []), [
        {all: true, count: 4, active: true}, {tag: "Garden", count: 1, active: false}, {tag: "garden", count: 1, active: false}, {tag: "urgent", count: 1, active: false},
      ]);
      const chosen = tagChipItems(rows, ["urgent"]);
      assert.equal(chosen[0].active, false);
      assert.deepEqual(chosen.filter((c) => c.active).map((c) => c.tag), ["urgent"]);
      assert.deepEqual(tagChipItems(undefined, undefined), [{all: true, count: 0, active: true}]);
      assert.equal(tagChipItems([{title: "x"}], []).length, 1, "no tags, only All");
    });
    it("filters the History list by the chosen tags (any of them), alone and with the search and the project, and counts it as a filter", () => {
      const h = load();
      const rows = [
        {archiveId: "1", title: "Fence", tags: ["garden"], projectId: "p1"}, {archiveId: "2", title: "Deck", tags: ["garden", "urgent"], projectId: "p2"},
        {archiveId: "3", title: "Paint", tags: ["urgent"], projectId: "p1"}, {archiveId: "4", title: "Loose"},
      ];
      const ids = (filters, query = "") => h.completedBrowse(rows, query, 1, () => "", filters).items.map((r) => r.archiveId);
      assert.deepEqual(ids({tags: ["garden"]}), ["1", "2"]);
      assert.deepEqual(ids({tags: ["garden", "urgent"]}), ["1", "2", "3"], "OR");
      assert.deepEqual(ids({tags: []}), ["1", "2", "3", "4"], "none chosen keeps all");
      assert.deepEqual(ids({tags: undefined}), ["1", "2", "3", "4"]);
      assert.deepEqual(ids({tags: ["nothing"]}), []);
      assert.deepEqual(ids({tags: ["urgent"], projectId: "p1"}), ["3"], "the tags and the project combine");
      assert.deepEqual(ids({tags: ["garden"]}, "deck"), ["2"], "the tags and the search combine");
      assert.deepEqual(ids({tags: ["garden"], projectId: "p1"}, "deck"), []);
      assert.equal(h.completedCountText(h.completedBrowse(rows, "", 1, () => "", {tags: ["garden"]}), "", false, true), "Showing 1\u20132 of 2 matches (4 completed tasks).");
      assert.deepEqual(h.pruneTagFilter(["urgent", "gone"], rows), ["urgent"], "a tag no loaded task carries is dropped");
    });
    it("draws the History Tags section between the search and the count, from the loaded rows, and tapping a chip filters from page 1", () => {
      const browser = html.slice(html.indexOf("<div id=\"completedBrowser\""), html.indexOf("id=\"completedRows\""));
      const order = ["completedSearch", "id=\"completedTagsDetails\"", "id=\"completedCount\""].map((k) => browser.indexOf(k));
      assert.ok(order.every((n) => n > 0) && order[0] < order[1] && order[1] < order[2], "search, Tags, count");
      assert.match(browser, /<details class="filter-section" id="completedTagsDetails" hidden>\s*<summary>Tags <small id="completedTagsActive"><\/small><\/summary>\s*<div class="tag-filter-bar" id="completedTagFilterBar"><\/div>/);
      const render = html.slice(html.indexOf("function renderCompletedTagBar("), html.indexOf("function renderCompletedRows("));
      assert.match(render, /tagChipItems\(completedAll, completedTagFilters\)/);
      assert.match(render, /completedTagsDetails"\)\.hidden = items\.length < 2/);
      assert.match(render, /tagFilterLabel\(completedTagFilters\)/);
      assert.match(render, /function setCompletedTagFilter\(tag\) \{[\s\S]*toggleTagFilter\(completedTagFilters, tag\)[\s\S]*completedPageNo = 1;\s*renderCompletedRows\(\);/);
      const rows = html.slice(html.indexOf("function renderCompletedRows("), html.indexOf("function renderCompletedRows(") + 1400);
      assert.match(rows, /completedTagFilters = pruneTagFilter\(completedTagFilters, completedAll\);/);
      assert.match(rows, /\{ projectId, tags: completedTagFilters \}/);
      assert.match(rows, /projectId !== "" \|\| completedTagFilters\.length > 0/);
      assert.match(html, /getElementById\("completedTagFilterBar"\)\.addEventListener\("click"/);
    });
    it("filters the History list by the chosen project, which All turns off, and says so in the count line", () => {
      const h = load();
      const rows = [
        {archiveId: "1", title: "Fence", projectId: "p1"}, {archiveId: "2", title: "Deck", projectId: "p2"},
        {archiveId: "3", title: "Paint", projectId: "p1"}, {archiveId: "4", title: "Loose"},
      ];
      const ids = (b) => b.items.map((r) => r.archiveId);
      assert.deepEqual(ids(h.completedBrowse(rows, "", 1, () => "", {projectId: "p1"})), ["1", "3"]);
      assert.deepEqual(ids(h.completedBrowse(rows, "", 1, () => "", {projectId: ""})), ["1", "2", "3", "4"], "All");
      assert.deepEqual(ids(h.completedBrowse(rows, "", 1, () => "")), ["1", "2", "3", "4"], "no filters");
      assert.deepEqual(ids(h.completedBrowse(rows, "paint", 1, () => "", {projectId: "p1"})), ["3"], "the search and the filter combine");
      assert.deepEqual(ids(h.completedBrowse(rows, "paint", 1, () => "", {projectId: "p2"})), []);
      assert.deepEqual(ids(h.completedBrowse(rows, "", 1, () => "", {projectId: "gone"})), []);
      const one = h.completedBrowse(rows, "", 1, () => "", {projectId: "p1"});
      assert.equal(one.total, 2);
      assert.equal(one.all, 4);
      assert.equal(h.completedCountText(one, "", false, true), "Showing 1\u20132 of 2 matches (4 completed tasks).");
      assert.equal(h.completedCountText(one, "", false), "Showing 1\u20132 of 2 completed tasks.");
      const none = h.completedBrowse(rows, "", 1, () => "", {projectId: "gone"});
      assert.equal(h.completedCountText(none, "", false, true), "No completed tasks match the filter.");
      assert.equal(h.completedCountText(none, "x", false, true), "No completed tasks match the search and filter.");
      assert.equal(h.completedCountText(none, "x", false, false), "No completed tasks match the search.");
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
      const row = {title: "Mow lawn", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 125, tags: ["Garden", "Outdoor"], description: "Front only", projectId: "p1", completedAt: "2026-10-17T20:30:00.000Z"};
      const same = (load_) => load_.completedFormValues(row, NZ);

      it("completedFormValues: starts the form from the row, with the time in minutes and the completion on the zone's clock", () => {
        const {completedFormValues} = load();
        assert.deepEqual(completedFormValues(row, NZ), {priority: "LOW", trackedMinutes: 2, tags: "Garden, Outdoor", materials: "", description: "Front only", travelKm: "", location: null, phone: "", email: "", url: "", projectId: "p1", date: "2026-10-18", time: "09:30"});
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
        assert.deepEqual([v.priority, v.trackedMinutes, v.tags, v.description, v.projectId], ["MEDIUM", 0, "", "", ""]);
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
        const form = {...same(api), priority: "HIGH", trackedMinutes: "90", tags: "Garden, Paid", projectId: "", date: "2026-10-19", time: "10:15", description: "  Front and back  "};
        assert.deepEqual(api.completedChanges(row, form, NZ), {fields: {priority: "HIGH", trackedSeconds: 5400, tags: ["Garden", "Paid"], description: "Front and back", projectId: null, completedDate: "2026-10-19", completedTime: "10:15"}});
      });
      it("completedChanges: clears the description with empty text and the time with 0 or an empty box", () => {
        const api = load();
        assert.deepEqual(api.completedChanges(row, {...same(api), description: "   "}, NZ), {fields: {description: null}});
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
      it("matchesCompletedSearch: every word must appear in the title, in any order and case, and nothing else is read", () => {
        const {matchesCompletedSearch: m} = load();
        const row = {title: "Fit tap", tags: ["Plumbing"], materials: [{id: "a", text: "PTFE tape"}], description: "Washer replaced", comments: [{id: "c", at: 1, text: "Seized"}], projectId: "p1"};
        assert.equal(m(row, "", ""), true);
        assert.equal(m(row, "   ", ""), true);
        assert.equal(m(row, "TAP fit", ""), true);
        assert.equal(m(row, "fi ta", ""), true);
        assert.equal(m(row, "tap bathroom", ""), false);
        for (const other of ["plumb", "ptfe", "washer", "seized", "kitchen"]) assert.equal(m(row, other, "Kitchen reno"), false, `${other} is not in the title`);
      });
      it("matchesCompletedSearch: @word finds the client's name, any case and part of a word, every @ word must be in it, and no client never matches", () => {
        const {matchesCompletedSearch: m} = load();
        const row = {title: "Fit tap", jobNumber: 123, projectId: "p1"};
        assert.equal(m(row, "@smith", "Jo Smith"), true);
        assert.equal(m(row, "@SMI", "Jo Smith"), true);
        assert.equal(m(row, "@jo @smith", "Jo Smith"), true);
        assert.equal(m(row, "@jo @ltd", "Jo Smith"), false);
        assert.equal(m(row, "@smith", ""), false);
        assert.equal(m(row, "@smith", undefined), false);
        assert.equal(m({title: "Fit tap"}, "@smith", ""), false);
        assert.equal(m(row, "@", ""), true, "a bare @ restricts nothing");
        assert.equal(m(row, "tap @smith #123", "Jo Smith"), true);
        assert.equal(m(row, "tap @smith #124", "Jo Smith"), false);
        assert.equal(m(row, "basin @smith", "Jo Smith"), false);
        assert.equal(m(row, "smith", "Jo Smith"), false, "a plain word is read in the title only");
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
        assert.equal(m(row, "#123 @kitchen", "Kitchen reno"), true);
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
        assert.equal(m({title: "Mow", tags: [5, null, "Lawn"], materials: "junk", description: 7}, "mow", undefined), true);
        assert.equal(m({title: 5}, "5", ""), false);
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
      it("completedBrowse: matches an @ word against the client name the page looks up for the task's project", () => {
        const {completedBrowse} = load();
        const rows = [{archiveId: "x", title: "Fit tap", projectId: "p1"}, {archiveId: "y", title: "Mow lawn"}, {archiveId: "z", title: "Fit sink", projectId: "p2"}];
        const names = (id) => ({p1: "Jo Smith"})[id];
        assert.deepEqual(completedBrowse(rows, "@smith", 1, names).items.map((r) => r.archiveId), ["x"]);
        assert.deepEqual(completedBrowse(rows, "fit @jo", 1, names).items.map((r) => r.archiveId), ["x"]);
        assert.deepEqual(completedBrowse(rows, "@smith", 1).items, []);
        assert.deepEqual(completedBrowse(rows, "smith", 1, names).items, [], "a plain word is not read in the client's name");
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
    it("orders the Queue card's parts: Active task, Tags, Project, Sort by, Select tasks, then the list", () => {
      const at = (id) => html.indexOf(`id="${id}"`);
      const order = ["activeTaskBox", "tagsDetails", "projectsSection", "queueProjectField", "projectsStatus", "sortBy", "sortDirBtn", "selectModeBtn", "batchStatus", "taskList"];
      for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) > 0 && at(order[i]) > at(order[i - 1]), `${order[i]} comes after ${order[i - 1]}`);
      const sortRow = html.lastIndexOf("<div class=\"sort-row\">", at("sortBy"));
      assert.ok(sortRow > at("projectsStatus"), "the sort row sits after the Project section");
      const between = html.slice(sortRow, at("taskList"));
      assert.equal(between.includes("<details"), false, "nothing but the Sort and Select rows sits between Project and the list");
    });
    it("labels the edit modal's description box just Description", () => {
      assert.ok(html.includes("<label for=\"editDescription\">Description</label>"));
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
      assert.match(html, /applyFlash\(\);\s*toggleTimer\(taskId\);\s*return;/, "a double-tap on a card toggles the timer");
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
    it("marks a picked Multi-Select card with the blue outline alone, adding no tick box that would change the card's layout", () => {
      assert.equal(html.includes("select-mark"), false);
      assert.equal(/☐|☑(?!️)/.test(html.slice(html.indexOf("function taskItemHtml"), html.indexOf("function toggleSelected") + 600)), false);
      assert.match(html, /\.swipe-row \.task-item\.selected[^{]*\{[^}]*box-shadow: inset 0 0 0 2px var\(--primary\)/);
      assert.match(html, /role="checkbox" aria-checked="\$\{picked\}"/);
    });
    it("puts the active task in a box at the top of the Queue card, above the Tags section", () => {
      const queue = html.slice(html.indexOf("id=\"queueCard\""), html.indexOf("id=\"taskList\""));
      assert.ok(queue.indexOf("id=\"activeTaskBox\"") > 0);
      assert.ok(queue.indexOf("id=\"activeTaskBox\"") < queue.indexOf("id=\"tagsDetails\""));
      assert.ok(html.includes("activeTaskOf(allTasks)"));
    });
  });

  describe("copying a completed task", () => {
    const templates = [
      {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: ["Outdoor", "Garden"], recurrence: {frequency: "WEEKLY", interval: 2}, projectId: "p1", projectOrder: 2, materials: ["Petrol", "Oil"], description: "Check the blade", travelKm: 18},
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
    it("shows at most 8 rows by default", () => {
      const {templateMatches} = load();
      const many = Array.from({length: 12}, (_, i) => ({title: `Mow ${i}`, completedCount: 1}));
      assert.equal(templateMatches(many, "mow").length, 8);
    });
    it("fills the form with the old details but no due date, and every material unchecked", () => {
      const {templateFormValues} = load();
      const v = templateFormValues(templates[0], ["p1"]);
      assert.deepEqual(v, {title: "Mow lawn", priority: "LOW", estimatedMinutes: 45, tags: "Outdoor, Garden", dueDate: "", recurFreq: "WEEKLY", recurInterval: 2, projectId: "p1", projectOrder: 2, materials: [{id: "", text: "Petrol", checked: false}, {id: "", text: "Oil", checked: false}], description: "Check the blade", phone: "", email: "", url: "", travelKm: "18", location: null, history: null});
    });
    it("carries a template's location into the form values, dropping an unusable one", () => {
      const {templateFormValues} = load();
      const place = {name: "12 Beach Road", latitude: -36.6, longitude: 174.7};
      assert.deepEqual(templateFormValues({title: "x", location: place}).location, place);
      assert.deepEqual(templateFormValues({title: "x", location: {name: "Garage"}}).location, {name: "Garage"});
      assert.equal(templateFormValues({title: "x", location: {name: "x", latitude: 5}}).location, null);
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
      assert.deepEqual(templateFormValues({title: "x"}), {title: "x", priority: "MEDIUM", estimatedMinutes: 15, tags: "", dueDate: "", recurFreq: "NONE", recurInterval: 1, projectId: "", projectOrder: "", materials: [], description: "", phone: "", email: "", url: "", travelKm: "", location: null, history: null});
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
    const clients = [{id: "c1", name: "Jo Smith", location: {name: "1 Beach Rd, Whangaparāoa"}, phone: "021 000", email: "jo@x.nz"}];
    const projects = [{id: "p1", name: "Deck", clientId: "c1"}, {id: "p2", name: "Fence"}, {id: "p3", name: "Shed", clientId: "gone"}];
    it("names a project's client, empty with none or an unknown one", () => {
      const {projectClientName} = load();
      assert.equal(projectClientName(projects[0], clients), "Jo Smith");
      assert.equal(projectClientName(projects[1], clients), "");
      assert.equal(projectClientName(projects[2], clients), "");
      assert.equal(projectClientName(null, clients), "");
      assert.equal(projectClientName(projects[0], undefined), "");
    });
    it("names a project's client by the project's id, and still joins the two names for the Projects list's search", () => {
      const {projectClientNameById, projectSearchText, matchesCompletedSearch, completedBrowse, filterTasks} = load();
      assert.equal(projectClientNameById("p1", projects, clients), "Jo Smith");
      assert.equal(projectClientNameById("p2", projects, clients), "");
      assert.equal(projectClientNameById("p3", projects, clients), "");
      assert.equal(projectClientNameById("zzz", projects, clients), "");
      assert.equal(projectClientNameById(undefined, undefined, undefined), "");
      assert.equal(projectSearchText("p1", projects, clients), "Deck Jo Smith");
      assert.equal(projectSearchText("zzz", projects, clients), "");
      assert.equal(matchesCompletedSearch({title: "Fit rail"}, "@smith", projectClientNameById("p1", projects, clients)), true);
      assert.equal(matchesCompletedSearch({title: "Fit rail"}, "@smith", projectClientNameById("p2", projects, clients)), false);
      const rows = [{title: "A", projectId: "p1"}, {title: "B", projectId: "p2"}, {title: "C"}];
      const found = completedBrowse(rows, "@jo", 1, (id) => projectClientNameById(id, projects, clients));
      assert.deepEqual(found.items.map((r) => r.title), ["A"]);
      const tasks = [{title: "Fit rail", projectId: "p1"}, {title: "Fit gate", projectId: "p2"}, {title: "Fit shed"}];
      const clientOf = (t) => projectClientNameById(t.projectId, projects, clients);
      assert.deepEqual(filterTasks(tasks, [], null, "@smith", clientOf).map((t) => t.title), ["Fit rail"], "the Queue's @ search");
      assert.deepEqual(filterTasks(tasks, [], null, "fit @smith", clientOf).map((t) => t.title), ["Fit rail"]);
      assert.deepEqual(filterTasks(tasks, [], null, "gate @smith", clientOf).map((t) => t.title), []);
      assert.deepEqual(filterTasks(tasks, [], null, "@smith").map((t) => t.title), [], "no lookup, no client match");
      assert.deepEqual(filterTasks(tasks, [], "p1", "@jo", clientOf).map((t) => t.title), ["Fit rail"], "with the project filter");
      let asked = 0;
      filterTasks(tasks, [], null, "fit", (t) => {
        asked++; return "";
      });
      assert.equal(asked, 0, "the client is only looked up when the search has an @");
    });
    it("sends the form's location only with a name, its coordinates only when both are numbers", () => {
      const {clientFormBody} = load();
      assert.deepEqual(clientFormBody({name: "Jo", location: {name: "  1 Beach Rd ", latitude: -36.6, longitude: 174.7}}).location, {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7});
      assert.deepEqual(clientFormBody({name: "Jo", location: {name: "Smith's yard"}}).location, {name: "Smith's yard"});
      assert.deepEqual(clientFormBody({name: "Jo", location: {name: "A", latitude: -36.6}}).location, {name: "A"});
      assert.deepEqual(clientFormBody({name: "Jo", location: {name: "A", latitude: "x", longitude: 174.7}}).location, {name: "A"});
      for (const location of [undefined, null, {}, {name: "  "}, {name: "", latitude: -36.6, longitude: 174.7}, "Beach Rd"]) assert.equal(clientFormBody({name: "Jo", location}).location, null, JSON.stringify(location));
    });
    it("searches a typed address as it stands, then by its town-like parts", () => {
      const {placeQueries} = load();
      assert.deepEqual(placeQueries("Orewa"), ["Orewa"]);
      assert.deepEqual(placeQueries("  12 Beach Rd,   Orewa, Auckland 0931, New Zealand "), ["12 Beach Rd, Orewa, Auckland 0931, New Zealand", "Orewa", "New Zealand"]);
      assert.deepEqual(placeQueries("Whangaparāoa, Auckland"), ["Whangaparāoa, Auckland", "Whangaparāoa", "Auckland"]);
      assert.deepEqual(placeQueries("Orewa, orewa"), ["Orewa, orewa", "Orewa"], "a part already tried, in other letters, is not tried again");
      assert.deepEqual(placeQueries("1 High St, 2 Low Rd"), ["1 High St, 2 Low Rd"], "no town-like part");
      assert.equal(placeQueries("a, b, c, d, e, f").length, 4, "at most four searches");
      for (const none of ["", "   ", null, undefined]) assert.deepEqual(placeQueries(none), []);
    });
    it("shows Delete client only while an existing client is being edited", () => {
      const {clientDeleteShown} = load();
      assert.equal(clientDeleteShown("c1", [{id: "c1"}, {id: "c2"}]), true);
      assert.equal(clientDeleteShown(null, [{id: "c1"}]), false, "a new client has nothing to delete");
      assert.equal(clientDeleteShown("gone", [{id: "c1"}]), false);
      assert.equal(clientDeleteShown("c1", null), false);
    });
    it("builds the form body, trimming the name only", () => {
      const {clientFormBody} = load();
      assert.deepEqual(clientFormBody({name: "  Jo ", phone: " 1", email: "a@b.nz", hourlyRate: " 95.50 "}), {name: "Jo", phone: " 1", email: "a@b.nz", hourlyRate: "95.50", useWhatsApp: false, location: null, url: ""});
      assert.deepEqual(clientFormBody({name: "Jo", hourlyRate: null}), {name: "Jo", phone: "", email: "", hourlyRate: "", useWhatsApp: false, location: null, url: ""});
      assert.deepEqual(clientFormBody(undefined), {name: "", phone: "", email: "", hourlyRate: "", useWhatsApp: false, location: null, url: ""});
      assert.equal("address" in clientFormBody({name: "Jo", address: "1 Rd"}), false, "no address is sent");
      assert.equal(clientFormBody({name: "Jo", useWhatsApp: true}).useWhatsApp, true);
      assert.equal(clientFormBody({name: "Jo", useWhatsApp: "yes"}).useWhatsApp, false);
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
    it("has the Start from template controls in a second collapsible section of the Project modal and Save as template on the chosen project", () => {
      const modal = html.indexOf("id=\"pickerModal\"");
      const manage = html.indexOf("<details class=\"filter-section\" id=\"pickerManage\" hidden>", modal);
      const section = html.indexOf("<details class=\"filter-section\" id=\"pickerTemplates\" hidden>", modal);
      const end = html.indexOf("</details>", section);
      assert.ok(manage > modal && html.indexOf("</details>", manage) < section, "the section follows Manage");
      assert.ok(end < html.indexOf("onclick=\"closePicker()\"", modal), "and sits above Cancel");
      assert.match(html.slice(section, html.indexOf("</summary>", section) + 10), /<summary>Start from template<\/summary>/);
      for (const id of ["templateBlock", "templateSelect", "templateProjectName", "startTemplateBtn", "renameTemplateBtn", "deleteTemplateBtn", "templateEmpty"]) {
        const i = html.indexOf(`id="${id}"`, section);
        assert.ok(i > section && i < end, `${id} is in the section`);
      }
      const page = html.slice(html.indexOf("id=\"projectsSection\""), html.indexOf("id=\"taskList\""));
      assert.doesNotMatch(page, /templateBlock|templateSelect|startTemplateBtn|Start from template/, "nothing of it is left under the Project field");
      assert.match(html, /data-action="saveTemplate"/);
      assert.match(html, /endpoint\("getProjectTemplates"\)/);
      assert.match(html, /endpoint\("updateProjectTemplate"\)/);
    });
    it("shows the Start from template section with All chosen as well as a project, collapsed on every open, and closes the modal when Start succeeds", () => {
      const fn = html.slice(html.indexOf("function renderPickerTemplates()"), html.indexOf("function pickerTyped()"));
      assert.match(fn, /hidden = !\(pickerState && pickerState\.kind === "queue"\)/, "no project needed, only the Queue's modal in front");
      assert.doesNotMatch(fn, /selectedProjectFilter/);
      assert.match(html, /renderPickerManage\(\);\s*renderPickerTemplates\(\);/, "redrawn with the rows");
      assert.match(html, /if \(kind === "queue" && !over\) \{[^}]*getElementById\("pickerTemplates"\)\.open = false;/, "collapsed on every open");
      const close = html.slice(html.indexOf("function closePicker()"), html.indexOf("function closePickerOnOverlay"));
      assert.match(close, /getElementById\("pickerTemplates"\)\.hidden = true;/);
      const start = html.slice(html.indexOf("async function startFromTemplate()"), html.indexOf("async function renameTemplate()"));
      assert.match(start, /setProjectsStatus\(startedText\(data\.project\.name, data\.added\)\);\s*if \(pickerState && pickerState\.kind === "queue"\) closePicker\(\);/, "the message is set, then the modal closes");
      assert.match(start, /if \(!data\) return;[\s\S]*closePicker/, "a failed Start leaves the modal open");
      assert.match(html, /#pickerManage, #pickerTemplates \{ flex: 0 1 auto; min-height: 0; overflow-y: auto; \}/, "scrolls inside the card as Manage does");
    });
    it("gives History's Project line the same space under the Tags section as the Queue's", () => {
      const queue = /\.project-section \{ margin-top: (\d+)px; \}/.exec(html);
      const history = /<div class="picker-line" style="margin:(\d+)px 0 \d+px;"><span class="picker-line-label" id="historyProjectLabel">/.exec(html);
      assert.ok(queue && history, "both rules are found");
      assert.equal(history[1], queue[1]);
      assert.match(html, /\.filter-section \{ margin-top: 12px; \}/, "both Tags sections are .filter-section, so the gap under each is the Project line's top margin");
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
      for (const id of ["selectModeBtn", "batchStatus", "batchBar", "batchCount", "batchAllBtn", "batchNoneBtn", "batchModal", "batchSnoozePane", "batchDuePane", "batchDueClearBtn", "batchUnsnoozeBtn"]) assert.ok(html.includes(`id="${id}"`), id);
      for (const action of ["COMPLETE", "DELETE", "SNOOZE", "TOP", "PROJECT", "DUE"]) assert.ok(html.includes(`data-batch="${action}"`), action);
      assert.ok(html.indexOf("id=\"selectModeBtn\"") > html.indexOf("id=\"sortDirBtn\""));
      assert.ok(html.indexOf("id=\"batchBar\"") > html.indexOf("id=\"taskList\""));
      assert.doesNotMatch(html, /batchProjectPane|batchProjectSetBtn|id="batchProject"|id="batchNewProject"/, "Project has no dialog of its own");
      const pick = html.slice(html.indexOf("function pickBatchProject()"), html.indexOf("function closeBatchModal()"));
      assert.match(pick, /openPicker\("project", "-", /);
      assert.match(pick, /noneLabel: "None"/);
      assert.match(pick, /projectId: null/);
      assert.match(html, /if \(kind === "PROJECT"\) return pickBatchProject\(\);/);
      assert.match(html, /\{ newProject: pick\.name \}/);
    });
    it("makes a queued card take only taps while selecting, and never makes the Active task selectable", () => {
      const down = html.slice(html.indexOf("const onTaskRowDown"), html.indexOf("const onTaskRowMove"));
      assert.match(down, /if \(selectMode && !item\.closest\("#activeTaskBox"\)\) \{ swipe = null; return; \}/);
      assert.ok(down.indexOf("selectMode") < down.indexOf("setTimeout"), "no hold while selecting");
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
      assert.match(remove, /if \(!opts\.noUndo\) \{\s*undoNoteKey = taskId;\s*showUndoNote/);
      assert.match(remove, /if \(opts\.onError\) opts\.onError\(err, taskId\);\s*else askAlert/);
    });
    it("sends the other actions to batchUpdateTasks and keeps Multi-Select and the selection on success and on a failure", () => {
      assert.match(html, /const BATCH_UPDATE_URL = endpoint\("batchUpdateTasks"\);/);
      const fn = html.slice(html.indexOf("async function batchSend"), html.indexOf("// The dialog for the batch actions"));
      assert.match(fn, /apiFetch\(BATCH_UPDATE_URL/);
      assert.match(fn, /if \(data\.projects\) allProjects = data\.projects;/);
      assert.equal(fn.includes("setSelectMode"), false, "the selection stays for the next action");
      assert.match(fn, /catch \(err\) \{[^}]*askAlert\(/);
      for (const action of ["MOVE_TO_TOP", "SNOOZE", "SET_DUE", "SET_PROJECT"]) assert.ok(html.includes(`batchBody("${action}"`), action);
    });
    it("keeps a batch for later behind waiting changes or after a connection failure, and never one that needs a new project", () => {
      const send = html.slice(html.indexOf("async function batchSend"), html.indexOf("// The dialog for the batch actions"));
      assert.match(send, /loadActionQueue\(\);\s*if \(hasPendingActions\(actionQueue\) \|\| actionDraining\) return holdBatch\(body, doneText, true\);/);
      assert.match(send, /if \(isNetworkError\(err, navigator\.onLine\)\) return holdBatch\(body, doneText, false\);/);
      const hold = html.slice(html.indexOf("function holdBatch("), html.indexOf("// One call to batchUpdateTasks"));
      assert.match(hold, /if \(body\.newProject !== undefined\) \{/);
      assert.match(hold, /unheldBatchId\(ids\)/);
      assert.match(hold, /makeQueuedAction\(\{ kind: "BATCH"/);
      assert.equal(hold.includes("setSelectMode"), false, "the selection stays for the next action");
      assert.match(hold, /renderFilterBar\(\);[^\n]*\n\s*renderAddQueue\(\);\s*refreshShownTasks\(\);/);
      assert.match(hold, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\);/);
    });
    it("sends a held batch to batchUpdateTasks with the body the action holds", () => {
      const fn = html.slice(html.indexOf("async function sendQueuedAction"), html.indexOf("function settleQueuedAction"));
      assert.match(fn, /item\.kind === "BATCH"\) \{\s*url = BATCH_UPDATE_URL;\s*body = batchActionBody\(item\);/);
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
      assert.equal(asks.length, 15, "the fifteen questions the page asks (one discards a waiting change, one deletes a comment)");
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
      assert.match(dom, /showLayer\("confirmModal", \(\) => settleConfirm\(false\)\)/);
      assert.match(dom, /hideLayer\("confirmModal"\)/); // the layer stack keeps the page locked while a modal is still open underneath
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
      assert.match(dom, /const result = pending\.input \? \(answer \? field\.value\.trim\(\) : null\) : pending\.choices \? \(typeof answer === "string" \? answer : null\) : answer;/);
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
      const inSection = code.match(/(?<!function )warnInSection\(/g) || [];
      assert.equal(inSection.length, 10, "ten validation warnings open the section holding the field at fault first (four in the add card, four in the queued form, two in the completed form)");
      assert.equal(calls.length - 1 + inSection.length, 68, "the sixty-eight messages the page shows (fourteen are refusals to keep an add, a change or a comment for later, six tell why a held edit was not kept and two why a Multi-Select change was not); warnInSection's own askAlert call stands for its ten");
      const errors = code.match(/askAlert\(failureText\([^\n]*\{ tone: "error" \}\)/g) || [];
      assert.equal(errors.length, 19, "every failed call is an error alert with the reason as detail");
      const warnings = code.match(/askAlert\([^;\n]*?\{ tone: "warning" \}\)/g) || [];
      assert.equal(warnings.length - 1 + inSection.length, 47, "every validation message is a warning alert");
      assert.match(code, /function warnInSection\(sectionId, text\) \{\s*openFormSection\(sectionId\);\s*return askAlert\(text, \{ tone: "warning" \}\);/);
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
      assert.match(fn, /await askAlert\("Enter a name for the new project, or choose another project\.", \{ tone: "warning" \}\);\s*document\.getElementById\("manualProjectField"\)\.focus\(\);/);
      const edit = html.slice(html.indexOf("async function saveTaskEdits"), html.indexOf("async function snoozeFromModal"));
      assert.match(edit, /await askAlert\("Enter a name for the new project\.", \{ tone: "warning" \}\);\s*document\.getElementById\("editProjectField"\)\.focus\(\);\s*return false;/);
    });
    it("runs the Settings location and the Clients form through one place search", () => {
      assert.equal((html.match(/function makePlaceSearch\(/g) || []).length, 1);
      assert.equal((html.match(/fetch\(geocodeUrl\(/g) || []).length, 1, "one geocoding call in the page");
      assert.match(html, /makePlaceSearch\(\{ queryId: "placeQuery", buttonId: "placeSearchBtn", resultsId: "placeResults", showZone: true/);
      assert.match(html, /\} else \{[^}]*\n\s*makePlaceSearch\(\{ queryId: `\$\{prefix\}Location`, buttonId: `\$\{prefix\}PlaceSearchBtn`, resultsId: `\$\{prefix\}PlaceResults`, showZone: false, queries: placeQueries, clearQuery: false/, "the Open-Meteo search stays as the Clients form's fallback when there is no Places key");
      assert.doesNotMatch(html, /searchPlaces|clientPlaceQuery/);
      const shared = html.slice(html.indexOf("function makePlaceSearch("), html.indexOf("// Address autocomplete (Google Places)"));
      assert.match(shared, /await fetch\(geocodeUrl\(q\)\)/, "a plain fetch, never apiFetch: no Firebase token goes to the geocoder");
      assert.doesNotMatch(shared, /apiFetch/);
      assert.match(shared, /if \(clearQuery\) queryBox\.value = "";/);
    });
    it("searches with the Location text itself, keeps it as typed and shows what was found", () => {
      const at = html.indexOf("makePlaceSearch({ queryId: `${prefix}Location`");
      const pick = html.slice(at, html.indexOf("addEventListener(\"click\"", at + 100));
      assert.match(pick, /state\.coords = \{ latitude: place\.latitude, longitude: place\.longitude, label: place\.name \};/);
      assert.doesNotMatch(pick, /Location`\)\.value/, "picking a place never rewrites the text");
      const note = html.slice(html.indexOf("function renderClientCoords"), html.indexOf("// Fill a block from a client"));
      assert.match(note, /Map position set: \$\{coords\.label\}/);
      assert.match(note, /Map position saved \(/);
      assert.match(note, /No map position yet\./);
      assert.doesNotMatch(html.slice(html.indexOf("async function saveClient()"), html.indexOf("async function deleteClient")), /label/, "the label is never sent");
      assert.doesNotMatch(html.slice(html.indexOf("function clientFormValues"), html.indexOf("function clientFormFill")), /label/, "the label is never read into the form's values");
    });
    it("tells the owner which search found the places when it was not the typed text", () => {
      const shared = html.slice(html.indexOf("function makePlaceSearch("), html.indexOf("// Save a Blob as a file download."));
      assert.match(shared, /Nothing found for “\$\{esc\(text\)\}”, so these are places called “\$\{esc\(used\)\}”/);
    });
    it("lets the edit modal create a project: the picker's Add row, a hidden name, and the name sent as newProject", () => {
      assert.match(html, /<input type="hidden" id="editNewProject"/);
      assert.match(html, /setProjectField\(prefix, NEW_PROJECT, \{ newName: pick\.name \}\)/);
      const edit = html.slice(html.indexOf("async function saveTaskEdits"), html.indexOf("async function snoozeFromModal"));
      assert.match(edit, /updatedFields\.newProject = newProject;/);
      assert.match(edit, /if \(data\.project && data\.projects\) allProjects = data\.projects;/);
      assert.doesNotMatch(edit, /projectId: NEW_PROJECT|projectId = NEW_PROJECT/, "the placeholder id is never sent");
    });
    it("holds a queued task's save and Snooze for later, behind waiting changes or after a connection failure", () => {
      const edit = html.slice(html.indexOf("async function saveTaskEdits"), html.indexOf("async function snoozeFromModal"));
      assert.match(edit, /if \(editedTask && \(hasPendingActions\(actionQueue\) \|\| actionDraining\)\) return holdTaskEdit\(editedTask, updatedFields, true, false\);/);
      assert.ok(edit.indexOf("hasPendingActions(actionQueue)") < edit.indexOf("closeEditModal();"), "behind waiting changes the form stays open until the edit is kept");
      assert.match(edit, /if \(editedTask && isNetworkError\(err, navigator\.onLine\)\) return holdTaskEdit\(editedTask, updatedFields, false, true\);/);
      const hold = html.slice(html.indexOf("function holdTaskEdit"), html.indexOf("// Saves the edits first, then opens the snooze dialog"));
      assert.match(hold, /serverOnlyEditChanges\(task, form\)/);
      assert.match(hold, /need a connection, so nothing was saved/);
      assert.match(hold, /if \(formClosed\) reopenEditForm\(\);/, "a refusal after the form closed brings it back");
      assert.match(hold, /makeQueuedAction\(\{ kind: "EDIT", taskId: task\.id, title: task\.title, fields: checked\.fields/);
      const snooze = html.slice(html.indexOf("async function snoozeTask"), html.indexOf("async function saveTaskEdits"));
      assert.match(snooze, /return holdSnooze\(snoozed, date, true\);/);
      assert.match(snooze, /if \(snoozed && isNetworkError\(err, navigator\.onLine\)\) return holdSnooze\(snoozed, date, false\);/);
      assert.match(snooze, /fields: \{ snoozedUntil: date \}/);
      const send = html.slice(html.indexOf("async function sendQueuedAction"), html.indexOf("function settleQueuedAction"));
      assert.match(send, /item\.kind === "EDIT" && item\.taskId\) \{\s*url = DIRECT_UPDATE_URL;\s*body = taskEditBody\(item\);/);
      assert.match(send, /"snoozedUntil" in item\.fields[\s\S]*snoozeNeedsReschedule\(snoozed\)\) await rescheduleTask\(item\.taskId\);/, "a sent snooze moves the calendar event as the online Snooze does");
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
      const add = html.slice(html.indexOf("function addShoppingText"), html.indexOf("function checkShoppingItem"));
      assert.match(add, /shoppingItemText\(input\.value\)/);
      assert.match(add, /shoppingWithAdded\(shoppingItems, text, tempId\)/);
      assert.match(add, /shoppingItems = result\.items;\s*renderShoppingList\(\);\s*queueShopping\(\{ kind: "SHOPPING_ADD", requestId, fields: \{ text: result\.item\.text \} \}/);
      assert.match(add, /if \(!addShoppingText\(text, true\)\) return;\s*input\.value = "";/);
      assert.match(html, /getElementById\("shoppingInput"\)\.addEventListener\("keydown", e => \{\s*if \(e\.key === "Enter" && !e\.isComposing\)/);
      assert.match(html, /getElementById\("shoppingAddBtn"\)\.addEventListener\("click", addShoppingItemFromInput\)/);
      const check = html.slice(html.indexOf("function checkShoppingItem"), html.indexOf("// Ticking one offers Undo"));
      assert.match(check, /shoppingItems = removed\.items;\s*renderShoppingList\(\);[\s\S]*queueShopping\(\{ kind: "SHOPPING_REMOVE", requestId: newRequestId\(\), fields: \{ id: itemId, text: removed\.item\.text \} \}/);
      assert.match(html, /getElementById\("shoppingList"\)\.addEventListener\("change"/);
    });
    it("saves in order in the background, takes a failed change back and shows the server's list once nothing is waiting", () => {
      const fn = html.slice(html.indexOf("function queueShopping"), html.indexOf("function addShoppingText"));
      assert.match(fn, /shoppingChain = shoppingChain\.then\(/);
      assert.match(fn, /apiFetch\(UPDATE_SHOPPING_URL/);
      assert.match(fn, /if \(shoppingPending === 0 && Array\.isArray\(data\.items\)\) setShoppingFromServer\(data\.items\);/);
      assert.match(fn, /catch \(err\) \{\s*shoppingPending--;\s*const refusal = isNetworkError\(err, navigator\.onLine\) \? holdShoppingChange\(change, false\) : null;\s*if \(refusal === ""\) return;[^\n]*\s*undo\(\);/, "a connection failure keeps the change for later and shown; any other failure takes it back");
      assert.match(fn, /"Not saved: " \+ \(refusal \|\| err\.message\)/);
      assert.match(fn, /finally \{\s*renderShoppingList\(\);/);
      assert.match(fn, /known \|\| change\.fields\.id/, "an item ticked before its add came back is removed under the id the server gave it");
      assert.doesNotMatch(html, /shoppingBusy/);
    });
    it("gives the typed text back when an add fails", () => {
      const fn = html.slice(html.indexOf("function addShoppingText"), html.indexOf("function checkShoppingItem"));
      assert.match(fn, /if \(restoreInput && !input\.value\) input\.value = text;/);
    });
    it("checking a task's material takes it off the Materials card at once and saves in the background", () => {
      const fn = html.slice(html.indexOf("// Ticking one offers Undo"), html.indexOf("// Shows a task's job number"));
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
    it("checkOffMessage: the footnote text for a ticked item, cut like a removed task's title", () => {
      const {checkOffMessage} = load();
      assert.equal(checkOffMessage("Duct tape"), "Checked off “Duct tape”");
      assert.equal(checkOffMessage(""), "Checked off item");
      assert.equal(checkOffMessage(undefined), "Checked off item");
      assert.equal(checkOffMessage("A".repeat(60)), `Checked off “${"A".repeat(39)}…”`);
    });
    it("ticking a Miscellaneous item offers Undo, which adds it again, and a failed save takes the footnote away", () => {
      const fn = html.slice(html.indexOf("function checkShoppingItem"), html.indexOf("// Ticking one offers Undo"));
      assert.match(fn, /openUndoNote\(checkOffMessage\(removed\.item\.text\), \(\) => \{\s*hideUndoNote\(\);\s*addShoppingText\(removed\.item\.text, false\);/);
      assert.match(fn, /if \(undoNoteKey === key\) hideUndoNote\(\);/);
    });
    it("ticking a task's material offers Undo, which unticks it, and a failed save takes the footnote away", () => {
      const fn = html.slice(html.indexOf("// Ticking one offers Undo"), html.indexOf("// Shows a task's job number"));
      assert.match(fn, /if \(checked && material\) \{\s*undoNoteKey = key;\s*openUndoNote\(checkOffMessage\(material\.text\)/);
      assert.match(fn, /checkMaterial\(taskId, materialId, false\);/);
      assert.match(fn, /That task is no longer on the list\./);
      assert.match(fn, /if \(undoNoteKey === key\) hideUndoNote\(\);/);
    });
    it("keeps a check-off that cannot be sent as an EDIT of the task's materials, and goes behind waiting changes", () => {
      const fn = html.slice(html.indexOf("function checkMaterial"), html.indexOf("// Shows a task's job number"));
      assert.match(fn, /materialsPending === 0 && \(hasPendingActions\(actionQueue\) \|\| actionDraining\)/, "a tick made while changes are waiting is kept behind them");
      assert.match(fn, /if \(hasPendingActions\(actionQueue\) \|\| actionDraining\) \{[^}]*holdMaterialCheck\(taskId, materialId, checked, true\)/, "so is one whose turn comes after an earlier tick was kept");
      assert.match(fn, /isNetworkError\(err, navigator\.onLine\) \? holdMaterialCheck\(taskId, materialId, checked, false\) : "Could not save: " \+ err\.message/);
      assert.match(fn, /updatedFields: \{ materials: withMaterialChecked\(task, materialId, checked\) \}/, "the save sets this one box, whatever other ticks are still on their way");
      assert.match(fn, /const base = shownTasks\(serverTasks\)\.find\(t => t\.id === taskId\);/, "the kept list is the queue's view of the task with this one box set");
      assert.match(fn, /withMaterialIds\(withMaterialChecked\(base, materialId, checked\), \(\) => newRequestId\(\)\)/);
      assert.match(fn, /coalesceMaterialsEdit\(actionQueue, taskId, list, sendingActionId\)/);
      assert.match(fn, /makeQueuedAction\(\{ kind: "EDIT", taskId, title: base\.title, fields: \{ materials: list \}/);
      assert.match(fn, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\);/);
    });
    it("holds a form's materials with ids of the page's own, and marks a waiting task on the Materials card", () => {
      const fn = html.slice(html.indexOf("function holdTaskEdit"), html.indexOf("// Saves the edits first, then opens the snooze dialog"));
      assert.match(fn, /materials: withMaterialIds\(form\.materials, \(\) => newRequestId\(\)\)/);
      assert.doesNotMatch(fn, /materials \(/, "materials no longer need a connection");
      const card = html.slice(html.indexOf("function renderMaterialsCard"), html.indexOf("function renderShoppingList"));
      assert.match(card, /waitingIds\.has\(g\.taskId\)/);
      assert.match(card, /Waiting to send/);
    });
    it("the footnote's Undo button runs whatever the footnote was opened for, and hiding it forgets that", () => {
      assert.match(html, /getElementById\("undoNoteBtn"\)\.addEventListener\("click", \(\) => \{ if \(undoHandler\) undoHandler\(\); \}\);/);
      const fn = html.slice(html.indexOf("function openUndoNote"), html.indexOf("async function undoRemoval"));
      assert.match(fn, /function showUndoNote\(kind, title\) \{\s*openUndoNote\(removalMessage\(kind, title\), undoRemoval\);/);
      assert.match(fn, /function hideUndoNote\(\) \{[^}]*undoNoteKey = null;[^}]*undoHandler = null;/);
    });
    it("leaves the Materials tab's count to the tasks' materials", () => {
      const fn = html.slice(html.indexOf("function renderMaterialsCard"), html.indexOf("function renderShoppingList"));
      assert.doesNotMatch(fn, /shopping/i);
    });
  });
});

describe("Reordering", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const numbers = new Map([["a", 1], ["b", 2], ["c", 4], ["d", 7], ["e", 9]]); // the Active task and filtered-out tasks leave gaps
  it("finds where a dragged card lands from the midpoints of the cards", () => {
    const {dragTargetIndex} = load();
    const mids = [50, 150, 250, 350, 450];
    assert.equal(dragTargetIndex(mids, 1, 150), 1, "not moved");
    assert.equal(dragTargetIndex(mids, 1, 260), 2, "past the midpoint below");
    assert.equal(dragTargetIndex(mids, 1, 240), 1, "not yet past it");
    assert.equal(dragTargetIndex(mids, 3, 40), 0, "to the top");
    assert.equal(dragTargetIndex(mids, 0, 9999), 4, "to the bottom");
    assert.equal(dragTargetIndex(mids, 4, 140), 1);
    assert.equal(dragTargetIndex(undefined, 0, 0), 0);
  });
  it("sends the number of the card the dragged one lands on, gaps and all", () => {
    const {reorderQueueNumber} = load();
    assert.equal(reorderQueueNumber(ids, 0, 2, numbers), 4, "down onto #4");
    assert.equal(reorderQueueNumber(ids, 4, 1, numbers), 2, "up onto #2");
    assert.equal(reorderQueueNumber(ids, 2, 0, numbers), 1);
    assert.equal(reorderQueueNumber(ids, 1, 4, numbers), 9, "to the end of a filtered list takes the last card's number");
  });
  it("sends nothing when the card did not move or something is unknown", () => {
    const {reorderQueueNumber} = load();
    assert.equal(reorderQueueNumber(ids, 2, 2, numbers), null);
    assert.equal(reorderQueueNumber(ids, -1, 2, numbers), null);
    assert.equal(reorderQueueNumber(ids, 0, 5, numbers), null);
    assert.equal(reorderQueueNumber(ids, 0, 1, new Map()), null);
    assert.equal(reorderQueueNumber(ids, 0, 1, {}), null);
    assert.equal(reorderQueueNumber(null, 0, 1, numbers), null);
  });
  it("leaves the dragged task where its number says, whichever way it moved", () => {
    const {moveToQueueNumberInList, queueNumbers, reorderQueueNumber} = load();
    const tasks = ids.map((id, i) => ({id, order: i + 1}));
    const nums = queueNumbers(tasks);
    const down = moveToQueueNumberInList(tasks, "a", reorderQueueNumber(ids, 0, 2, nums));
    assert.deepEqual(down.map((t) => t.id), ["b", "c", "a", "d", "e"], "dropped on c, it sits after c");
    const up = moveToQueueNumberInList(tasks, "e", reorderQueueNumber(ids, 4, 1, nums));
    assert.deepEqual(up.map((t) => t.id), ["a", "e", "b", "c", "d"], "dropped on b, it sits before b");
  });
  it("keeps hidden tasks in their relative places when a filtered list is reordered", () => {
    const {moveToQueueNumberInList, queueNumbers, reorderQueueNumber} = load();
    const tasks = ["a", "h1", "b", "h2", "c"].map((id, i) => ({id, order: i + 1}));
    const nums = queueNumbers(tasks);
    const shown = ["a", "b", "c"];
    const moved = moveToQueueNumberInList(tasks, "c", reorderQueueNumber(shown, 2, 0, nums));
    assert.deepEqual(moved.map((t) => t.id), ["c", "a", "h1", "b", "h2"]);
  });
  it("matches the server's move exactly, including renumbering and clamping", () => {
    const {moveToQueueNumberInList} = load();
    const tasks = [{id: "x", order: 3}, {id: "y", order: 1}, {id: "z", order: 7}, {id: "w"}];
    for (const id of ["x", "y", "z", "w"]) {
      for (const n of [-3, 0, 1, 2, 3, 4, 5, 99]) {
        assert.deepEqual(moveToQueueNumberInList(tasks, id, n), moveToQueueNumber(tasks, id, n), `${id} to ${n}`);
      }
    }
    assert.equal(moveToQueueNumberInList(tasks, "nope", 1), null);
    assert.equal(moveToQueueNumberInList(tasks, "x", 1.5), null);
    assert.equal(moveToQueueNumberInList(tasks, "x", "2"), null);
  });
  it("does not modify the list it is given", () => {
    const {moveToQueueNumberInList} = load();
    const tasks = [{id: "a", order: 1}, {id: "b", order: 2}];
    const copy = JSON.parse(JSON.stringify(tasks));
    moveToQueueNumberInList(tasks, "b", 1);
    assert.deepEqual(tasks, copy);
  });
  it("words the Undo footnote with the task's new number", () => {
    const {reorderMessage} = load();
    assert.equal(reorderMessage("Fix gate", 3), "Moved “Fix gate” to #3");
    assert.equal(reorderMessage("", 1), "Moved task to #1");
    assert.match(reorderMessage("x".repeat(60), 2), /^Moved “x{39}…” to #2$/);
  });
  it("lifts a card after a hold of LONG_PRESS_MS for touch and mouse alike, with no other hold or drag threshold", () => {
    const {LONG_PRESS_MS, PRESS_MOVE_PX} = load();
    assert.equal(LONG_PRESS_MS, 500);
    assert.ok(PRESS_MOVE_PX > 0);
    assert.doesNotMatch(html, /REORDER_HOLD_MS|REORDER_MOUSE_PX/);
    const fn = html.slice(html.indexOf("function startReorderPress"), html.indexOf("function liftReorderCard"));
    assert.match(fn, /liftReorderCard\(d\);/);
    assert.doesNotMatch(fn, /setTimeout|pointerType/);
  });
  it("allows reordering only in the queue's own order: Task number, ascending", () => {
    const {reorderAllowed} = load();
    assert.equal(reorderAllowed("number", false), true);
    for (const key of ["scheduled", "priority", "added", "due", "name"]) assert.equal(reorderAllowed(key, false), false, key);
    assert.equal(reorderAllowed("number", true), false);
    assert.equal(reorderAllowed("scheduled", true), false);
    assert.equal(reorderAllowed(undefined, false), false);
  });
  it("shows a toast instead of lifting when the sort forbids it, for four seconds, and keeps the layout still", () => {
    const {TOAST_MS, REORDER_HINT_TEXT} = load();
    assert.equal(TOAST_MS, 4000);
    assert.equal(REORDER_HINT_TEXT, "Sort by Task number, ascending, to reorder cards.");
    assert.doesNotMatch(html, /reorderHint|reorder-hint/, "no inline hint in the Queue card");
    assert.match(html, /<div id="toast" class="toast" role="status" aria-live="polite"><\/div>/);
    assert.ok(html.indexOf("id=\"toast\"") > html.indexOf("id=\"undoNote\"") && html.indexOf("id=\"toast\"") < html.indexOf("id=\"editModal\""), "a page-level element after the footnote, outside the Queue card");
    const css = html.match(/\n\s*\.toast \{([^}]*)\}/)[1];
    assert.match(css, /position: fixed;/, "it takes no space in the layout");
    assert.match(css, /pointer-events: none;/, "it never takes a tap");
    assert.match(css, /z-index: 60;/);
    assert.match(css, /color: var\(--surface\); background: var\(--text-strong\);/, "themed for light and dark");
    assert.match(html, /\.toast\.show \{ opacity: 1; visibility: visible; \}/);
    assert.match(html, /body:has\(#undoNote:not\(\[hidden\]\)\) \.toast \{ bottom: calc\(64px/, "it floats above the Undo footnote");
    const show = html.slice(html.indexOf("function showToast"), html.indexOf("function hideToast"));
    assert.match(show, /el\.textContent = text;\s*el\.classList\.add\("show"\);/);
    assert.match(show, /clearTimeout\(toastTimer\);\s*toastTimer = setTimeout\(hideToast, TOAST_MS\);/, "a new toast replaces the last and restarts the clock");
    assert.match(html, /function hideToast\(\) \{\s*clearTimeout\(toastTimer\);\s*toastTimer = null;\s*document\.getElementById\("toast"\)\.classList\.remove\("show"\);/);
  });
  it("hides the toast at the next sort change and when Multi-Select starts", () => {
    assert.match(html, /sortKey = normalizeSortKey\(sortSelect\.value\);\s*hideToast\(\);/);
    assert.match(html, /sortDescending = !sortDescending;\s*syncSortControls\(\);\s*hideToast\(\);/);
    assert.match(html, /if \(on\) \{ setBatchStatus\(""\); hideToast\(\); \}/);
  });
  it("has no Reorder button, mode or grip, and leaves the sort controls enabled", () => {
    assert.doesNotMatch(html, /reorderModeBtn|reorderMode|setReorderMode|sortBeforeReorder|reorder-mark|\.reordering|"reordering"/);
    const row = html.slice(html.indexOf("<div class=\"select-row\">"), html.indexOf("id=\"batchStatus\""));
    assert.match(row, /id="selectModeBtn"/);
    assert.doesNotMatch(row, /Reorder/);
    const sync = html.slice(html.indexOf("function syncSortControls"), html.indexOf("function startReorderPress"));
    assert.doesNotMatch(sync, /disabled/);
    assert.match(html, /function setSelectMode\(on\) \{\s*selectMode = on;/);
  });
  it("lifts only queued cards outside Multi-Select, and still lets a queued card swipe and be tapped", () => {
    assert.match(html, /if \(selectMode && !isActive\) return `<div class="swipe-row">\$\{taskItemHtml\(t\)\}<\/div>`;/);
    const down = html.slice(html.indexOf("const onTaskRowDown"), html.indexOf("const onTaskRowMove"));
    assert.match(down, /if \(selectMode && !item\.closest\("#activeTaskBox"\)\) \{ swipe = null; return; \}/);
    assert.match(html, /document\.addEventListener\("keydown", e => \{ if \(e\.key === "Escape" && reorderDrag\) endReorderDrag\(false\); \}\);/);
  });
  it("saves a move through updateTaskDirect's queueNumber, in order, with no new endpoint", () => {
    const fn = html.slice(html.indexOf("function reorderTask"), html.indexOf("// Multi-Select. The selected tasks"));
    assert.match(fn, /DIRECT_UPDATE_URL/);
    assert.match(fn, /updatedFields: \{ queueNumber: number \}/);
    assert.match(fn, /reorderChain = reorderChain\.then/);
  });

  describe("address autocomplete (Google Places)", () => {
    const details = {
      id: "ChIJabc",
      formattedAddress: "12 Beach Road, Orewa, Auckland 0931, New Zealand",
      location: {latitude: -36.5871, longitude: 174.6945},
      addressComponents: [
        {longText: "12", types: ["street_number"]},
        {longText: "Beach Road", types: ["route"]},
        {longText: "Orewa", types: ["sublocality_level_1", "sublocality", "political"]},
        {longText: "Auckland", types: ["locality", "political"]},
        {longText: "0931", types: ["postal_code"]},
        {longText: "New Zealand", shortText: "NZ", types: ["country", "political"]},
      ],
    };
    it("asks Google only for fields of the cheapest Place Details tier", () => {
      const {PLACES_DETAILS_FIELDS} = load();
      const essentials = new Set(["id", "formattedAddress", "location", "addressComponents", "adrFormatAddress", "plusCode", "postalAddress", "types", "viewport", "shortFormattedAddress"]);
      for (const field of PLACES_DETAILS_FIELDS.split(",")) assert.ok(essentials.has(field), `${field} is not an Essentials field, so it would bill at a higher rate`);
      assert.match(PLACES_DETAILS_FIELDS, /location/);
      assert.match(PLACES_DETAILS_FIELDS, /formattedAddress/);
    });
    it("builds the autocomplete request", () => {
      const {autocompleteBody, PLACES_BIAS_RADIUS_M} = load();
      assert.deepEqual(autocompleteBody("  12   beach rd ", "tok", "NZ", {latitude: -36.63, longitude: 174.78}), {
        input: "12 beach rd", languageCode: "en", sessionToken: "tok", includedRegionCodes: ["nz"],
        locationBias: {circle: {center: {latitude: -36.63, longitude: 174.78}, radius: PLACES_BIAS_RADIUS_M}},
      });
      assert.ok(PLACES_BIAS_RADIUS_M <= 50000, "Google rejects a bias circle over 50 km");
      assert.deepEqual(autocompleteBody("12 beach", "", "", null), {input: "12 beach", languageCode: "en"});
      assert.deepEqual(autocompleteBody("x", "t", " ", {latitude: "a", longitude: 1}), {input: "x", languageCode: "en", sessionToken: "t"});
      assert.equal(autocompleteBody(undefined, "t").input, "");
    });
    it("builds the details URL with the session token and a safe place id", () => {
      const {placesDetailsUrl} = load();
      assert.equal(placesDetailsUrl("ChIJabc", "tok-1"), "https://places.googleapis.com/v1/places/ChIJabc?sessionToken=tok-1");
      assert.equal(placesDetailsUrl("ChIJabc"), "https://places.googleapis.com/v1/places/ChIJabc");
      assert.equal(placesDetailsUrl("a/b?c", "t"), "https://places.googleapis.com/v1/places/a%2Fb%3Fc?sessionToken=t");
    });
    it("makes a different session token each time", () => {
      const {newSessionToken} = load();
      const a = newSessionToken();
      assert.match(a, /^[A-Za-z0-9-]{8,36}$/);
      assert.notEqual(a, newSessionToken());
    });
    it("reads suggestions, skipping what is not a place prediction", () => {
      const {suggestionsFromAutocomplete} = load();
      const prediction = (id, main, secondary, full) => ({placePrediction: {placeId: id, text: {text: full}, structuredFormat: {mainText: {text: main}, secondaryText: {text: secondary}}}});
      const data = {suggestions: [
        prediction("p1", "12 Beach Road", "Orewa, Auckland, New Zealand", "12 Beach Road, Orewa, Auckland, New Zealand"),
        {queryPrediction: {text: {text: "beach road"}}},
        {placePrediction: {text: {text: "no id"}}},
        {placePrediction: {placeId: "p2", text: {text: "Bunnings Silverdale, Silverdale"}}},
        {placePrediction: {placeId: "p3"}},
        null,
      ]};
      assert.deepEqual(suggestionsFromAutocomplete(data), [
        {placeId: "p1", text: "12 Beach Road, Orewa, Auckland, New Zealand", main: "12 Beach Road", secondary: "Orewa, Auckland, New Zealand"},
        {placeId: "p2", text: "Bunnings Silverdale, Silverdale", main: "Bunnings Silverdale, Silverdale", secondary: ""},
      ]);
      const many = {suggestions: Array.from({length: 9}, (_, i) => prediction("p" + i, "m" + i, "s", "m" + i + ", s"))};
      assert.equal(suggestionsFromAutocomplete(many).length, 5);
      for (const none of [{}, {suggestions: null}, null, undefined, "x"]) assert.deepEqual(suggestionsFromAutocomplete(none), []);
    });
    it("turns a place into a location name and a position, without the country", () => {
      const {placeFromDetails} = load();
      assert.deepEqual(placeFromDetails(details), {name: "12 Beach Road, Orewa, Auckland 0931", latitude: -36.5871, longitude: 174.6945});
    });
    it("keeps the whole address when there is no country component or it does not end the address, and cuts to 200 characters", () => {
      const {placeFromDetails} = load();
      const bare = {formattedAddress: "Orewa Beach, Orewa 0931", location: {latitude: -36.58, longitude: 174.7}};
      assert.deepEqual(placeFromDetails(bare), {name: "Orewa Beach, Orewa 0931", latitude: -36.58, longitude: 174.7});
      assert.equal(placeFromDetails({...details, formattedAddress: "12 Beach Road, New Zealand Post, Orewa"}).name, "12 Beach Road, New Zealand Post, Orewa");
      assert.equal(placeFromDetails({...bare, formattedAddress: "x".repeat(260)}).name.length, 200);
    });
    it("refuses a place without a position or an address", () => {
      const {placeFromDetails} = load();
      assert.equal(placeFromDetails({...details, location: undefined}), null);
      assert.equal(placeFromDetails({...details, location: {latitude: "1", longitude: 2}}), null);
      assert.equal(placeFromDetails({...details, formattedAddress: "  "}), null);
      assert.equal(placeFromDetails({...details, formattedAddress: undefined}), null);
      for (const none of [null, undefined, "x", 5]) assert.equal(placeFromDetails(none), null);
      assert.ok(placeFromDetails({...details, addressComponents: "nope"}), "bad components are ignored, not fatal");
    });
    it("fills the Clients form's Location text and map position from a place, and never an Address", () => {
      const {placeFromDetails, clientFillFromPlace, placeLocation} = load();
      const place = placeFromDetails(details);
      assert.deepEqual(clientFillFromPlace(place), {locationText: "12 Beach Road, Orewa, Auckland 0931", coords: {latitude: -36.5871, longitude: 174.6945, label: "12 Beach Road, Orewa, Auckland 0931"}});
      assert.deepEqual(placeLocation(place), {name: "12 Beach Road, Orewa, Auckland 0931", latitude: -36.5871, longitude: 174.6945});
    });
    it("shows Google's own error text, else the status", () => {
      const {placesErrorText} = load();
      assert.equal(placesErrorText(403, {error: {message: "Requests from referer  are blocked."}}), "Requests from referer are blocked.");
      assert.equal(placesErrorText(500, null), "Request failed (500)");
      assert.equal(placesErrorText(400, {error: {message: "  "}}), "Request failed (400)");
      assert.equal(placesErrorText(400, {error: {message: "x".repeat(500)}}).length, 200);
    });
    it("calls Google from the page with the key, never with the Firebase token", () => {
      const widget = html.slice(html.indexOf("function makePlacesAutocomplete("), html.indexOf("// Save a Blob as a file download."));
      assert.ok(widget.length > 100);
      assert.doesNotMatch(widget, /apiFetch|Authorization/);
      assert.equal((widget.match(/await fetch\(/g) || []).length, 2, "one autocomplete and one details request");
      assert.match(widget, /const context = getContext \? getContext\(\) : undefined;/, "what was chosen is read when the suggestion is tapped, not when Google answers");
      assert.match(widget, /onPick\(place, context\)/);
      assert.match(widget, /"X-Goog-Api-Key": CONFIG\.placesApiKey/);
      assert.match(widget, /"X-Goog-FieldMask": PLACES_DETAILS_FIELDS/);
      assert.match(widget, /token = newSessionToken\(\); \/\/ the details request ends the session/);
      assert.match(widget, /Powered by Google/, "Google requires its attribution next to suggestions shown without a map");
    });
    it("keeps the key and region in CONFIG, off by default", () => {
      assert.match(html, /placesApiKey: "",/);
      assert.match(html, /placesRegion: "nz"/);
      assert.match(html, /if \(CONFIG\.placesApiKey\) \{\s*\/\/ With a Places key/);
      assert.equal((html.match(/places\.googleapis\.com/g) || []).length, 2, "the two Places endpoints, nowhere else");
    });
  });

  describe("client Address field removed, project Location row", () => {
    const where = (name) => ({name, latitude: -36.6, longitude: 174.7});
    it("has no Address box, Use address button or address text in the Clients form", () => {
      assert.doesNotMatch(html, /clientAddress|clientUseAddressBtn|addressAsLocation|addressText/);
      assert.doesNotMatch(html, /<label for="clientAddress"/);
      assert.match(load().clientFormHtml("client"), /<label for="clientLocation">Location<\/label>/);
    });
    it("keeps effectiveLocation in the page equal to the one in functions/location.js", () => {
      const {effectiveLocation} = load();
      const server = require("../location").effectiveLocation;
      const owners = [undefined, null, {}, {title: "T", name: "N"}, {title: "T", name: "N", location: where("Here")}, {name: "N", location: {name: "  A   B "}}, {name: "N", location: {name: "Label only"}},
        {name: "N", location: {name: "x", latitude: 5}}, {name: "N", location: {name: "x", latitude: 99, longitude: 0}}, {name: "N", location: {name: "x".repeat(201)}},
        {name: "N", location: "text"}, {name: "N", location: []}, {name: "N", location: {name: 5}}, {name: "N", location: {latitude: 1, longitude: 2}}, {title: "T", location: null}];
      for (const a of owners) {
        for (const b of owners) {
          for (const c of [owners[0], owners[4], owners[6], owners[8]]) {
            assert.deepEqual(effectiveLocation(a, b, c), server(a, b, c), JSON.stringify([a, b, c]));
          }
        }
      }
    });
    it("shows the project's own location, with its map position", () => {
      const {projectLocationView} = load();
      assert.deepEqual(projectLocationView({id: "p1", name: "Reno", location: where("12 Beach Road")}, {name: "Smith Ltd", location: where("Client place")}), {value: "12 Beach Road", hasOwn: true, note: "📍 Map position set."});
      assert.deepEqual(projectLocationView({id: "p1", name: "Reno", location: {name: "Smith's yard"}}, null), {value: "Smith's yard", hasOwn: true, note: "No map position: pick a suggestion to set one."});
    });
    it("says where an inherited location comes from, with the box left empty", () => {
      const {projectLocationView} = load();
      assert.deepEqual(projectLocationView({id: "p1", name: "Reno"}, {name: "Smith Ltd", location: where("12 Beach Road")}), {value: "", hasOwn: false, note: "From client: Smith Ltd · 12 Beach Road"});
    });
    it("has nothing to show when neither the project nor its client has a location", () => {
      const {projectLocationView} = load();
      const none = {value: "", hasOwn: false, note: "No location yet. Pick an address to set one."};
      assert.deepEqual(projectLocationView({id: "p1", name: "Reno"}, null), none);
      assert.deepEqual(projectLocationView({id: "p1", name: "Reno"}, {name: "Smith Ltd"}), none);
      assert.deepEqual(projectLocationView(undefined, undefined), none);
    });
    it("reads a task form's Location box: empty is none, a picked place keeps its position, typed text is a name only", () => {
      const {locationFromBox} = load();
      const picked = where("12 Beach Road");
      assert.equal(locationFromBox("", picked), null);
      assert.equal(locationFromBox("   ", null), null);
      assert.equal(locationFromBox(undefined, null), null);
      assert.deepEqual(locationFromBox("12 Beach Road", picked), picked);
      assert.deepEqual(locationFromBox("  12   Beach Road ", picked), picked, "whitespace does not make it another place");
      assert.deepEqual(locationFromBox("14 Beach Road", picked), {name: "14 Beach Road"}, "edited text loses the old position");
      assert.deepEqual(locationFromBox("Garage", null), {name: "Garage"});
      assert.equal(locationFromBox("x".repeat(250), null).name.length, 200);
    });
    it("tells where a task's location comes from while it has none of its own", () => {
      const {taskLocationView} = load();
      const projects = [{id: "p1", name: "Kitchen reno", clientId: "c1"}, {id: "p2", name: "Deck", clientId: "c1", location: where("Deck site")}, {id: "p3", name: "Solo"}];
      const clients = [{id: "c1", name: "Smith Ltd", location: where("12 Beach Road")}];
      assert.deepEqual(taskLocationView(null, "p1", projects, clients), {note: "From client: Smith Ltd", address: "12 Beach Road"});
      assert.deepEqual(taskLocationView(null, "p2", projects, clients), {note: "From project: Deck", address: "Deck site"});
      assert.deepEqual(taskLocationView(null, "p3", projects, clients), {note: "", address: ""});
      assert.deepEqual(taskLocationView(null, "", projects, clients), {note: "", address: ""});
      assert.deepEqual(taskLocationView(null, "gone", undefined, undefined), {note: "", address: ""});
    });
    it("tells whether a task's own location has a map position", () => {
      const {taskLocationView} = load();
      assert.deepEqual(taskLocationView(where("Here"), "", [], []), {note: "📍 Map position set.", address: ""});
      assert.deepEqual(taskLocationView({name: "Label"}, "", [], []), {note: "No map position: pick a suggestion to set one.", address: ""});
    });
    it("gives a task row a 📍 chip with its effective location, task first, then project, then client", () => {
      const {taskLocationChip} = load();
      const projects = [{id: "p1", name: "Kitchen reno", clientId: "c1"}, {id: "p2", name: "Deck", location: where("Deck site")}];
      const clients = [{id: "c1", name: "Smith Ltd", location: where("12 Beach Road")}];
      assert.deepEqual(taskLocationChip({id: "t", title: "Tap", projectId: "p1", location: where("Garage")}, projects, clients), {text: "Garage", title: "Where this task is"});
      assert.deepEqual(taskLocationChip({id: "t", title: "Tap", projectId: "p2"}, projects, clients), {text: "Deck site", title: "From project: Deck"});
      assert.deepEqual(taskLocationChip({id: "t", title: "Tap", projectId: "p1"}, projects, clients), {text: "12 Beach Road", title: "From client: Smith Ltd"});
      assert.equal(taskLocationChip({id: "t", title: "Tap"}, projects, clients), null);
      assert.equal(taskLocationChip(null, [], []), null);
    });
    it("builds a Google Maps directions link from a location's text, else its coordinates, else nothing", () => {
      const {navigationHref} = load();
      const base = "https://www.google.com/maps/dir/?api=1&destination=";
      assert.equal(navigationHref(where("12 Beach Road, Orewa")), base + encodeURIComponent("12 Beach Road, Orewa"));
      assert.equal(navigationHref({name: "  Smith's   yard & shed "}), base + encodeURIComponent("Smith's yard & shed"));
      assert.equal(navigationHref({name: " ", latitude: -36.6, longitude: 174.7}), base + encodeURIComponent("-36.6,174.7"));
      for (const v of [null, undefined, "text", 5, {}, {name: "  "}, {name: 5}, {name: "", latitude: -36.6}]) assert.equal(navigationHref(v), "", JSON.stringify(v));
    });
    it("points a task form at its own location, else its project's, else its client's", () => {
      const {formLocation} = load();
      const projects = [{id: "p1", name: "Reno", clientId: "c1"}, {id: "p2", name: "Deck", clientId: "c1", location: where("Deck site")}, {id: "p3", name: "Solo"}];
      const clients = [{id: "c1", name: "Smith Ltd", location: where("12 Beach Road")}];
      assert.deepEqual(formLocation(where("Garage"), "p2", projects, clients), where("Garage"));
      assert.deepEqual(formLocation(null, "p2", projects, clients), where("Deck site"));
      assert.deepEqual(formLocation(null, "p1", projects, clients), where("12 Beach Road"));
      assert.equal(formLocation(null, "p3", projects, clients), null);
      assert.equal(formLocation(null, "", projects, clients), null);
      assert.equal(formLocation(null, "p1", undefined, undefined), null);
    });
    it("starts the completed task form from the row's own location and sends it only when it differs", () => {
      const {completedChanges, completedFormValues} = load();
      const zone = "Pacific/Auckland";
      const row = {title: "Fit tap", priority: "LOW", estimatedMinutes: 30, trackedSeconds: 0, location: where("12 Beach Road"), completedAt: "2026-10-17T20:30:00.000Z"};
      const form = () => ({...completedFormValues(row, zone)});
      assert.deepEqual(form().location, where("12 Beach Road"));
      assert.deepEqual(completedChanges(row, form(), zone), {fields: {}});
      assert.deepEqual(completedChanges(row, {...form(), location: where("14 Beach Road")}, zone), {fields: {location: where("14 Beach Road")}});
      assert.deepEqual(completedChanges(row, {...form(), location: {name: "Garage"}}, zone), {fields: {location: {name: "Garage"}}});
      assert.deepEqual(completedChanges(row, {...form(), location: null}, zone), {fields: {location: null}});
      const {location, ...bare} = row; // eslint-disable-line no-unused-vars
      assert.equal(completedFormValues(bare, zone).location, null);
      assert.deepEqual(completedChanges(bare, {...completedFormValues(bare, zone), location: null}, zone), {fields: {}});
      assert.deepEqual(completedChanges(row, (({location: l, ...rest}) => rest)(form()), zone), {fields: {}}, "a form without the key leaves it alone");
    });
    it("has a Navigate button in both edit modals, and a Location field in the completed task's form", () => {
      for (const prefix of ["edit", "ce"]) {
        assert.match(html, new RegExp(`id="${prefix}Navigate" class="contact-btn btn-secondary"`));
        assert.match(html, new RegExp(`id="${prefix}NavigateActions" hidden`));
      }
      assert.doesNotMatch(html, /id="manualNavigate"/);
      assert.match(html, /<label for="ceLocation">Location<\/label>/);
      assert.match(html, /location: locationFromBox\(document\.getElementById\("ceLocation"\)\.value, pickedLocation\.ce\),/);
      assert.match(html, /navigate\.href = where \|\| "#";/);
    });
    it("puts a Location field in the add form and the edit modal, and the 📍 chip on task rows", () => {
      for (const prefix of ["manual", "edit"]) {
        assert.match(html, new RegExp(`<label for="${prefix}Location">Location</label>`));
        for (const id of ["Location", "PlaceSearchBtn", "LocationClearBtn", "PlaceResults", "LocationNote"]) assert.match(html, new RegExp(`id="${prefix}${id}"`));
      }
      assert.match(html, /\$\{locationChip\(t\)\}/);
    });
    it("sends a task's location with a manual add and, when changed, with an edit", () => {
      assert.match(html, /if \(form\.location\) manual\.location = form\.location;/);
      assert.match(html, /location: locationFromBox\(document\.getElementById\("manualLocation"\)\.value, pickedLocation\.manual\),/);
      assert.match(html, /updatedFields\.location = location;/);
    });
    it("changes the key that decides when the box is rewritten only for another project or its own location", () => {
      const {projectLocationKey} = load();
      const a = {id: "p1", name: "Reno"};
      assert.equal(projectLocationKey({...a, name: "Renamed", clientId: "c2"}), projectLocationKey(a), "a rename or a client change leaves typed text alone");
      assert.notEqual(projectLocationKey({...a, location: where("X")}), projectLocationKey(a));
      assert.notEqual(projectLocationKey({...a, location: where("X")}), projectLocationKey({...a, location: where("Y")}));
      assert.notEqual(projectLocationKey({id: "p2"}), projectLocationKey({id: "p1"}));
      assert.equal(projectLocationKey(null), "");
    });
    it("reads a link as the server's normalizeUrl does", () => {
      const page = load();
      const samples = [null, undefined, "", "   ", "example.com", " example.com/menu ", "https://example.com/a?b=1#c", "http://example.com", "HTTPS://Example.com", "localhost:3000", "localhost:3000/x", "192.168.1.5:8080/status",
        "javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,hi", "mailto:a@b.co", "tel:021", "ftp://example.com", "file:///etc/passwd", "ex ample.com", "a b", "https://", "http:///x", "://x", "https://exa mple.com", "x".repeat(500), "x".repeat(501),
        `https://example.com/${"a".repeat(480)}`, `https://example.com/${"a".repeat(490)}`, 5, {}, [], true];
      for (const value of samples) assert.equal(page.normalizeUrl(value), serverNormalizeUrl(value), JSON.stringify(value));
      assert.equal(page.MAX_URL_LENGTH, 500);
    });
    it("reads a typed Link box: none for empty, the saved form for a usable link, undefined for a bad one", () => {
      const {parseUrlText} = load();
      for (const empty of ["", "   ", null, undefined]) assert.equal(parseUrlText(empty), null, JSON.stringify(empty));
      assert.equal(parseUrlText(" example.com/menu "), "https://example.com/menu");
      assert.equal(parseUrlText("http://example.com/a"), "http://example.com/a");
      for (const bad of ["javascript:alert(1)", "mailto:a@b.co", "two words.com", "x".repeat(501), "https://"]) assert.equal(parseUrlText(bad), undefined, bad);
    });
    it("tells what a bad link needs", () => {
      const {INVALID_URL} = load();
      assert.match(INVALID_URL, /http or https/);
      assert.match(INVALID_URL, /empty/);
    });
    it("shows a project's own link, else its client's, else none", () => {
      const {projectUrlView} = load();
      const client = {id: "c1", name: " Smith Ltd ", url: "https://smith.example/jobs"};
      assert.deepEqual(projectUrlView({id: "p1", name: "Reno", url: "https://reno.example/plan"}, client), {value: "https://reno.example/plan", hasOwn: true, note: "🔗 Link set."});
      assert.deepEqual(projectUrlView({id: "p1", name: "Reno", clientId: "c1"}, client), {value: "", hasOwn: false, note: "From client: Smith Ltd · https://smith.example/jobs"});
      assert.deepEqual(projectUrlView({id: "p1", name: "Reno"}, {id: "c1", name: "Smith Ltd"}), {value: "", hasOwn: false, note: "No link yet. Add one to set it."});
      assert.deepEqual(projectUrlView({id: "p1", name: "Reno"}, null), {value: "", hasOwn: false, note: "No link yet. Add one to set it."});
      assert.equal(projectUrlView({id: "p1", url: "javascript:alert(1)"}, {name: "C", url: "javascript:alert(1)"}).hasOwn, false, "an unusable stored link is not shown");
      assert.equal(projectUrlView(null, null).note, "No link yet. Add one to set it.");
    });
    it("changes the key that decides when the Link box is rewritten only for another project or its own link", () => {
      const {projectUrlKey} = load();
      const a = {id: "p1", name: "Reno"};
      assert.equal(projectUrlKey({...a, name: "Renamed", clientId: "c2", location: {name: "X"}}), projectUrlKey(a), "a rename, a client or a location change leaves typed text alone");
      assert.notEqual(projectUrlKey({...a, url: "https://x.example"}), projectUrlKey(a));
      assert.notEqual(projectUrlKey({...a, url: "https://x.example"}), projectUrlKey({...a, url: "https://y.example"}));
      assert.notEqual(projectUrlKey({id: "p2"}), projectUrlKey({id: "p1"}));
      assert.equal(projectUrlKey(null), "");
    });
    it("sends the client form's link as typed, empty for none", () => {
      const {clientFormBody} = load();
      assert.equal(clientFormBody({name: "Jo", url: "  example.com/job "}).url, "example.com/job");
      for (const url of [undefined, null, "", "  ", 5]) assert.equal(clientFormBody({name: "Jo", url}).url, "", JSON.stringify(url));
    });
    it("has a Link box in the client form and a Link row under the chosen project's Location, each warning on a bad link", () => {
      assert.match(load().clientFormHtml("client"), /<input type="url" id="clientUrl" maxlength="500"/);
      assert.match(html, /<div class="project-location" id="projectUrl" hidden>/);
      assert.ok(html.indexOf("id=\"projectLocation\"") < html.indexOf("id=\"projectUrl\"") && html.indexOf("id=\"projectUrl\"") < html.indexOf("id=\"projectTemplateAction\""), "after Location, before Save as template");
      assert.match(html, /const warning = clientFormWarning\(client\);\s*if \(warning\) \{ askAlert\(warning, \{ tone: "warning" \}\); return; \}/);
      assert.match(html, /if \(url === undefined\) \{ await askAlert\(INVALID_URL, \{ tone: "warning" \}\); return false; \}/);
      assert.match(html, /saveProject\(\{ action: "SET_URL", projectId, url \}/);
      assert.match(html, /renderProjectUrl\(chosen\);/);
    });
    it("has a fixed Location row under the chosen project, bound once", () => {
      assert.match(html, /<div class="project-location" id="projectLocation" hidden>/);
      assert.ok(html.indexOf("id=\"projectActions\"") < html.indexOf("id=\"projectLocation\"") && html.indexOf("id=\"projectLocation\"") < html.indexOf("id=\"projectTemplateAction\""), "after Client, before Save as template");
      const render = html.slice(html.indexOf("function renderProjects()"), html.indexOf("let projectLocationShown"));
      assert.doesNotMatch(render, /projectLocationInput/, "the markup is not rebuilt by a redraw");
      assert.match(html, /if \(key !== projectLocationShown\) \{\s*projectLocationShown = key;\s*document\.getElementById\("projectLocationInput"\)\.value = view\.value;/);
      assert.match(html, /projectPlaces = makePlacesAutocomplete\(\{ queryId: "projectLocationInput", resultsId: "projectPlaceResults"[^\n]*getContext: \(\) => selectedProjectFilter, onPick: \(place, projectId\) => setProjectLocation\(projectId, placeLocation\(place\)\)/);
      assert.match(html, /makePlaceSearch\(\{ queryId: "projectLocationInput", buttonId: "projectPlaceSearchBtn", resultsId: "projectPlaceResults", showZone: false, queries: placeQueries, clearQuery: false/, "the Open-Meteo search stays as the fallback without a key");
    });
    it("saves a pick through SET_LOCATION and Clear sends null", () => {
      assert.match(html, /saveProject\(\{ action: "SET_LOCATION", projectId, location \}, location \? "Saved\." : "Location cleared\."\)/);
      assert.match(html, /projectLocationClearBtn"\)\.addEventListener\("click", \(\) => setProjectLocation\(selectedProjectFilter, null\)\)/);
    });
    it("keeps Rename, Delete and Save as template working from both containers", () => {
      assert.match(html, /for \(const id of \["projectActions", "projectTemplateAction"\]\)/);
      assert.match(html, /id="projectTemplateAction"/);
    });
  });
});

describe("offline add queue (page)", () => {
  const {ADD_QUEUE_KEY, ADD_QUEUE_MAX, newRequestId, makeQueuedAdd, parseQueue, serializeQueue, isNetworkError, drainQueue} = load();
  const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
  const rid = (n) => `req-${String(n).padStart(6, "0")}`;
  const manualAdd = (n, extra = {}) => makeQueuedAdd({kind: "MANUAL", body: {manual: {title: `Task ${n}`, priority: "HIGH"}}, now: "2026-10-27T08:00:00.000Z", requestId: rid(n), ...extra});
  const textAdd = (n) => makeQueuedAdd({kind: "TEXT", body: {input: `Add thing ${n}`, allowProposal: true}, now: "2026-10-27T08:00:00.000Z", requestId: rid(n)});
  const netError = () => Object.assign(new TypeError("Failed to fetch"), {});

  it("keeps the queue under one storage key, 50 items at most", () => {
    assert.equal(ADD_QUEUE_KEY, "taskhub-add-queue");
    assert.equal(ADD_QUEUE_MAX, 50);
  });

  describe("newRequestId", () => {
    it("makes an id the server accepts, a different one each time", () => {
      const a = newRequestId();
      const b = newRequestId();
      assert.match(a, ID_PATTERN);
      assert.match(b, ID_PATTERN);
      assert.notEqual(a, b);
    });
    it("uses the given generator, and falls back when it gives something the server would refuse", () => {
      assert.equal(newRequestId(() => "3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f"), "3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f");
      assert.match(newRequestId(() => "no good!"), ID_PATTERN);
      assert.match(newRequestId(() => 42), ID_PATTERN);
    });
  });

  describe("makeQueuedAdd", () => {
    it("queues a manual entry as a PENDING item whose body carries the entry and the request id only", () => {
      const item = makeQueuedAdd({kind: "MANUAL", body: {manual: {title: "Fix gate", priority: "HIGH"}, startNow: true, allowProposal: true}, now: "2026-10-27T08:00:00.000Z", requestId: rid(1)});
      assert.deepEqual(item, {requestId: rid(1), kind: "MANUAL", body: {manual: {title: "Fix gate", priority: "HIGH"}, requestId: rid(1)}, label: "Fix gate", queuedAt: "2026-10-27T08:00:00.000Z", status: "PENDING"});
    });
    it("queues free text without allowProposal or startNow", () => {
      const item = makeQueuedAdd({kind: "TEXT", body: {input: "Mow the lawn friday", allowProposal: true, startNow: true}, now: "2026-10-27T08:00:00.000Z", requestId: rid(2)});
      assert.deepEqual(item.body, {input: "Mow the lawn friday", requestId: rid(2)});
      assert.equal(item.kind, "TEXT");
      assert.equal(item.label, "Mow the lawn friday");
      assert.equal(item.status, "PENDING");
      assert.equal("error" in item, false);
    });
    it("makes a request id when none is given, and has no time without one", () => {
      const item = makeQueuedAdd({kind: "TEXT", body: {input: "x y z"}});
      assert.match(item.requestId, ID_PATTERN);
      assert.equal(item.body.requestId, item.requestId);
      assert.equal(item.queuedAt, "");
    });
    it("shows the title on one line, cut to 100 characters", () => {
      assert.equal(manualAdd(1, {body: {manual: {title: "  Fix   the\n gate  "}}}).label, "Fix the gate");
      const long = makeQueuedAdd({kind: "TEXT", body: {input: "a".repeat(150)}, requestId: rid(3)});
      assert.equal(long.label.length, 100);
      assert.ok(long.label.endsWith("…"));
    });
    it("is null for an add that cannot be sent", () => {
      for (const args of [
        {kind: "MANUAL", body: {manual: {title: "  "}}},
        {kind: "MANUAL", body: {manual: "x"}},
        {kind: "MANUAL", body: {manual: [{title: "a"}]}},
        {kind: "MANUAL", body: {input: "text"}},
        {kind: "TEXT", body: {input: "   "}},
        {kind: "TEXT", body: {manual: {title: "a"}}},
        {kind: "OTHER", body: {input: "a"}},
        {kind: "TEXT", body: null},
        {kind: "TEXT", body: {input: "ok"}, requestId: "short"},
        {kind: "TEXT", body: {input: "ok"}, requestId: 12345678},
      ]) assert.equal(makeQueuedAdd({now: "x", ...args}), null, JSON.stringify(args));
    });
  });

  describe("parseQueue and serializeQueue", () => {
    it("round-trips a queue of both kinds, in order", () => {
      const queue = [manualAdd(1), textAdd(2), {...manualAdd(3), status: "FAILED", error: "A project named \"X\" already exists"}];
      assert.deepEqual(parseQueue(serializeQueue(queue)), queue);
    });
    it("stores nothing but an empty list for an empty queue", () => {
      assert.equal(serializeQueue([]), "[]");
      assert.equal(serializeQueue(undefined), "[]");
      assert.deepEqual(parseQueue("[]"), []);
    });
    it("gives an empty queue for missing, unusable or non-list text", () => {
      for (const text of [undefined, null, "", "not json", "{", "{}", "42", "null", "\"x\"", "{\"a\":1}"]) assert.deepEqual(parseQueue(text), [], String(text));
    });
    it("drops items that cannot be sent and keeps the rest", () => {
      const good = manualAdd(1);
      const stored = JSON.stringify([
        null, 7, "x", [], {},
        {...good, requestId: rid(10), body: {...good.body, requestId: rid(10)}, status: "DONE"},
        {...good, requestId: rid(11)}, // body carries another id
        {...good, requestId: rid(12), body: {manual: {title: ""}, requestId: rid(12)}},
        {...good, requestId: rid(13), kind: "ELSE", body: {...good.body, requestId: rid(13)}},
        good,
      ]);
      assert.deepEqual(parseQueue(stored), [good]);
    });
    it("keeps only the first of a repeated request id", () => {
      const a = manualAdd(1);
      const queue = parseQueue(JSON.stringify([a, {...a, label: "again"}]));
      assert.equal(queue.length, 1);
      assert.equal(queue[0].label, a.label);
    });
    it("keeps the oldest 50 when there are more", () => {
      const many = Array.from({length: ADD_QUEUE_MAX + 5}, (_, i) => manualAdd(i + 1));
      const queue = parseQueue(JSON.stringify(many));
      assert.equal(queue.length, ADD_QUEUE_MAX);
      assert.equal(queue[0].requestId, rid(1));
      assert.equal(queue[ADD_QUEUE_MAX - 1].requestId, rid(ADD_QUEUE_MAX));
      assert.equal(JSON.parse(serializeQueue(many)).length, ADD_QUEUE_MAX);
    });
    it("keeps the error of a FAILED item only, with a default when it has none", () => {
      const failed = {...manualAdd(1), status: "FAILED"};
      assert.equal(parseQueue(JSON.stringify([failed]))[0].error, "Not sent");
      assert.equal(parseQueue(JSON.stringify([{...failed, error: "  Nope  "}]))[0].error, "Nope");
      assert.equal(parseQueue(JSON.stringify([{...failed, error: "e".repeat(500)}]))[0].error.length, 300);
      assert.equal("error" in parseQueue(JSON.stringify([{...manualAdd(2), error: "stale"}]))[0], false);
    });
    it("rebuilds the body from its entry and request id, so stored extras do not get sent", () => {
      const item = manualAdd(1);
      const stored = {...item, body: {...item.body, startNow: true, allowProposal: true, apply: {changes: []}}};
      assert.deepEqual(parseQueue(JSON.stringify([stored]))[0].body, item.body);
    });
    it("supplies a label and time when the stored ones are unusable", () => {
      const item = manualAdd(1);
      const [clean] = parseQueue(JSON.stringify([{...item, label: 5, queuedAt: 7}]));
      assert.equal(clean.label, "Task 1");
      assert.equal(clean.queuedAt, "");
    });
  });

  describe("isNetworkError", () => {
    it("is true for a failed fetch in any browser's words", () => {
      for (const message of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", "Network request failed", "The network connection was lost.", "The Internet connection appears to be offline."]) {
        assert.equal(isNetworkError(new TypeError(message)), true, message);
      }
    });
    it("is true when Firebase could not reach Auth for a token", () => {
      assert.equal(isNetworkError(Object.assign(new Error("Firebase: Error (auth/network-request-failed)."), {code: "auth/network-request-failed"})), true);
    });
    it("is true for any error while the browser says it is offline", () => {
      assert.equal(isNetworkError(new Error("anything"), false), true);
      assert.equal(isNetworkError(null, false), true);
    });
    it("is false for the server's answers", () => {
      for (const message of ["Request failed (500)", "A manual entry needs a title", "Your sign-in was rejected. Please sign in again.", "Not signed in", "Failed to fetch"]) {
        assert.equal(isNetworkError(new Error(message)), false, message);
        assert.equal(isNetworkError(new Error(message), true), false, message);
      }
    });
    it("is false for a TypeError that is a bug and not a failed fetch, and for non-errors", () => {
      assert.equal(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')")), false);
      for (const v of [undefined, null, "Failed to fetch", 0, {}]) assert.equal(isNetworkError(v), false, String(v));
      assert.equal(isNetworkError(new Error("auth/other"), true), false);
      assert.equal(isNetworkError(Object.assign(new Error("x"), {code: "auth/user-token-expired"})), false);
    });
  });

  describe("drainQueue", () => {
    it("sends the PENDING items oldest first, one at a time, and empties the queue", async () => {
      const queue = [manualAdd(1), textAdd(2), manualAdd(3)];
      const order = [];
      let running = 0;
      let overlap = false;
      const send = async (item) => {
        if (++running > 1) overlap = true;
        order.push(item.requestId);
        await Promise.resolve();
        running--;
        return {success: true, tasks: [{id: item.requestId}]};
      };
      const out = await drainQueue(queue, send);
      assert.deepEqual(order, [rid(1), rid(2), rid(3)]);
      assert.equal(overlap, false);
      assert.deepEqual(out.queue, []);
      assert.equal(out.stopped, false);
      assert.deepEqual(out.sent.map((s) => s.item.requestId), [rid(1), rid(2), rid(3)]);
      assert.deepEqual(out.sent[2].data.tasks, [{id: rid(3)}]);
    });
    it("sends the item as queued, request id included", async () => {
      let seen;
      await drainQueue([textAdd(1)], async (item) => {
        seen = item.body;
        return {success: true};
      });
      assert.deepEqual(seen, {input: "Add thing 1", requestId: rid(1)});
    });
    it("counts a duplicate answer as sent", async () => {
      const out = await drainQueue([manualAdd(1)], async () => ({success: true, duplicate: true, added: 0, tasks: []}));
      assert.deepEqual(out.queue, []);
      assert.equal(out.sent.length, 1);
      assert.equal(out.sent[0].data.duplicate, true);
    });
    it("stops at a network error and keeps that item and the later ones as they were", async () => {
      const queue = [manualAdd(1), manualAdd(2), manualAdd(3), manualAdd(4)];
      const calls = [];
      const out = await drainQueue(queue, async (item) => {
        calls.push(item.requestId);
        if (item.requestId === rid(2)) throw netError();
        return {success: true};
      });
      assert.deepEqual(calls, [rid(1), rid(2)]);
      assert.equal(out.stopped, true);
      assert.deepEqual(out.queue, [queue[1], queue[2], queue[3]]);
      assert.deepEqual(out.sent.map((s) => s.item.requestId), [rid(1)]);
    });
    it("stops and keeps the item, FAILED mark left off, for an error marked keepQueued", async () => {
      const queue = [manualAdd(1), manualAdd(2)];
      const out = await drainQueue(queue, async () => {
        throw Object.assign(new Error("Your sign-in was rejected. Please sign in again."), {keepQueued: true});
      });
      assert.equal(out.stopped, true);
      assert.deepEqual(out.queue, queue);
      assert.deepEqual(out.sent, []);
    });
    it("does not keep an item for keepQueued set to anything but true", async () => {
      const out = await drainQueue([manualAdd(1)], async () => {
        throw Object.assign(new Error("odd"), {keepQueued: "yes"});
      });
      assert.equal(out.stopped, false);
      assert.equal(out.queue[0].status, "FAILED");
    });
    it("marks an item FAILED with the server's message and carries on", async () => {
      const queue = [manualAdd(1), manualAdd(2), manualAdd(3)];
      const out = await drainQueue(queue, async (item) => {
        if (item.requestId === rid(2)) throw new Error("A project named \"Deck\" already exists");
        return {success: true};
      });
      assert.equal(out.stopped, false);
      assert.equal(out.queue.length, 1);
      assert.deepEqual(out.queue[0], {...queue[1], status: "FAILED", error: "A project named \"Deck\" already exists"});
      assert.deepEqual(out.sent.map((s) => s.item.requestId), [rid(1), rid(3)]);
    });
    it("gives an error without text the default reason", async () => {
      const out = await drainQueue([manualAdd(1)], async () => {
        throw new Error("  ");
      });
      assert.equal(out.queue[0].status, "FAILED");
      assert.equal(out.queue[0].error, "Not sent");
    });
    it("leaves FAILED items alone, and a retried one (PENDING again, error removed) is sent", async () => {
      const failed = {...manualAdd(1), status: "FAILED", error: "No"};
      const calls = [];
      const send = async (item) => {
        calls.push(item.requestId);
        return {success: true};
      };
      const first = await drainQueue([failed, manualAdd(2)], send);
      assert.deepEqual(calls, [rid(2)]);
      assert.deepEqual(first.queue, [failed]);
      const {error, ...retried} = {...failed, status: "PENDING"};
      assert.equal(error, "No");
      const second = await drainQueue([retried], send);
      assert.deepEqual(calls, [rid(2), rid(1)]);
      assert.deepEqual(second.queue, []);
    });
    it("clears an old error when an item fails again for another reason", async () => {
      const out = await drainQueue([{...manualAdd(1), error: "stale"}], async () => {
        throw new Error("new reason");
      });
      assert.equal(out.queue[0].error, "new reason");
    });
    it("treats any error as a network error while the browser reports offline", async () => {
      const queue = [manualAdd(1), manualAdd(2)];
      const out = await drainQueue(queue, async () => {
        throw new Error("Request failed (0)");
      }, () => false);
      assert.equal(out.stopped, true);
      assert.deepEqual(out.queue, queue);
    });
    it("does not change the queue it is given", async () => {
      const queue = [manualAdd(1), manualAdd(2)];
      const before = JSON.parse(JSON.stringify(queue));
      await drainQueue(queue, async (item) => {
        if (item.requestId === rid(1)) throw new Error("bad");
        return {success: true};
      });
      assert.deepEqual(queue, before);
    });
    it("handles an empty or missing queue without calling send", async () => {
      for (const queue of [[], undefined, null]) {
        const out = await drainQueue(queue, async () => {
          throw new Error("must not be called");
        });
        assert.deepEqual(out, {queue: [], sent: [], stopped: false});
      }
    });
  });
});

describe("offline add queue display (page)", () => {
  const {ADD_QUEUE_KEY, ADD_QUEUE_MAX, makeQueuedAdd, parseQueue, queueCardView, queueDiscardPrompt, queueWithout, queueRetry, drainQueue, addQueueRefusal, newRequestId} = load();
  const rid = (n) => `req-${String(n).padStart(6, "0")}`;
  const add = (n, title = `Task ${n}`) => makeQueuedAdd({kind: "MANUAL", body: {manual: {title}}, now: "2026-10-27T08:00:00.000Z", requestId: rid(n)});

  describe("queueCardView", () => {
    it("says a PENDING item is waiting to send", () => {
      assert.deepEqual(queueCardView(add(1, "Fix gate")), {label: "Fix gate", failed: false, sending: false, text: "Waiting to send"});
    });
    it("shows the error of a FAILED item", () => {
      const item = {...add(1, "Fix gate"), status: "FAILED", error: "Title is too long"};
      assert.deepEqual(queueCardView(item), {label: "Fix gate", failed: true, sending: false, text: "Title is too long"});
    });
    it("falls back to Not sent for a FAILED item with no usable error", () => {
      for (const error of [undefined, "", "   ", 5]) {
        assert.equal(queueCardView({...add(1), status: "FAILED", error}).text, "Not sent");
      }
    });
    it("falls back to Added task for a missing or blank label", () => {
      for (const label of [undefined, "", "  ", 7]) {
        assert.equal(queueCardView({...add(1), label}).label, "Added task");
      }
    });
    it("treats anything that is not FAILED as waiting, and survives a missing item", () => {
      assert.equal(queueCardView({...add(1), status: "SOMETHING"}).failed, false);
      for (const item of [null, undefined, "x", 3]) {
        assert.deepEqual(queueCardView(item), {label: "Added task", failed: false, sending: false, text: "Waiting to send"});
      }
    });
    it("does not show the error of a PENDING item", () => {
      assert.equal(queueCardView({...add(1), error: "old"}).text, "Waiting to send");
    });
    it("shows the same text for a stored item after it is parsed back", () => {
      const failed = {...add(2, "Mow lawn"), status: "FAILED", error: "Bad request"};
      const [parsed] = parseQueue(JSON.stringify([failed]));
      assert.deepEqual(queueCardView(parsed), {label: "Mow lawn", failed: true, sending: false, text: "Bad request"});
    });
  });

  describe("queueDiscardPrompt", () => {
    it("names the task and says it will not be added", () => {
      const text = queueDiscardPrompt(add(1, "Fix gate"));
      assert.match(text, /^Discard “Fix gate”\?/);
      assert.match(text, /will not be added/);
    });
    it("cuts a long label and copes with no item", () => {
      assert.match(queueDiscardPrompt(add(1, "x".repeat(90))), /^Discard “x{39}…”\?/);
      assert.match(queueDiscardPrompt(undefined), /^Discard “Added task”\?/);
    });
  });

  describe("queueWithout", () => {
    it("removes the item with that request id and keeps the rest in order", () => {
      const queue = [add(1), add(2), add(3)];
      assert.deepEqual(queueWithout(queue, rid(2)).map((i) => i.requestId), [rid(1), rid(3)]);
    });
    it("returns the same items for an unknown id and an empty list for a missing queue", () => {
      const queue = [add(1), add(2)];
      assert.deepEqual(queueWithout(queue, "nope"), queue);
      assert.deepEqual(queueWithout(undefined, rid(1)), []);
    });
    it("does not change the queue it is given", () => {
      const queue = [add(1), add(2)];
      const before = JSON.parse(JSON.stringify(queue));
      queueWithout(queue, rid(1));
      assert.deepEqual(queue, before);
    });
  });

  describe("the page", () => {
    const fn = (name) => {
      const from = html.indexOf(`function ${name}(`);
      assert.ok(from > 0, `${name} not found`);
      return html.slice(from, html.indexOf("\n    }\n", from));
    };
    it("has the queue box at the top of the Queue card, hidden until something is waiting", () => {
      const card = html.slice(html.indexOf("id=\"queueCard\""));
      assert.ok(card.indexOf("id=\"addQueueBox\"") > 0 && card.indexOf("id=\"addQueueBox\"") < card.indexOf("id=\"activeTaskBox\""));
      assert.match(html, /<div class="add-queue" id="addQueueBox"[^>]* hidden><\/div>/);
    });
    it("keeps the queue in localStorage under the model's key, every access in try/catch", () => {
      assert.equal(ADD_QUEUE_KEY, "taskhub-add-queue");
      for (const name of ["loadAddQueue", "saveAddQueue"]) {
        const body = fn(name);
        assert.match(body, /try \{[\s\S]*localStorage\.[a-zA-Z]+Item\(ADD_QUEUE_KEY[\s\S]*\} catch/, name);
      }
      assert.match(fn("loadAddQueue"), /addQueueUsable = false/);
      assert.match(fn("saveAddQueue"), /addQueueUsable = false/);
    });
    it("draws every field it shows through esc", () => {
      const body = fn("renderAddQueue");
      assert.match(body, /esc\(view\.label\)/);
      assert.match(body, /esc\(view\.text\)/);
      assert.match(body, /esc\(item\.requestId\)/);
      assert.doesNotMatch(body, /\$\{(?!esc\(|view\.failed \?)(?:view|item)\./);
    });
    it("asks before discarding, then reads the stored queue again before removing the item", () => {
      const body = fn("discardQueuedAdd");
      assert.match(body, /askConfirm\(queueDiscardPrompt\(item\)/);
      assert.ok(body.indexOf("askConfirm") < body.indexOf("loadAddQueue()"));
      assert.ok(body.indexOf("loadAddQueue()") < body.indexOf("queueWithout("));
    });
    it("draws the stored queue at start-up, before sign-in, and wires Discard once", () => {
      const start = html.indexOf("loadAddQueue();\n      loadActionQueue();\n      loadClockOffset();\n      renderAddQueue();");
      assert.ok(start > 0 && start < html.indexOf("      initAuth();\n"));
      assert.equal(html.split("\"[data-queue-discard]\"").length - 1, 1);
      assert.equal(html.split("\"[data-action-discard]\"").length - 1, 1);
    });
  });

  describe("queueCardView while sending", () => {
    it("says Sending… for the item on its way, and never shows it as failed", () => {
      assert.deepEqual(queueCardView(add(1, "Fix gate"), true), {label: "Fix gate", failed: false, sending: true, text: "Sending…"});
      const failed = {...add(1, "Fix gate"), status: "FAILED", error: "old"};
      assert.deepEqual(queueCardView(failed, true), {label: "Fix gate", failed: false, sending: true, text: "Sending…"});
    });
    it("treats anything but true as not sending", () => {
      for (const sending of [undefined, false, 1, "yes"]) assert.equal(queueCardView(add(1), sending).sending, false);
    });
  });

  describe("queueRetry", () => {
    const failed = (n) => ({...add(n), status: "FAILED", error: "Bad request"});
    it("makes the FAILED item PENDING again without its error and leaves the others as they were", () => {
      const queue = [add(1), failed(2), failed(3)];
      const out = queueRetry(queue, rid(2));
      assert.deepEqual(out[0], queue[0]);
      assert.equal(out[1].status, "PENDING");
      assert.equal("error" in out[1], false);
      assert.deepEqual(out[2], queue[2]);
      assert.deepEqual(out[1].body, queue[1].body);
    });
    it("does nothing for a PENDING item, an unknown id or a missing queue", () => {
      const queue = [add(1), failed(2)];
      assert.deepEqual(queueRetry(queue, rid(1)), queue);
      assert.deepEqual(queueRetry(queue, "nope"), queue);
      assert.deepEqual(queueRetry(undefined, rid(1)), []);
    });
    it("does not change the queue it is given", () => {
      const queue = [failed(1)];
      const before = JSON.parse(JSON.stringify(queue));
      queueRetry(queue, rid(1));
      assert.deepEqual(queue, before);
    });
    it("gives a queue parseQueue keeps whole", () => {
      const out = queueRetry([failed(1)], rid(1));
      assert.deepEqual(parseQueue(JSON.stringify(out)), out);
    });
  });

  describe("drainQueue onItem", () => {
    it("reports each item as it is settled: null when sent, the FAILED item when not", async () => {
      const queue = [add(1), add(2), add(3)];
      const seen = [];
      await drainQueue(queue, async (item) => {
        if (item.requestId === rid(2)) throw new Error("Bad request");
        return {success: true};
      }, undefined, (change) => seen.push(change));
      assert.equal(seen.length, 3);
      assert.deepEqual(seen[0], {requestId: rid(1), item: null});
      assert.equal(seen[1].requestId, rid(2));
      assert.equal(seen[1].item.status, "FAILED");
      assert.equal(seen[1].item.error, "Bad request");
      assert.deepEqual(seen[2], {requestId: rid(3), item: null});
    });
    it("reports an item before the next one is sent", async () => {
      const log = [];
      await drainQueue([add(1), add(2)], async (item) => {
        log.push(`send ${item.requestId}`);
        return {};
      }, undefined, (change) => log.push(`done ${change.requestId}`));
      assert.deepEqual(log, [`send ${rid(1)}`, `done ${rid(1)}`, `send ${rid(2)}`, `done ${rid(2)}`]);
    });
    it("reports nothing for an item kept after a network error, or one that was not PENDING", async () => {
      const seen = [];
      const failed = {...add(1), status: "FAILED", error: "x"};
      const out = await drainQueue([failed, add(2)], async () => {
        throw new TypeError("Failed to fetch");
      }, undefined, (change) => seen.push(change));
      assert.deepEqual(seen, []);
      assert.equal(out.stopped, true);
    });
    it("keeps sending when onItem throws, and works without it", async () => {
      const out = await drainQueue([add(1), add(2)], async () => ({}), undefined, () => {
        throw new Error("display broke");
      });
      assert.deepEqual(out.queue, []);
      assert.equal(out.sent.length, 2);
      const plain = await drainQueue([add(1)], async () => ({}));
      assert.deepEqual(plain.queue, []);
    });
  });

  describe("sending (page)", () => {
    const body = (name) => {
      const from = html.indexOf(`function ${name}(`);
      assert.ok(from > 0, `${name} not found`);
      return html.slice(from, html.indexOf("\n    }\n", from));
    };
    it("posts the item's body to the add endpoint with apiFetch", () => {
      const send = body("sendQueuedAdd");
      assert.match(send, /apiFetch\(ADD_TASK_URL, \{\s*method: "POST",[\s\S]*JSON\.stringify\(item\.body\)/);
      assert.doesNotMatch(send, /startNow|allowProposal/);
    });
    it("keeps the item PENDING when the sign-in is gone, and shows it as sending only while it is on its way", () => {
      const send = body("sendQueuedAdd");
      assert.match(send, /!\(firebaseAuth && firebaseAuth\.currentUser\)[^\n]*keepQueued = true/);
      assert.match(send, /sendingRequestId = item\.requestId/);
      assert.match(send, /finally \{\s*sendingRequestId = "";/);
    });
    it("updates the list with the response as finishAdd does, without touching the add card", () => {
      const apply = body("applyQueuedAddResult");
      assert.match(apply, /setTasks\(data\.tasks\)/);
      assert.match(apply, /allProjects = data\.projects/);
      assert.match(apply, /renderTasks\(\)/);
      assert.doesNotMatch(apply, /taskInput|manualToggle|startNow/);
    });
    it("runs one drain at a time and not without a signed-in user", () => {
      const drain = body("drainAddQueue");
      assert.match(drain, /if \(draining \|\| !firebaseAuth \|\| !firebaseAuth\.currentUser\) return;/);
      assert.match(drain, /draining = true;[\s\S]*finally \{\s*draining = false;/);
      assert.match(drain, /drainQueue\(addQueue, sendQueuedAdd, \(\) => navigator\.onLine, settleQueuedAdd\)/);
    });
    it("settles each item on the queue as stored now, so an add queued meanwhile is kept", () => {
      const settle = body("settleQueuedAdd");
      assert.ok(settle.indexOf("loadAddQueue()") < settle.indexOf("saveAddQueue("));
      assert.match(settle, /queueWithout\(addQueue, requestId\)/);
    });
    it("drains on sign-in after the first list, on the online event and after any successful call", () => {
      assert.match(html, /fetchTasks\(\)\.then\(drainAllQueues\);/);
      // while the saved list is on screen the list is read again first, so an older list cannot replace a task the queue adds
      assert.match(html, /window\.addEventListener\("online", \(\) => \{ if \(savedListAt !== null\) fetchTasks\(\)\.then\(drainAllQueues\); else drainAllQueues\(\); \}\);/);
      const api = body("apiFetch").replace(/^[\s\S]*?if \(!res\.ok\)/, "");
      assert.match(api, /setTimeout\(drainAllQueues, 0\)[\s\S]*return res;/);
    });
    it("has a Retry button on FAILED cards that resets the item and drains", () => {
      assert.match(body("renderAddQueue"), /view\.failed \? `<button[^`]*\$\{retryAttr\}/);
      assert.match(body("renderAddQueue"), /"data-queue-retry", "data-queue-discard"/);
      const retry = body("retryQueuedAdd");
      assert.match(retry, /queueRetry\(addQueue, requestId\)/);
      assert.ok(retry.indexOf("saveAddQueue(") < retry.indexOf("drainAllQueues()"));
      assert.equal(html.split("\"[data-queue-retry]\"").length - 1, 1);
    });
    it("does not let the item on its way be discarded", () => {
      assert.match(body("renderAddQueue"), /\$\{discardAttr\}="\$\{id\}"\$\{off\}/);
      assert.match(body("renderAddQueue"), /"data-queue-retry", "data-queue-discard"/);
      const discard = body("discardQueuedAdd");
      assert.equal((discard.match(/sendingRequestId === requestId\) return;/g) || []).length, 2);
    });
  });

  describe("offline timer changes (page)", () => {
    const body = (name) => {
      const from = html.indexOf(`function ${name}(`);
      assert.ok(from > 0, `${name} not found`);
      return html.slice(from, html.indexOf("\n    }\n", from));
    };
    it("queues Start, Pause and Abort after a connection failure, and shows any other failure as before", () => {
      const fn = body("sendTimerAction");
      assert.match(fn, /if \(isNetworkError\(err, navigator\.onLine\)\) queueTimerAction\(task, action, extra, false\);\s*else askAlert\(failureText\("Failed to change the timer", err\), \{ tone: "error" \}\);/);
      assert.ok(fn.indexOf("queueTimerAction(task, action, extra, true)") < fn.indexOf("apiFetch(TIMER_URL"), "waiting changes go first, before any call");
      assert.match(fn, /hasPendingActions\(actionQueue\) \|\| actionDraining/);
      assert.match(fn, /noteServerTime\(data\)/);
    });
    it("books a held change at the device's clock corrected by the offset and shows it on top of what is shown", () => {
      const fn = body("queueTimerAction");
      assert.match(fn, /makeQueuedAction\(\{ kind: "TIMER", taskId: task\.id, title: task\.title, fields, now: Date\.now\(\), offset: clockOffsetMs \}\)/);
      assert.match(fn, /withPendingActions\(allTasks, \[\], \[item\]\)/);
      assert.match(fn, /capSeconds/);
      assert.match(fn, /actionQueueRefusal\(actionQueue\.length, actionQueueUsable\)/);
      assert.match(fn, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\)/);
    });
    it("keeps the saved copy of the list server-only while the page shows the waiting changes on top", () => {
      const set = body("setTasks");
      assert.match(set, /serverTasks = list;\s*allTasks = shownTasks\(list\);/);
      assert.match(set, /saveTaskCache\(list\)/);
      assert.match(body("shownTasks"), /withPendingActions\(withoutTasks\(list, pendingRemovals\), replayEntries\(\), actionQueue\)\.tasks/);
      assert.match(body("fetchTasks"), /serverTasks = saved\.tasks;\s*allTasks = shownTasks\(saved\.tasks\);/);
    });
    it("holds a reopen after a connection failure or behind waiting changes, with the entry's description edit before it", () => {
      const reopen = body("reopenCompletedEntry");
      assert.match(reopen, /const requestId = newRequestId\(\);/);
      assert.match(reopen, /if \(hasPendingActions\(actionQueue\) \|\| actionDraining\) \{ queueReopen\(row, result\.fields, requestId, true\); return; \}/);
      assert.match(reopen, /body: JSON\.stringify\(\{ id, requestId \}\)/);
      assert.match(reopen, /if \(isNetworkError\(err, navigator\.onLine\)\) \{ queueReopen\(row, editsSaved \? \{\} : result\.fields, requestId, false\); return; \}/);
      assert.match(reopen, /if \(row\.waitingRequestId\) \{ takeBackWaitingCompletion\(row\); return; \}/);
      const queue = body("queueReopen");
      assert.match(queue, /splitHeldFields\(fields\)/);
      assert.ok(queue.indexOf("kind: \"EDIT\"") < queue.indexOf("kind: \"REOPEN\""), "the edit goes first");
      assert.match(queue, /taskId: row\.id, archiveId: row\.archiveId/);
      assert.match(queue, /requestId \}\)\);/);
      assert.match(queue, /refreshShownTasks\(\);/);
      assert.match(queue, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\);/);
    });
    it("sends a held reopen to reopenCompletedTask and a held edit of an entry to updateCompletedTask", () => {
      const send = body("sendQueuedAction");
      assert.match(send, /item\.kind === "REOPEN"\) \{\s*url = REOPEN_COMPLETED_URL;\s*body = reopenBody\(item\);/);
      assert.match(send, /item\.kind === "EDIT" && item\.archiveId\) \{\s*url = UPDATE_COMPLETED_URL;\s*body = entryEditBody\(item\);/);
    });
    it("shows a waiting reopen on the Queue from the page's entries, else the saved copy's, and reads nothing unless one is waiting", () => {
      const fn = body("replayEntries");
      assert.match(fn, /a\.kind === "REOPEN"\)\) return \[\];/);
      assert.ok(fn.indexOf("completedServer.length") < fn.indexOf("readCompletedCache()"));
    });
    it("sends the actions after the add queue, oldest first, with the time they were made, in rounds until none is waiting", () => {
      assert.match(body("drainAllQueues"), /await drainAddQueue\(\);\s*await drainActionQueue\(\);/);
      const send = body("sendQueuedAction");
      assert.match(send, /\{ taskId: item\.taskId, action: item\.fields\.action, at: item\.at \}/);
      assert.match(send, /capSeconds/);
      assert.match(send, /err\.keepQueued = true/);
      const drain = body("drainActionQueue");
      assert.match(drain, /drainQueue\(actionQueue, sendQueuedAction, \(\) => navigator\.onLine, settleQueuedAction\)/);
      assert.match(drain, /if \(result\.stopped\) break;/);
      assert.match(drain, /round < 20/);
      assert.match(drain, /if \(actionDraining \|\| !firebaseAuth \|\| !firebaseAuth\.currentUser\) return;/);
    });
    it("takes a sent action out of the queue before its list is shown, so it is not replayed on its own result", () => {
      const send = body("sendQueuedAction");
      assert.ok(send.indexOf("saveActionQueue(queueWithout(actionQueue, item.requestId))") < send.indexOf("setTasks(data.tasks)"));
    });
    it("marks a refused action FAILED with its text and stops showing it", () => {
      const settle = body("settleQueuedAction");
      assert.match(settle, /actionQueue\.map\(a => a\.requestId === requestId \? item : a\)/);
      assert.match(settle, /if \(item\) \{ refreshShownTasks\(\); refreshShownShopping\(\); \}/);
    });
    it("draws action cards after the add cards, with Retry on a FAILED one and no Discard while one is on its way", () => {
      const fn = body("renderAddQueue");
      assert.match(fn, /box\.hidden = addQueue\.length === 0 && actionQueue\.length === 0/);
      assert.match(fn, /actionCardView\(action, action\.requestId === sendingActionId\)/);
      assert.match(fn, /"data-action-retry", "data-action-discard"/);
    });
    it("holds the action cards in one card that starts closed, after the add cards", () => {
      const fn = body("renderAddQueue");
      assert.match(html, /let actionQueueOpen = false;/);
      assert.match(fn, /actionQueueSummary\(actionQueue, sendingActionId\)/);
      assert.match(fn, /data-action-queue-toggle aria-expanded="\$\{actionQueueOpen\}" aria-controls="actionQueueCards"/);
      assert.match(fn, /\(actionQueueOpen \? `<div id="actionQueueCards">\$\{actionQueue\.map\(/);
      assert.match(fn, /if \(actionQueue\.length === 0\) actionQueueOpen = false/);
      assert.match(fn, /esc\(summary\.label\)/);
      assert.match(fn, /esc\(summary\.text\)/);
      assert.ok(fn.indexOf("queueCardView(") < fn.indexOf("+ group"), "the add cards come first, then the card of changes");
      const toggle = body("toggleActionQueue");
      assert.match(toggle, /actionQueueOpen = !actionQueueOpen/);
      assert.ok(toggle.indexOf("renderAddQueue()") < toggle.indexOf(".focus()"));
      const wire = html.indexOf("document.getElementById(\"addQueueBox\").addEventListener(\"click\"");
      assert.ok(wire > 0 && html.indexOf("[data-action-queue-toggle]", wire) > wire);
    });
    it("asks before discarding an action, takes its dependents with it and refuses one on its way", () => {
      const fn = body("discardQueuedAction");
      assert.match(fn, /actionDiscardPrompt\(action, dependents\)/);
      assert.equal((fn.match(/sendingActionId === requestId\) return;/g) || []).length, 2);
      assert.ok(fn.indexOf("askConfirm") < fn.indexOf("loadActionQueue()"));
      assert.ok(fn.indexOf("loadActionQueue()") < fn.indexOf("cancelActions(actionQueue, requestId).actions"));
    });
    it("retries a FAILED action by making it PENDING again and sending the queues", () => {
      const fn = body("retryQueuedAction");
      assert.match(fn, /queueRetry\(actionQueue, requestId\)/);
      assert.ok(fn.indexOf("saveActionQueue(") < fn.indexOf("drainAllQueues()"));
      assert.equal(html.split("\"[data-action-retry]\"").length - 1, 1);
    });
    it("fixes a removal's ids and time before its first attempt and sends the first attempt without the time", () => {
      const fn = body("removeTask");
      assert.match(fn, /kind === "COMPLETE" \|\| kind === "DELETE" \? makeQueuedAction\(\{ kind, taskId, archiveId: kind === "COMPLETE" \? newArchiveId\(\) : undefined, title: task\.title, now: Date\.now\(\), offset: clockOffsetMs \}\) : null;/);
      assert.match(fn, /const sendBody = item \? removalBody\(item, false\) : body;/);
      assert.ok(fn.indexOf("makeQueuedAction(") < fn.indexOf("pendingRemovals.add(taskId)"));
      assert.match(fn, /body: JSON\.stringify\(sendBody\)/);
      assert.match(fn, /noteServerTime\(data\)/);
    });
    it("holds a completion behind waiting changes, or after a connection failure, and otherwise puts the task back with an alert", () => {
      const fn = body("removeTask");
      assert.match(fn, /if \(item && \(hasPendingActions\(actionQueue\) \|\| actionDraining\)\) \{[^\n]*\n\s*const refusal = keepRemoval\(item, true\);\s*if \(!refusal\) return;\s*throw new Error\(refusal\);/);
      assert.ok(fn.indexOf("keepRemoval(item, true)") < fn.indexOf("await apiFetch"));
      assert.match(fn, /if \(item && isNetworkError\(err, navigator\.onLine\)\) \{\s*const refusal = keepRemoval\(item, false\);\s*if \(!refusal\) return;\s*err = new Error\(refusal\);/);
      assert.ok(fn.indexOf("keepRemoval(item, false)") < fn.indexOf("insertTaskAt(allTasks, task, index)"), "the task goes back only when the completion was not kept");
      assert.equal((fn.match(/makeQueuedAction\(/g) || []).length, 1, "a completion and a delete are made by the one call");
      assert.match(fn, /failureText\(kind === "COMPLETE" \? "Error completing task" : "Error deleting task", err\)/, "a delete the queue could not keep still fails with its alert");
    });
    it("remembers what Undo needs for a completion or a delete and the next occurrence the server made", () => {
      const fn = body("removeTask");
      assert.match(fn, /undoRemovalInfo = item \? \{ requestId: item\.requestId, archiveId: item\.archiveId \|\| null, taskId, title: task\.title, task: \(kind === "COMPLETE" \? completionRecord\(task, item\.at, item\.archiveId, null\) : deletionRecord\(task, item\.at\)\)\.task, spawnedId: null \} : null;/);
      assert.match(fn, /undoRemovalInfo\.spawnedId = \(data\.spawned && data\.spawned\.id\) \|\| null/);
      assert.match(body("sendQueuedAction"), /undoRemovalInfo\.spawnedId = \(data\.spawned && data\.spawned\.id\) \|\| null/);
      assert.match(body("hideUndoNote"), /undoRemovalInfo = null;/);
    });
    it("keeps a removal in the queue before it stops hiding the task, and refuses with the reason when it cannot", () => {
      const fn = body("keepRemoval");
      assert.match(fn, /actionQueueRefusal\(actionQueue\.length, actionQueueUsable\)/);
      assert.ok(fn.indexOf("saveActionQueue([...actionQueue, item])") < fn.indexOf("pendingRemovals.delete(item.taskId)"));
      assert.match(fn, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\)/);
      assert.match(fn, /if \(item\.kind === "COMPLETE"\) refreshHistoryIfOpen\(\);/, "only a completion changes History");
      const undo = body("keepUndo");
      assert.ok(undo.indexOf("saveActionQueue([...actionQueue, item])") < undo.indexOf("refreshShownTasks()"));
      assert.match(undo, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\)/);
    });
    it("sends a held completion with its time and a held undo with its request id, and not behind a change the server refused", () => {
      const fn = body("sendQueuedAction");
      assert.match(fn, /url = COMPLETE_TASK_URL;\s*body = completeBody\(item\);/);
      assert.match(fn, /item\.kind === "DELETE"\) \{\s*url = DIRECT_UPDATE_URL;\s*body = deleteBody\(item\);/, "a held delete goes to updateTaskDirect with the time it was made");
      assert.match(fn, /url = UNDO_URL;\s*body = undoBody\(item\);/);
      assert.ok(fn.indexOf("blockedBy(actionQueue, item)") < fn.indexOf("await apiFetch(url"));
      assert.match(fn, /if \(item\.kind !== "TIMER"\) templates = null;/);
      assert.match(fn, /refreshHistoryIfOpen\(\)/);
    });
    it("cancels a waiting removal on Undo, and sends or holds the undo otherwise, for a delete as for a completion", () => {
      const fn = body("undoRemoval");
      assert.match(fn, /const info = undoRemovalInfo;[^\n]*\n\s*hideUndoNote\(\);\s*await removalChain;/);
      assert.match(fn, /undoPlan\(actionQueue, info\.requestId, sendingActionId\)/);
      assert.match(fn, /if \(plan === "NONE"\) return;/);
      assert.match(fn, /if \(plan === "CANCEL"\) \{[^\n]*\n\s*saveActionQueue\(cancelActions\(actionQueue, info\.requestId\)\.actions\);/);
      assert.match(fn, /await sendUndo\(info\);/);
      assert.match(fn, /body: "\{\}"/, "a footnote with nothing to remember is still a plain call");
      const send = body("sendUndo");
      assert.match(send, /kind: "UNDO", taskId: info\.taskId, archiveId: info\.archiveId/);
      assert.match(send, /hasPendingActions\(actionQueue\) \|\| actionDraining/);
      assert.match(send, /body: JSON\.stringify\(undoBody\(item\)\)/);
      assert.match(send, /if \(isNetworkError\(err, navigator\.onLine\)\) \{\s*const refusal = keepUndo\(item, false\);\s*if \(!refusal\) return;/);
      assert.match(send, /askAlert\(failureText\("Error undoing", err\), \{ tone: "error" \}\)/);
    });
    it("takes the footnote away when its completion is refused or discarded", () => {
      assert.match(body("settleQueuedAction"), /if \(item && undoRemovalInfo && undoRemovalInfo\.requestId === requestId\) hideUndoNote\(\);/);
      assert.match(body("discardQueuedAction"), /cancelActions\(actionQueue, requestId\)\.cancelled\.some\(a => a\.requestId === undoRemovalInfo\.requestId\)\) hideUndoNote\(\);/);
    });
    it("reads History again when the queue changes while it is open", () => {
      assert.match(body("refreshShownTasks"), /refreshHistoryIfOpen\(\);/);
      assert.match(body("refreshHistoryIfOpen"), /querySelector\('\[data-page="history"\]'\);\s*if \(page && !page\.hidden\) fetchCompleted\(\);/);
    });
    it("shows a waiting completion at the top of History, from the server's lists and never saved, and does not open it", () => {
      assert.match(body("shownCompleted"), /withPendingActions\(serverTasks, completedServer, actionQueue\)\.completed/);
      const fetch = body("fetchCompleted");
      assert.ok(fetch.indexOf("saveCompletedCache(tasks,") < fetch.indexOf("completedServer = tasks;"), "the copy kept on the device is the server's list");
      assert.ok(fetch.indexOf("completedServer = tasks;") < fetch.indexOf("shownCompleted()"));
      assert.match(fetch, /completedAll = shown;/);
      const copy = body("showCompletedCopy");
      assert.match(copy, /completedServer = saved\.rows;\s*completedAll = shownCompleted\(\);/);
      const row = body("completedRowHtml");
      assert.match(row, /const open = !!t\.archiveId;/, "a waiting entry opens too");
      assert.match(row, /data-completed-open="\$\{esc\(t\.archiveId\)\}"/);
      assert.match(row, /t\.waitingRequestId \? '<span class="chip">⏳ Waiting to send<\/span>' : ''/);
    });
    it("holds the History form's Save behind waiting changes or a waiting completion, and after a connection failure", () => {
      const save = body("saveCompletedEdit");
      assert.match(save, /row\.waitingRequestId \|\| hasPendingActions\(actionQueue\) \|\| actionDraining\) \{ holdEntryEdit\(row, result\.fields, true\); return; \}/);
      assert.match(save, /isNetworkError\(err, navigator\.onLine\)\) \{ holdEntryEdit\(row, result\.fields, false\); return; \}/);
      assert.ok(save.indexOf("loadActionQueue()") < save.indexOf("apiFetch(UPDATE_COMPLETED_URL"), "the queue is read before the first attempt");
      assert.ok(save.indexOf("apiFetch(UPDATE_COMPLETED_URL") < save.indexOf("fetchCompleted()"), "the list is read after the save, outside the try");
      const hold = body("holdEntryEdit");
      assert.match(hold, /splitHeldFields\(fields\)/);
      assert.match(hold, /checkEditFields\(held, ENTRY_EDIT_FIELDS\)/);
      assert.match(hold, /makeQueuedAction\(\{ kind: "EDIT", archiveId: row\.archiveId/);
      assert.ok(hold.indexOf("splitHeldFields") < hold.indexOf("saveActionQueue"), "a change that needs a connection keeps nothing");
      assert.ok(hold.indexOf("saveActionQueue") < hold.indexOf("closeCompletedEditor()"), "the form stays open when nothing was kept");
      assert.match(hold, /refreshShownTasks\(\);/);
      assert.match(hold, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\);/);
    });
    it("opens a waiting entry with only the fields that can be held, no photos, no Delete and no job sheet", () => {
      const open = body("openCompletedEditor");
      assert.match(open, /const offline = savedCompletedAt !== null \|\| !!row\.waitingRequestId;/);
      assert.match(open, /Photos can be added once this completion has been sent\./);
      assert.match(body("completedFormLimited"), /savedCompletedAt !== null \|\| !!\(row && row\.waitingRequestId\)/);
      assert.match(body("renderCommentPanel"), /waitingCommentIds\(actionQueue\)/);
      assert.match(html, /id="ceSheetBtn"/);
      assert.match(html, /id="ceDeleteBtn"/);
    });
    it("holds a typed comment after a connection failure, behind waiting changes and on a waiting entry, with its own id", () => {
      const post = body("postComment");
      assert.match(post, /\(prefix === "ce" && item && item\.waitingRequestId\) \|\| hasPendingActions\(actionQueue\) \|\| actionDraining\) return holdComment\(prefix, key, id, text, now, true\)/);
      assert.match(post, /isNetworkError\(err, navigator\.onLine\) && pendingComment\[prefix\]\) return holdComment\(prefix, key, pendingComment\[prefix\]\.id, text, Date\.now\(\), false\)/);
      assert.ok(post.indexOf("loadActionQueue()") < post.indexOf("apiFetch(ADD_COMMENT_URL"), "the queue is read before the first attempt");
      assert.match(body("holdComment"), /holdCommentAction\(prefix, key, "COMMENT", \{ id, text \}, now, behind\)/);
      const hold = body("holdCommentAction");
      assert.match(hold, /makeQueuedAction\(\{ kind, \[panel\.field\]: key, title: item && item\.title, fields, now, offset: clockOffsetMs \}\)/);
      assert.ok(hold.indexOf("saveActionQueue") < hold.indexOf("value = \"\""), "the box is cleared only once the comment is kept");
      assert.match(hold, /pendingComment\[prefix\] = null;/);
      assert.match(hold, /showHeldComments\(prefix, key\);/);
      assert.match(body("showHeldComments"), /refreshShownTasks\(\);/);
      assert.match(body("showHeldComments"), /completedAll = shownCompleted\(\);/);
      assert.match(hold, /if \(behind && navigator\.onLine\) setTimeout\(drainAllQueues, 0\);/);
    });
    it("holds a comment deletion after a connection failure, behind waiting changes and on a waiting entry, and takes a waiting comment out of the queue", () => {
      const del = body("deleteComment");
      assert.match(del, /a\.kind === "COMMENT" && a\.status === "PENDING" && a\.fields\.id === id/);
      assert.match(del, /saveActionQueue\(queueWithout\(actionQueue, waiting\.requestId\)\)/);
      assert.match(del, /sendingActionId !== waiting\.requestId/, "a comment on its way is deleted after it arrives");
      assert.match(del, /holdCommentAction\(prefix, key, "COMMENT_DELETE", \{ id \}, Date\.now\(\), true\)/);
      assert.match(del, /isNetworkError\(err, navigator\.onLine\)\) holdCommentAction\(prefix, key, "COMMENT_DELETE", \{ id \}, Date\.now\(\), false\)/);
      assert.ok(del.indexOf("askConfirm(") < del.indexOf("loadActionQueue()"), "the question comes first");
      assert.doesNotMatch(body("renderCommentPanel"), /disabled/, "the delete control is never off");
    });
    it("sends a held comment to addComment and shows it in an open form without overwriting the saved History copy", () => {
      const send = body("sendQueuedAction");
      assert.match(send, /item\.kind === "COMMENT"\) \{\s*url = ADD_COMMENT_URL;\s*body = commentBody\(item\);/);
      assert.match(send, /item\.kind === "COMMENT_DELETE"\) \{\s*url = DELETE_COMMENT_URL;\s*body = commentDeleteBody\(item\);/);
      assert.match(send, /completedServer\.some\(r => r\.archiveId === item\.archiveId\)\) applyCommentResult\("ce", item\.archiveId, data\)/);
    });
    it("keeps every access to the action queue's storage in try/catch", () => {
      for (const name of ["loadActionQueue", "saveActionQueue"]) {
        assert.match(body(name), /try \{[\s\S]*localStorage\.[a-zA-Z]+Item\(ACTION_QUEUE_KEY[\s\S]*\} catch/, name);
        assert.match(body(name), /actionQueueUsable = false/, name);
      }
    });
    it("keeps the clock offset from the server's replies and across reloads", () => {
      const fn = body("noteServerTime");
      assert.match(fn, /clockOffsetFrom\(data && data\.serverTime, Date\.now\(\)\)/);
      assert.match(fn, /CLOCK_OFFSET_KEY/);
      assert.match(body("loadClockOffset"), /parseClockOffset\(localStorage\.getItem\(CLOCK_OFFSET_KEY\)\)/);
      assert.match(body("fetchTasks"), /noteServerTime\(data\)/);
    });
    it("shows a Waiting to send chip on a task with a PENDING change, in a colour that has a dark value", () => {
      assert.match(body("taskItemHtml"), /waitingIds\.has\(t\.id\) \? `<span class="chip held-chip"[^`]*Waiting to send/);
      assert.match(body("saveActionQueue"), /waitingIds = waitingTaskIds\(actionQueue\)/);
      assert.match(body("loadActionQueue"), /waitingIds = waitingTaskIds\(actionQueue\)/);
    });
    it("measures timers and the long-timer warning on the server's clock", () => {
      assert.match(html, /function elapsedSecondsOf\(task, nowMs = serverNow\(\)\)/);
      assert.match(html, /function runningSeconds\(task, nowMs = serverNow\(\)\)/);
      assert.equal((html.match(/longTimerWarning\(task, serverNow\(\), timerWarnHours\(\)\)/g) || []).length, 2);
    });
  });

  describe("addQueueRefusal", () => {
    it("allows an add while storage works and the queue has room", () => {
      assert.equal(addQueueRefusal(0, true), "");
      assert.equal(addQueueRefusal(ADD_QUEUE_MAX - 1, true), "");
    });
    it("refuses a full queue and says how many are waiting", () => {
      assert.match(addQueueRefusal(ADD_QUEUE_MAX, true), new RegExp(`^${ADD_QUEUE_MAX} adds are already waiting`));
      assert.notEqual(addQueueRefusal(ADD_QUEUE_MAX + 5, true), "");
    });
    it("refuses when the device's storage cannot be used, whatever the count", () => {
      assert.match(addQueueRefusal(0, false), /cannot keep an add for later/);
      assert.match(addQueueRefusal(ADD_QUEUE_MAX, false), /cannot keep an add for later/);
    });
  });

  describe("going live (page)", () => {
    const body = (name) => {
      const from = html.indexOf(`function ${name}(`);
      assert.ok(from > 0, `${name} not found`);
      return html.slice(from, html.indexOf("\n    }\n", from));
    };
    it("gives every add a request id before the first attempt, and sends it", () => {
      const submit = body("submitTask");
      assert.ok(submit.indexOf("newRequestId()") > 0 && submit.indexOf("newRequestId()") < submit.indexOf("apiFetch(ADD_TASK_URL"));
      assert.match(submit, /Object\.assign\(body, addTaskExtras\(\{ startNow: [^}]*\}\), \{ requestId \}\);/);
      assert.equal((submit.match(/newRequestId\(\)/g) || []).length, 1, "one id per add, reused if it waits");
    });
    it("queues the add under that same id only when the failure is the connection's and the body was built", () => {
      const submit = body("submitTask");
      assert.match(submit, /if \(body && isNetworkError\(err, navigator\.onLine\)\) \{\s*const serverOnly = serverOnlyAddFields\(body\);\s*if \(serverOnly\.length > 0\) \{ askAlert\(serverOnlyAddText\(serverOnly\), \{ tone: "warning" \}\); return; \}[^\n]*\n\s*const refusal = queueFailedAdd\(manual \? "MANUAL" : "TEXT", body, requestId\);/);
      assert.match(submit, /if \(refusal\) askAlert\(refusal, \{ tone: "error" \}\);\s*else resetAddForm\(manual\);\s*return;/);
      assert.ok(submit.indexOf("isNetworkError") < submit.indexOf("failureText(\"Error updating tasks\""), "other failures still alert");
    });
    it("clears the add card the same way after a sent add and a kept one", () => {
      assert.match(body("finishAdd"), /resetAddForm\(manual\);/);
      const reset = body("resetAddForm");
      for (const part of ["\"taskInput\").value = \"\"", "startNow\").checked = false", "resetManualExtras()", "manualToggle\").checked = false", "showManualFields(false)"]) {
        assert.ok(reset.includes(part), part);
      }
    });
    it("keeps an add at the end of the queue, refusing a full queue or unusable storage, and shows the card", () => {
      const keep = body("queueFailedAdd");
      assert.ok(keep.indexOf("loadAddQueue()") < keep.indexOf("addQueueRefusal(addQueue.length, addQueueUsable)"));
      assert.match(keep, /makeQueuedAdd\(\{ kind, body, now: new Date\(\)\.toISOString\(\), requestId \}\)/);
      assert.match(keep, /saveAddQueue\(\[\.\.\.addQueue, item\]\)/);
      assert.ok(keep.indexOf("saveAddQueue(") < keep.indexOf("renderAddQueue()"));
      assert.match(keep, /return "";\s*$/);
    });
    it("queues the add without startNow or allowProposal whatever the form sent", () => {
      const sent = {input: "Mow the lawn", allowProposal: true, startNow: true, requestId: "req-000001"};
      const item = makeQueuedAdd({kind: "TEXT", body: sent, now: "2026-10-27T08:00:00.000Z", requestId: sent.requestId});
      assert.deepEqual(item.body, {input: "Mow the lawn", requestId: "req-000001"});
      const manual = makeQueuedAdd({kind: "MANUAL", body: {manual: {title: "Fix gate"}, startNow: true, requestId: "req-000002"}, now: "", requestId: "req-000002"});
      assert.deepEqual(manual.body, {manual: {title: "Fix gate"}, requestId: "req-000002"});
      assert.match(newRequestId(), /^[A-Za-z0-9_-]{8,64}$/);
    });
  });
  describe("the reusable Clients form block", () => {
    const SUFFIXES = ["Name", "Location", "LocationNote", "PlaceSearchBtn", "ClearCoordsBtn", "PlaceResults", "CoordsNote", "Phone", "UseWhatsApp", "Email", "Url", "HourlyRate"];
    const idsOf = (markup) => [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const boxes = (values) => (id) => (id in values ? values[id] : null);

    it("makes every id from its prefix, the same set for each, with none repeated", () => {
      const {clientFormHtml} = load();
      for (const prefix of ["client", "manualClient", "editClient"]) {
        const ids = idsOf(clientFormHtml(prefix));
        assert.deepEqual(ids, SUFFIXES.map((x) => prefix + x));
        assert.equal(new Set(ids).size, ids.length);
      }
      const both = [...idsOf(clientFormHtml("manualClient")), ...idsOf(clientFormHtml("editClient"))];
      assert.equal(new Set(both).size, both.length, "two blocks on one page never share an id");
    });
    it("keeps the Settings card's ids as they were with prefix client", () => {
      const {clientFormHtml} = load();
      const markup = clientFormHtml("client");
      for (const id of ["clientName", "clientLocation", "clientLocationNote", "clientPlaceSearchBtn", "clientClearCoordsBtn", "clientPlaceResults", "clientCoordsNote", "clientPhone", "clientUseWhatsApp", "clientEmail", "clientUrl", "clientHourlyRate"]) {
        assert.ok(markup.includes(` id="${id}"`), id);
      }
      for (const label of ["Name", "Location", "Phone", "Email", "Link", "Hourly rate"]) assert.match(markup, new RegExp(`<label[^>]*>${label}</label>`));
      assert.match(markup, /<input type="checkbox" id="clientUseWhatsApp"> Use WhatsApp for calls and texts/);
      assert.match(markup, /<label for="clientLocation">Location<\/label>/);
      assert.match(markup, /<button type="button" id="clientClearCoordsBtn" class="btn-secondary" hidden>Clear position<\/button>/);
    });
    it("points every label at an input in the block, and has no save button or status line of its own", () => {
      const {clientFormHtml} = load();
      const markup = clientFormHtml("manualClient");
      const ids = new Set(idsOf(markup));
      for (const m of markup.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
      assert.doesNotMatch(markup, /Save client|Add client|Cancel|Status/);
      assert.doesNotMatch(markup, /\$\{|undefined/);
    });
    it("reads the boxes into clientFormBody's input, the map position as two numbers only", () => {
      const {clientFormValues, clientFormBody} = load();
      const read = boxes({xName: {value: " Jo "}, xPhone: {value: "021"}, xEmail: {value: "jo@x.nz"}, xUrl: {value: "example.com"}, xHourlyRate: {value: " 95 "}, xUseWhatsApp: {checked: true}, xLocation: {value: "1 Beach Rd"}});
      const values = clientFormValues("x", read, {latitude: -36.6, longitude: 174.7, label: "Orewa"});
      assert.deepEqual(values, {name: " Jo ", phone: "021", email: "jo@x.nz", url: "example.com", hourlyRate: " 95 ", useWhatsApp: true, location: {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7}});
      assert.deepEqual(clientFormBody(values), {name: "Jo", phone: "021", email: "jo@x.nz", hourlyRate: "95", useWhatsApp: true, location: {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7}, url: "example.com"});
    });
    it("reads an empty or partly missing block as empty boxes and ignores a position that is not two numbers", () => {
      const {clientFormValues, clientFormBody} = load();
      assert.deepEqual(clientFormBody(clientFormValues("x", boxes({}), null)), {name: "", phone: "", email: "", hourlyRate: "", useWhatsApp: false, location: null, url: ""});
      const read = boxes({xLocation: {value: "Yard"}, xUseWhatsApp: {checked: "yes"}});
      for (const coords of [null, undefined, {}, {latitude: -36.6}, {latitude: "x", longitude: 174.7}]) {
        const values = clientFormValues("x", read, coords);
        assert.deepEqual(values.location, {name: "Yard"});
        assert.equal(values.useWhatsApp, false);
      }
    });
    it("reads each prefix's own boxes", () => {
      const {clientFormValues} = load();
      const read = boxes({manualClientName: {value: "A"}, editClientName: {value: "B"}});
      assert.equal(clientFormValues("manualClient", read, null).name, "A");
      assert.equal(clientFormValues("editClient", read, null).name, "B");
      assert.equal(clientFormValues("client", read, null).name, undefined);
    });
    it("fills the boxes from a stored client and empties them for none", () => {
      const {clientFormFill} = load();
      const client = {id: "c1", name: "Jo", phone: "021", email: "jo@x.nz", url: "https://x.nz", hourlyRate: 95, useWhatsApp: true, location: {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7}};
      assert.deepEqual(clientFormFill(client), {name: "Jo", phone: "021", email: "jo@x.nz", url: "https://x.nz", hourlyRate: "95.00", useWhatsApp: true, location: "1 Beach Rd", coords: {latitude: -36.6, longitude: 174.7}});
      const empty = {name: "", phone: "", email: "", url: "", hourlyRate: "", useWhatsApp: false, location: "", coords: null};
      for (const none of [null, undefined, {}]) assert.deepEqual(clientFormFill(none), empty);
      assert.equal(clientFormFill({name: "Jo", hourlyRate: 0}).hourlyRate, "0.00", "a rate of 0 is shown");
      assert.deepEqual(clientFormFill({name: "Jo", location: {name: "Yard"}}).coords, null);
      assert.equal(clientFormFill({name: "Jo", location: {name: "Yard"}}).location, "Yard");
      assert.equal(clientFormFill({name: "Jo", useWhatsApp: "yes"}).useWhatsApp, false);
    });
    it("fills and reads back to the same client body", () => {
      const {clientFormFill, clientFormValues, clientFormBody} = load();
      const client = {name: "Jo", phone: "021", email: "jo@x.nz", url: "https://x.nz", hourlyRate: 95, useWhatsApp: true, location: {name: "1 Beach Rd", latitude: -36.6, longitude: 174.7}};
      const fill = clientFormFill(client);
      const read = boxes({xName: {value: fill.name}, xPhone: {value: fill.phone}, xEmail: {value: fill.email}, xUrl: {value: fill.url}, xHourlyRate: {value: fill.hourlyRate}, xUseWhatsApp: {checked: fill.useWhatsApp}, xLocation: {value: fill.location}});
      assert.deepEqual(clientFormBody(clientFormValues("x", read, fill.coords)), {...client, hourlyRate: "95.00"});
    });
    it("warns about a bad email, link or hourly rate, and about nothing else", () => {
      const {clientFormWarning, clientFormBody, INVALID_EMAIL, INVALID_URL, INVALID_RATE} = load();
      const body = (extra) => clientFormBody({name: "Jo", ...extra});
      assert.equal(clientFormWarning(body({})), "");
      assert.equal(clientFormWarning(body({email: "jo@x.nz", url: "example.com/job", hourlyRate: "85.50"})), "");
      assert.equal(clientFormWarning(body({hourlyRate: "0"})), "", "0 is a real rate");
      assert.equal(clientFormWarning(body({hourlyRate: "10000"})), "");
      assert.equal(clientFormWarning(body({email: "not an email"})), INVALID_EMAIL);
      assert.equal(clientFormWarning(body({url: "ftp://example.com"})), INVALID_URL);
      for (const hourlyRate of ["abc", "-5", "85.555", "10000.01", "12345678", "1e3"]) assert.equal(clientFormWarning(body({hourlyRate})), INVALID_RATE, hourlyRate);
      assert.equal(clientFormWarning(null), "");
      assert.equal(clientFormWarning({}), "");
    });
    it("reports the first problem in form order when there are several", () => {
      const {clientFormWarning, INVALID_EMAIL, INVALID_URL, INVALID_RATE} = load();
      assert.equal(clientFormWarning({email: "bad", url: "ftp://x", hourlyRate: "abc"}), INVALID_EMAIL);
      assert.equal(clientFormWarning({email: "", url: "ftp://x", hourlyRate: "abc"}), INVALID_URL);
      assert.equal(clientFormWarning({email: "", url: "", hourlyRate: "abc"}), INVALID_RATE);
    });
    it("agrees with the server about which clients are usable", () => {
      const {normalizeClientFields} = require("../clients");
      const {clientFormWarning, clientFormBody} = load();
      const cases = [{}, {email: "jo@x.nz"}, {email: "bad"}, {url: "example.com"}, {url: "ftp://x"}, {hourlyRate: "0"}, {hourlyRate: "95.5"}, {hourlyRate: "abc"}, {hourlyRate: "10001"}, {hourlyRate: "-1"}];
      for (const extra of cases) {
        const sent = clientFormBody({name: "Jo", ...extra});
        assert.equal(clientFormWarning(sent) === "", normalizeClientFields(sent).error === undefined, JSON.stringify(extra));
      }
    });
    it("is mounted once for the Settings card with prefix client, and keeps its state by prefix", () => {
      assert.equal((html.match(/mountClientForm\("client", "clientFormMount"\)/g) || []).length, 1);
      assert.match(html, /<div id="clientFormMount"[^>]*><\/div>/);
      assert.doesNotMatch(html, /<input[^>]* id="client(Name|Location|Phone|Email|Url|HourlyRate)"/, "the block's markup comes from clientFormHtml alone");
      assert.doesNotMatch(html, /\bclientCoords\b|\bclientPlaces\b/, "no single-form state is left");
      const mount = html.slice(html.indexOf("function mountClientForm"), html.indexOf("// The Clients card's form: fill it"));
      assert.match(mount, /innerHTML = clientFormHtml\(prefix, options\)/);
      assert.match(mount, /getElementById\(`\$\{prefix\}ClearCoordsBtn`\)\.addEventListener/);
      assert.doesNotMatch(mount, /getElementById\("client/, "no id is written out in full");
      const handlers = html.slice(html.indexOf("const clientForms = {}"), html.indexOf("// The Clients card's form: fill it"));
      assert.doesNotMatch(handlers, /getElementById\("client/, "every handler of the block takes its ids from the prefix");
    });
    it("shows and reads the Settings card's form through the prefix-driven functions", () => {
      const fillCard = html.slice(html.indexOf("function fillClientForm("), html.indexOf("// Everything that shows client names follows a change to the list."));
      assert.match(fillCard, /fillClientFormBlock\("client", client \|\| draft\)/);
      const save = html.slice(html.indexOf("async function saveClient()"), html.indexOf("async function deleteClient"));
      assert.match(save, /const client = readClientForm\("client"\);/);
      assert.match(html, /function readClientForm\(prefix\) \{\s*return clientFormBody\(clientFormValues\(prefix, id => document\.getElementById\(id\), clientFormState\(prefix\)\.coords\)\);/);
    });
  });
});

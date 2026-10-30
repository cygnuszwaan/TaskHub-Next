/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// The voice inbox: a Google Tasks list the owner adds to by voice ("Hey Google, add ... to my TaskHub list"). Each item on it is
// read as free text, added like a typed add and then completed in Google Tasks. Pure: no I/O (see googleTasks.js for the calls).

// The one scope that lets the app read the list and complete its items.
const INBOX_SCOPE = "https://www.googleapis.com/auth/tasks";
// The most items taken in one pull, and the most characters of one item that are read.
const MAX_ENTRIES = 10;
const MAX_INPUT_LENGTH = 4000;

const squash = (text) => String(text).replace(/\s+/g, " ").trim().toLowerCase();

// The id of the task list titled `title` (ignoring case and spacing; the first when several share it), else null.
//   lists: the owner's Google task lists, [{id, title}]
function findList(lists, title) {
  const wanted = squash(title || "");
  if (!wanted || !Array.isArray(lists)) return null;
  const hit = lists.find((l) => l && typeof l.id === "string" && l.id && typeof l.title === "string" && squash(l.title) === wanted);
  return hit ? hit.id : null;
}

// The request id an item is added under: "gt-" and the item's id with anything but letters, digits, "-" and "_" turned into "_",
// cut to 64 characters, so an item that is read twice (its completion failed the first time) is added once (see addRequests.js).
// Null for an item without a usable id.
function requestIdFor(taskId) {
  if (typeof taskId !== "string" || taskId === "") return null;
  const id = `gt-${taskId.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 64);
  return id.length >= 8 ? id : `${id}${"_".repeat(8 - id.length)}`;
}

// The items to add, from a task list's items: those not completed, deleted or hidden that have a title, in the order given, at most
// MAX_ENTRIES. `input` is the title and then the notes on lines of their own, cut to MAX_INPUT_LENGTH; `taskId` is the item's id.
function inboxEntries(items) {
  const entries = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id) continue;
    if (item.status === "completed" || item.deleted === true || item.hidden === true) continue;
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim() : "";
    if (!title) continue;
    const notes = typeof item.notes === "string" ? item.notes.trim() : "";
    entries.push({taskId: item.id, requestId: requestIdFor(item.id), input: (notes ? `${title}\n${notes}` : title).slice(0, MAX_INPUT_LENGTH)});
    if (entries.length >= MAX_ENTRIES) break;
  }
  return entries;
}

module.exports = {INBOX_SCOPE, MAX_ENTRIES, MAX_INPUT_LENGTH, findList, requestIdFor, inboxEntries};

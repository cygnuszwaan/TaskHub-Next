/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Comments: timestamped entries added to a queued task or a completed entry, a record of updates (see docs/endpoints-comments.md).
// A comment is {id, at, text}: `id` made by the page (8 to 64 letters, digits, "-" and "_"), `at` the epoch milliseconds when it
// was written (never the timer's), `text` one entry. A task and its archive row hold them as `comments`, an array in the order
// written; the key is absent when there are none. A comment is added or deleted, never edited. Pure: no I/O.

const MAX_COMMENT_LENGTH = 2000;
const MAX_COMMENTS = 200;
const COMMENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// A usable comment id, else null.
function normalizeCommentId(value) {
  return typeof value === "string" && COMMENT_ID_PATTERN.test(value) ? value : null;
}

// A comment's text: trimmed and cut to MAX_COMMENT_LENGTH, line breaks inside kept; null for anything that is not text or is blank.
function normalizeCommentText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, MAX_COMMENT_LENGTH).trim();
  return text === "" ? null : text;
}

// The usable comments held by a task or an archive row, in the order stored: only entries with a usable id, a whole-number
// `at` above 0 and text, the first of any repeated id, each as exactly {id, at, text}. A missing or unusable `comments`
// (not a list) gives none.
function commentsOf(doc) {
  const list = doc && typeof doc === "object" && Array.isArray(doc.comments) ? doc.comments : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const id = normalizeCommentId(item.id);
    const text = typeof item.text === "string" && item.text.trim() !== "" ? item.text : null;
    if (!id || seen.has(id) || !Number.isSafeInteger(item.at) || item.at <= 0 || text === null) continue;
    seen.add(id);
    out.push({id, at: item.at, text});
  }
  return out;
}

// Which item a request means: {taskId} for a queued task or {archiveId} for a completed entry, exactly one of them.
// Returns {field, id}, `field` being "taskId" or "archiveId", or {error}.
function commentTarget(body) {
  const {archiveId, taskId} = body && typeof body === "object" ? body : {};
  const valid = (id) => typeof id === "string" && id !== "" && id.length <= 200 && !id.includes("/");
  const hasArchive = archiveId !== undefined && archiveId !== null;
  const hasTask = taskId !== undefined && taskId !== null;
  if (hasArchive && hasTask) return {error: "Give archiveId or taskId, not both"};
  if (hasArchive) return valid(archiveId) ? {field: "archiveId", id: archiveId} : {error: "Missing archiveId"};
  if (hasTask) return valid(taskId) ? {field: "taskId", id: taskId} : {error: "Missing taskId"};
  return {error: "Missing archiveId or taskId"};
}

// The comments list after adding one. `current` is a task's or row's comments (anything; see commentsOf), `comment` is {id, text, at}.
// The new comment goes after the last comment written at or before its `at`, so the list stays in the order written even when a
// comment written earlier arrives later. A comment whose id is already there adds nothing, so a repeat after a lost reply is harmless.
// Returns {comments, added: true}, {comments, added: false} for a repeated id (the list as it was), or {error} (text for the owner)
// for an unusable id, text or time, or a list that is full.
function addComment(current, comment) {
  const list = commentsOf({comments: current});
  const given = comment && typeof comment === "object" ? comment : {};
  const id = normalizeCommentId(given.id);
  if (!id) return {error: "A comment id must be 8 to 64 letters, digits, - or _"};
  const text = normalizeCommentText(given.text);
  if (text === null) return {error: "A comment needs some text"};
  if (!Number.isSafeInteger(given.at) || given.at <= 0) return {error: "A comment needs the time it was written"};
  if (list.some((c) => c.id === id)) return {comments: list, added: false};
  if (list.length >= MAX_COMMENTS) return {error: `A task can hold at most ${MAX_COMMENTS} comments`};
  let index = list.length;
  while (index > 0 && list[index - 1].at > given.at) index--;
  return {comments: [...list.slice(0, index), {id, at: given.at, text}, ...list.slice(index)], added: true};
}

// The comments list after deleting the comment `id`: {comments, removed}, `removed` false when there was no such comment.
function removeComment(current, id) {
  const list = commentsOf({comments: current});
  const next = list.filter((c) => c.id !== id);
  return {comments: next, removed: next.length !== list.length};
}

// `doc` (a task or an archive row) with its comments set to `comments`, the key removed when the list is empty. The input is not modified.
function withComments(doc, comments) {
  const next = {...doc};
  if (Array.isArray(comments) && comments.length > 0) next.comments = comments;
  else delete next.comments;
  return next;
}

module.exports = {MAX_COMMENT_LENGTH, MAX_COMMENTS, normalizeCommentId, normalizeCommentText, commentsOf, commentTarget, addComment, removeComment, withComments};

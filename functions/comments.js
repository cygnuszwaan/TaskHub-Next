/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Task comments: free text the owner writes about a task. Never read or written by the model. Pure: no I/O.

const MAX_COMMENTS_LENGTH = 2000;

// A `comments` value from the client.
//   undefined: the value is unusable (not a string), meaning "no change"
//   null:      no comments (null, or text that is empty once trimmed); the task's field is removed
//   string:    the text, trimmed and cut to 2000 characters
function normalizeComments(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, MAX_COMMENTS_LENGTH).trim();
  return text === "" ? null : text;
}

module.exports = {MAX_COMMENTS_LENGTH, normalizeComments};

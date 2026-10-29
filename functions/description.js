/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Task descriptions: free text the owner writes about a task. Never shown to the model; it writes descriptions only on a new task of a free-text add, on the steps of a suggested project and on the one task of a declined suggestion (see proposal.js). Pure: no I/O.

const MAX_DESCRIPTION_LENGTH = 2000;

// A `description` value from the client.
//   undefined: the value is unusable (not a string), meaning "no change"
//   null:      no description (null, or text that is empty once trimmed); the task's field is removed
//   string:    the text, trimmed and cut to 2000 characters
function normalizeDescription(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, MAX_DESCRIPTION_LENGTH).trim();
  return text === "" ? null : text;
}

module.exports = {MAX_DESCRIPTION_LENGTH, normalizeDescription};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Task descriptions: free text the owner writes about a task. Never shown to the model; it writes descriptions only on the steps of a suggested project (see proposal.js). Pure: no I/O.

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

// The description a client sent in `fields` (an edit's fields, a manual entry, a step): {has, value}, `has` false when it sent none.
// `description` is the field. An older page's `comments`, when it is non-empty text, is read as the description if `description` is
// absent; an empty or null `comments` is ignored, so an older page that sends its empty box with every edit cannot erase a description.
function readDescription(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {has: false};
  if ("description" in fields) return {has: true, value: fields.description};
  if (typeof fields.comments === "string" && fields.comments.trim() !== "") return {has: true, value: fields.comments};
  return {has: false};
}

module.exports = {MAX_DESCRIPTION_LENGTH, normalizeDescription, readDescription};

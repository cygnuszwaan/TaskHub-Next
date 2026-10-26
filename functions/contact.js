/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Contact details on a task: a phone number and an email address of its own, which override the task's client's (see the page's
// `effectiveContact`). Pure: no I/O.

const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A one-line text from the client or the database, whitespace collapsed.
//   undefined: unusable (not text, or longer than `max`), meaning "no change"
//   null:      none (null, or text that is empty once trimmed)
//   string:    the text
function oneLineOrNull(value, max) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  return text.length > max ? undefined : text;
}

// A task's `phone`: one line of at most 40 characters, as typed.
function normalizePhone(value) {
  return oneLineOrNull(value, MAX_PHONE_LENGTH);
}

// A task's `email`: one line of at most 100 characters that looks like an address.
function normalizeEmail(value) {
  const text = oneLineOrNull(value, MAX_EMAIL_LENGTH);
  return typeof text === "string" && !EMAIL_PATTERN.test(text) ? undefined : text;
}

module.exports = {MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, normalizePhone, normalizeEmail};

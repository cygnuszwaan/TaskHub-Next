/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Contact details on a task: a phone number, an email address and a link of its own. The phone and email override the task's client's (see the
// page's `effectiveContact`). Pure: no I/O.

const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 100;
const MAX_URL_LENGTH = 500;
const OTHER_SCHEMES = /^(javascript|data|vbscript|file|blob|about|mailto|tel|sms|ftp):/i;
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

// A task's `url`: one line of at most 500 characters with no spaces, an http or https link with a host. Text with no scheme gets
// `https://` put in front (so "example.com/menu" is stored as "https://example.com/menu"); any other scheme (javascript:, mailto:,
// ftp://, ...) is unusable. A host with a port ("localhost:3000") counts as no scheme.
function normalizeUrl(value) {
  const typed = oneLineOrNull(value, MAX_URL_LENGTH);
  if (typeof typed !== "string") return typed;
  if (/\s/.test(typed)) return undefined;
  let text = typed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    if (OTHER_SCHEMES.test(text) || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return undefined;
    text = `https://${text}`;
  }
  if (text.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" ? text : undefined;
  } catch (err) {
    return undefined;
  }
}

module.exports = {MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, MAX_URL_LENGTH, normalizePhone, normalizeEmail, normalizeUrl};

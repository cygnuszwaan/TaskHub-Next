/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// The time a change was made on the device. A change held offline (see PROJECT.md, "Offline changes") is sent later, so the
// page sends `at`, the epoch milliseconds when the owner made it, and the server books that instant instead of its own clock.
// Pure: the caller passes the server's clock as `now`.

const MAX_ACTION_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// The instant to book for a change: {at} in milliseconds, or {error} (a 400's text) when it is too old.
// A missing, null or unusable `at` (not a whole number of milliseconds) counts as `now`, and one in the future (a device clock
// ahead of the server's) is clamped to `now`, so nothing is ever booked in the future. One more than MAX_ACTION_AGE_MS
// (14 days) before `now` is refused.
function resolveActionTime(at, now) {
  if (!Number.isSafeInteger(at) || at <= 0) return {at: now};
  if (at >= now) return {at: now};
  if (now - at > MAX_ACTION_AGE_MS) return {error: "The change is more than 14 days old and was not applied"};
  return {at};
}

const ARCHIVE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// A usable id for a completed task's archive row when the page makes it (8 to 64 letters, digits, "-" and "_", and not the
// reserved Firestore form "__name__"), else null.
function normalizeArchiveId(value) {
  return typeof value === "string" && ARCHIVE_ID_PATTERN.test(value) && !/^__.*__$/.test(value) ? value : null;
}

module.exports = {MAX_ACTION_AGE_MS, resolveActionTime, normalizeArchiveId};

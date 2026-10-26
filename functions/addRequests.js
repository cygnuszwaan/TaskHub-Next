/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Request ids for adds: the page gives each add it may have to send twice (a retry after a lost reply, or a queued add
// sent once the connection returns) a `requestId`. The newest ids are kept in `settings/addRequests` ({ids}, oldest first)
// and checked and written in the same transaction as the add, so a second attempt with an id already there adds nothing and
// takes no job number.

const MAX_REQUEST_IDS = 200;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// A usable request id (8 to 64 letters, digits, "-" and "_"), else null. Pure.
function normalizeRequestId(value) {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : null;
}

// The ids kept in the document's data, oldest first: only usable, distinct ones, the newest MAX_REQUEST_IDS (a missing or unusable document gives none). Pure.
function requestIdsOf(data) {
  const list = data && Array.isArray(data.ids) ? data.ids : [];
  const seen = new Set();
  const ids = [];
  for (const value of list) {
    const id = normalizeRequestId(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(-MAX_REQUEST_IDS);
}

// Whether `id` was already used for an add, given the document's data. A missing id is never a repeat. Pure.
function isRepeatedRequest(data, id) {
  const usable = normalizeRequestId(id);
  return usable !== null && requestIdsOf(data).includes(usable);
}

// The document's new data after `id` is used: {ids}, the id last, the oldest dropped past MAX_REQUEST_IDS. An unusable id changes nothing. Pure.
function recordRequest(data, id) {
  const ids = requestIdsOf(data);
  const usable = normalizeRequestId(id);
  if (usable === null || ids.includes(usable)) return {ids};
  return {ids: [...ids, usable].slice(-MAX_REQUEST_IDS)};
}

module.exports = {MAX_REQUEST_IDS, normalizeRequestId, requestIdsOf, isRepeatedRequest, recordRequest};

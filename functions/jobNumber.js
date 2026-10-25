/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Job numbers: a strictly sequential serial number given to every new task (1, 2, 3, ...). The last number issued is
// kept in `settings/jobCounter` ({last}) and moves on in the same transaction that creates the task, so a number is
// never issued twice and never reused, even after its task is deleted (a gap is the mark of a removed task).
// Printed as at least 6 digits ("000123"); past 999999 it simply grows a digit.
const JOB_NUMBER_DIGITS = 6;

// A usable job number (a whole number from 1), else null. Pure.
function normalizeJobNumber(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

// The last number issued, from the counter document's data (0 when there is none or it is unusable). Pure.
function lastIssued(data) {
  const last = data && data.last;
  return Number.isSafeInteger(last) && last >= 0 ? last : 0;
}

// "000123" for 123; \"\" when the value is not a usable job number. Pure.
function formatJobNumber(value) {
  const n = normalizeJobNumber(value);
  return n === null ? "" : String(n).padStart(JOB_NUMBER_DIGITS, "0");
}

module.exports = {JOB_NUMBER_DIGITS, normalizeJobNumber, lastIssued, formatJobNumber};

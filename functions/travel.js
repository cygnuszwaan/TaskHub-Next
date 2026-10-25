/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Travel on a task: the kilometres driven for it, billed on job sheets at the travel rate per km (see settings.js).
// Pure: no I/O.

const MAX_TRAVEL_KM = 10000;

// A `travelKm` value from the client or the database.
//   undefined: unusable (not a number or plain decimal text, negative, over MAX_TRAVEL_KM), meaning "no change"
//   null:      no travel (null, text that is empty once trimmed, or a distance that rounds to 0)
//   number:    the kilometres rounded to one decimal (0.1 at least)
function normalizeTravelKm(value) {
  if (value === null) return null;
  let n;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    if (!/^\d{1,6}(\.\d{1,6})?$/.test(text)) return undefined;
    n = Number(text);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n) || n < 0) return undefined;
  const km = Math.round(n * 10) / 10;
  if (km > MAX_TRAVEL_KM) return undefined;
  return km === 0 ? null : km;
}

module.exports = {MAX_TRAVEL_KM, normalizeTravelKm};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Money amounts for invoicing: the hourly rate and the cost of a material. Plain numbers in dollars with at most
// two decimals, no currency symbol and no GST (see PROJECT.md). Pure: no I/O.

const MAX_HOURLY_RATE = 10000;
const MAX_MATERIAL_COST = 1000000;
const MAX_TRAVEL_RATE = 100;

// An amount from the client or the database.
//   undefined: unusable (not a number, negative, over `max`, more text than a plain decimal), meaning "no change"
//   null:      no amount (null, or text that is empty once trimmed)
//   number:    the amount rounded to whole cents; a plain decimal string such as "45.5" is accepted
function normalizeMoney(value, max) {
  if (value === null) return null;
  let n;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) return undefined;
    n = Number(text);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n) || n < 0) return undefined;
  const cents = Math.round(n * 100) / 100;
  return cents > max ? undefined : cents;
}

// The hourly rate: a number from 0.01 to MAX_HOURLY_RATE, or null for none (0 counts as none).
function normalizeHourlyRate(value) {
  const rate = normalizeMoney(value, MAX_HOURLY_RATE);
  return rate === 0 ? null : rate;
}

// The cost of one material: a number from 0 to MAX_MATERIAL_COST (0 is kept: a material that cost nothing), or null.
function normalizeMaterialCost(value) {
  return normalizeMoney(value, MAX_MATERIAL_COST);
}

// The travel rate per kilometre: a number from 0.01 to MAX_TRAVEL_RATE, or null for none (0 counts as none).
function normalizeTravelRate(value) {
  const rate = normalizeMoney(value, MAX_TRAVEL_RATE);
  return rate === 0 ? null : rate;
}

module.exports = {MAX_HOURLY_RATE, MAX_MATERIAL_COST, MAX_TRAVEL_RATE, normalizeMoney, normalizeHourlyRate, normalizeMaterialCost, normalizeTravelRate};

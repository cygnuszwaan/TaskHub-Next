/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Invoice figures for job sheets: labour (time at the hourly rate), materials cost and their total, in whole cents so
// that amounts add up exactly. No GST. Pure: no I/O.

// Dollars as whole cents.
function toCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

// "$1,234.50" for whole cents (NZ dollars; a negative never occurs).
function formatMoney(cents) {
  return new Intl.NumberFormat("en-NZ", {style: "currency", currency: "NZD"}).format(cents / 100).replace(/[\u00a0\u202f]/g, " ");
}

// The rate in dollars when it is usable for billing (a number above 0), else null.
function usableRate(rate) {
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

// The minutes a completed task is billed for: the tracked time to the whole minute (as the sheet shows it), else its
// estimate (marked est. on the sheet), else 0.
function billedMinutes(row) {
  if (Number.isFinite(row.trackedSeconds) && row.trackedSeconds > 0) return Math.round(row.trackedSeconds / 60);
  return Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 0;
}

// What the materials of a row cost, in cents: the items that have a cost, summed; `hasCosts` says whether any has.
function materialsCents(row) {
  let cents = 0;
  let hasCosts = false;
  for (const m of Array.isArray(row.materials) ? row.materials : []) {
    if (m && typeof m === "object" && typeof m.cost === "number" && Number.isFinite(m.cost) && m.cost >= 0) {
      cents += toCents(m.cost);
      hasCosts = true;
    }
  }
  return {cents, hasCosts};
}

// One completed task's figures in cents: {labour, materials, total, hasCosts}. Labour is 0 without a usable rate.
function entryFigures(row, rate) {
  const r = usableRate(rate);
  const labour = r === null ? 0 : Math.round(billedMinutes(row) * toCents(r) / 60);
  const mats = materialsCents(row);
  return {labour, materials: mats.cents, total: labour + mats.cents, hasCosts: mats.hasCosts};
}

// The sum of figures made by entryFigures.
function sumFigures(list) {
  const sum = {labour: 0, materials: 0, total: 0, hasCosts: false};
  for (const f of list) {
    sum.labour += f.labour;
    sum.materials += f.materials;
    sum.total += f.total;
    sum.hasCosts = sum.hasCosts || f.hasCosts;
  }
  return sum;
}

// Whether a sheet shows money at all: a usable rate, or any material with a cost.
function isInvoice(rate, figures) {
  return usableRate(rate) !== null || figures.some((f) => f.hasCosts);
}

// Figures as the sheet prints them: {labour, materials, total} strings. `labour` is "" without a rate and `materials`
// is "" when no material in scope has a cost, so the sheet shows only the lines that mean something.
function figuresText(f, rate) {
  return {
    labour: usableRate(rate) === null ? "" : formatMoney(f.labour),
    materials: f.hasCosts ? formatMoney(f.materials) : "",
    total: formatMoney(f.total),
  };
}

module.exports = {toCents, formatMoney, usableRate, billedMinutes, materialsCents, entryFigures, sumFigures, isInvoice, figuresText};

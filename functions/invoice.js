/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Invoice figures for job sheets: labour (time at the hourly rate), materials cost, travel (km at the travel rate) and their total, in whole cents so
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

// The hourly rate a sheet bills labour at: like usableRate, but 0 counts (a client's $0.00 rate, for unpaid work), else null.
function labourRate(rate) {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0 ? rate : null;
}

// The minutes a completed task is billed for: the tracked time to the whole minute (as the sheet shows it), else its
// estimate (marked est. on the sheet), else 0.
function billedMinutes(row) {
  if (Number.isFinite(row.trackedSeconds) && row.trackedSeconds > 0) return Math.round(row.trackedSeconds / 60);
  return Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? Math.round(row.estimatedMinutes) : 0;
}

// A row's travel in tenths of a kilometre (a whole number, so sums are exact), 0 for none.
function travelTenths(row) {
  return row && typeof row.travelKm === "number" && Number.isFinite(row.travelKm) && row.travelKm > 0 ? Math.round(row.travelKm * 10) : 0;
}

// "12.5 km" for tenths of a kilometre, "" for none.
function travelText(tenths) {
  return tenths > 0 ? `${tenths / 10} km` : "";
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

// One completed task's figures in cents: {labour, materials, travel, travelTenths, total, hasCosts, hasTravel}. Labour is 0 without a
// usable hourly rate; travel is the row's km at the travel rate (0 without a usable one), `travelTenths` its distance in tenths
// of a km whatever the rate, `hasTravel` whether travel is billed (a distance and a usable rate).
function entryFigures(row, rate, travelRate) {
  const r = labourRate(rate);
  const tr = usableRate(travelRate);
  const labour = r === null ? 0 : Math.round(billedMinutes(row) * toCents(r) / 60);
  const mats = materialsCents(row);
  const tenths = travelTenths(row);
  const hasTravel = tr !== null && tenths > 0;
  const travel = hasTravel ? Math.round(tenths * toCents(tr) / 10) : 0;
  return {labour, materials: mats.cents, travel, travelTenths: tenths, total: labour + mats.cents + travel, hasCosts: mats.hasCosts, hasTravel};
}

// The sum of figures made by entryFigures.
function sumFigures(list) {
  const sum = {labour: 0, materials: 0, travel: 0, travelTenths: 0, total: 0, hasCosts: false, hasTravel: false};
  for (const f of list) {
    sum.labour += f.labour;
    sum.materials += f.materials;
    sum.travel += f.travel || 0;
    sum.travelTenths += f.travelTenths || 0;
    sum.total += f.total;
    sum.hasCosts = sum.hasCosts || f.hasCosts;
    sum.hasTravel = sum.hasTravel || f.hasTravel === true;
  }
  return sum;
}

// Whether a sheet shows money at all: a usable hourly rate, any material with a cost, or any billed travel.
function isInvoice(rate, figures) {
  return labourRate(rate) !== null || figures.some((f) => f.hasCosts || f.hasTravel === true);
}

// Figures as the sheet prints them: {labour, materials, travel, travelKm, total} strings. `labour` is "" without a rate, `materials`
// is "" when no material in scope has a cost and `travel` is "" when no travel is billed, so the sheet shows only the lines that mean
// something; `travelKm` is the distance ("12.5 km", "" for none) whether or not it is billed.
function figuresText(f, rate) {
  return {
    labour: labourRate(rate) === null ? "" : formatMoney(f.labour),
    materials: f.hasCosts ? formatMoney(f.materials) : "",
    travel: f.hasTravel === true ? formatMoney(f.travel) : "",
    travelKm: travelText(f.travelTenths || 0),
    total: formatMoney(f.total),
  };
}

module.exports = {toCents, formatMoney, usableRate, labourRate, billedMinutes, travelTenths, travelText, materialsCents, entryFigures, sumFigures, isInvoice, figuresText};

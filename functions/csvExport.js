/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// The completed-work spreadsheet export: a CSV of completed tasks for a date range. Pure: no I/O.

const {toIso} = require("./completed");
const {localDate} = require("./time");
const {materialsCents} = require("./invoice");

// The most rows one CSV carries; a range holding more is refused so the file is never silently cut.
const CSV_MAX_ROWS = 10000;
const COLUMNS = ["Job number", "Task", "Project", "Client", "Completed", "Tracked hours", "Estimated hours", "Materials", "Materials cost"];
const BOM = "\uFEFF";

function isRealDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// The request body {from?, to?}: local dates YYYY-MM-DD, both inclusive, either one empty or missing for no limit on that
// side. Returns {from, to} (empty text for none) or {error}.
function parseCsvRequest(body) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const out = {};
  for (const key of ["from", "to"]) {
    const v = src[key];
    if (v === undefined || v === null || v === "") out[key] = "";
    else if (isRealDate(v)) out[key] = v;
    else return {error: `${key} must be a date as YYYY-MM-DD`};
  }
  if (out.from && out.to && out.from > out.to) return {error: "from must not be after to"};
  return out;
}

// One CSV cell. A cell with a comma, quote or line break is quoted with its quotes doubled.
function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

// A text cell from the owner's data: one starting with = + - @ or a tab/return would be run as a formula by a spreadsheet, so it
// gets a leading apostrophe.
function textCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function hours(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? (seconds / 3600).toFixed(2) : "";
}

// The CSV text (UTF-8 BOM first so Excel reads macrons, CRLF line ends) for completed tasks. Pure.
//   rows:      archive documents (completedAt a Timestamp, Date or ISO text)
//   projects, clients: the current ones, for names
//   timeZone:  the zone "Completed" dates are in
// Oldest first (ties by job number). Columns: job number (plain, no padding), task title, project and client names (empty for
// none or a deleted project), completion date, tracked hours (empty when none was tracked), estimated hours, the materials'
// texts joined with "; ", and the materials' cost in dollars when any item has one.
function buildCompletedCsv({rows, projects, clients, timeZone}) {
  const projectList = Array.isArray(projects) ? projects : [];
  const clientList = Array.isArray(clients) ? clients : [];
  const dated = (Array.isArray(rows) ? rows : []).map((row) => ({row, iso: toIso(row.completedAt)}));
  dated.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : (a.row.jobNumber || 0) - (b.row.jobNumber || 0)));
  const lines = [COLUMNS.map(csvCell).join(",")];
  for (const {row, iso} of dated) {
    const project = projectList.find((p) => p.id === row.projectId) || null;
    const client = project ? clientList.find((c) => c.id === project.clientId) || null : null;
    const costs = materialsCents(row);
    const texts = (Array.isArray(row.materials) ? row.materials : []).filter((m) => m && typeof m.text === "string" && m.text).map((m) => m.text);
    lines.push([
      Number.isInteger(row.jobNumber) ? row.jobNumber : "",
      textCell(row.title),
      textCell(project ? project.name : ""),
      textCell(client ? client.name : ""),
      iso ? localDate(timeZone, new Date(iso)) : "",
      hours(row.trackedSeconds),
      Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? (row.estimatedMinutes / 60).toFixed(2) : "",
      textCell(texts.join("; ")),
      costs.hasCosts ? (costs.cents / 100).toFixed(2) : "",
    ].map(csvCell).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

module.exports = {CSV_MAX_ROWS, COLUMNS, BOM, isRealDate, parseCsvRequest, csvCell, textCell, buildCompletedCsv};

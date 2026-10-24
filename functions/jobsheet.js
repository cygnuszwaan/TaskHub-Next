/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {localDate, formatLocalNow, addDays} = require("./time");
const {isArchiveId} = require("./completedEdit");
const {toIso, weekStartOf, minutesOf, summarizeProjectHours} = require("./completed");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Most entries one job sheet lists (the newest); `truncated` says when there were more.
const JOB_SHEET_MAX_ENTRIES = 1000;

// Which job sheet a request body asks for. Pure.
//   {archiveId}                a completed task (the `archiveId` getCompletedTasks gives each entry)
//   {projectId}                a project, to date
//   {projectId, weekStart}     a project's Monday-to-Sunday week; any date in the week names it
// Returns {type: "TASK", archiveId}, {type: "PROJECT", projectId}, {type: "WEEK", projectId, weekStart} (a Monday) or {error}.
function parseJobSheetRequest(body) {
  const b = body && typeof body === "object" ? body : {};
  const has = (v) => v !== undefined && v !== null && v !== "";
  if (has(b.archiveId)) {
    if (has(b.projectId) || has(b.weekStart)) return {error: "Send either archiveId or projectId, not both"};
    if (!isArchiveId(b.archiveId)) return {error: "Unusable archiveId"};
    return {type: "TASK", archiveId: b.archiveId};
  }
  if (!has(b.projectId)) return {error: "Say which task (archiveId) or project (projectId) the job sheet is for"};
  if (typeof b.projectId !== "string" || b.projectId.length > 200) return {error: "Unusable projectId"};
  if (!has(b.weekStart)) return {type: "PROJECT", projectId: b.projectId};
  if (typeof b.weekStart !== "string" || !DATE_ONLY.test(b.weekStart) || new Date(`${b.weekStart}T00:00:00Z`).toISOString().slice(0, 10) !== b.weekStart) {
    return {error: "weekStart must be a date (YYYY-MM-DD)"};
  }
  return {type: "WEEK", projectId: b.projectId, weekStart: weekStartOf(b.weekStart)};
}

// Built from a string: the project's ESLint settings (ES2018) do not know these Unicode property names.
const PICTOGRAPHS = new RegExp("\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\p{Emoji_Modifier}|\\u200d|\\ufe0e|\\ufe0f|\\u20e3", "gu");

// Whether a UTF-16 code unit is a line feed or a printable character (not a C0 or C1 control).
function isPrintable(ch) {
  const c = ch.charCodeAt(0);
  return c === 10 || (c >= 32 && c < 127) || c > 159;
}

// Text for a PDF set in DejaVu Sans: emoji and other pictographs (the font has no colour glyphs, so they print as boxes),
// control characters and non-breaking or narrow spaces are removed or turned into plain spaces; line breaks are kept.
function pdfText(value) {
  return String(value === undefined || value === null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .replace(/[\t\u00a0\u202f\u2007\u2009]/g, " ")
      .replace(PICTOGRAPHS, "")
      .split("").filter(isPrintable).join("")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim();
}

// Minutes in words: "45m", "1h 5m", "2h".
function fmtMinutes(total) {
  const m = Math.round(Number(total) || 0);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}

// Minutes as decimal hours to two places: 200 -> "3.33".
function decimalHours(minutes) {
  return (Math.round((Number(minutes) || 0) / 60 * 100) / 100).toFixed(2);
}

// Hours as a timesheet shows them: "3h 20m (3.33 h)".
function hoursText(minutes) {
  return `${fmtMinutes(minutes)} (${decimalHours(minutes)} h)`;
}

// The time of one completed task: the time tracked on it ("25m", "45s", "1h 5m"), else its estimate marked "est."
// ("30m est."), "-" when it has neither.
function entryTimeText(row) {
  if (Number.isFinite(row.trackedSeconds) && row.trackedSeconds > 0) {
    const seconds = Math.round(row.trackedSeconds);
    return seconds < 60 ? `${seconds}s` : fmtMinutes(seconds / 60);
  }
  return Number.isFinite(row.estimatedMinutes) && row.estimatedMinutes > 0 ? `${fmtMinutes(row.estimatedMinutes)} est.` : "-";
}

// "Tue, 20 Oct, 2:15 pm" for an instant on the zone's clock; "" for an invalid one.
function whenText(timeZone, iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return pdfText(new Intl.DateTimeFormat("en-NZ", {timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"}).format(date));
}

// "19 Oct 2026" for a YYYY-MM-DD date.
function dateText(dateStr) {
  return pdfText(new Intl.DateTimeFormat("en-NZ", {timeZone: "UTC", day: "numeric", month: "short", year: "numeric"}).format(new Date(`${dateStr}T00:00:00Z`)));
}

// "19 Oct - 25 Oct 2026" for the week starting on the given Monday.
function weekRangeText(weekStart) {
  const short = (d) => pdfText(new Intl.DateTimeFormat("en-NZ", {timeZone: "UTC", day: "numeric", month: "short"}).format(new Date(`${d}T00:00:00Z`)));
  const end = addDays(weekStart, 6);
  return `${short(weekStart)} \u2013 ${dateText(end)}`;
}

// One completed task as the sheet lists it.
function sheetEntry(row, timeZone) {
  const tracked = Number.isFinite(row.trackedSeconds) && row.trackedSeconds > 0;
  const text = (v) => (typeof v === "string" ? pdfText(v) : "");
  const list = (v) => (Array.isArray(v) ? v : []).map((x) => text(typeof x === "string" ? x : x && x.text)).filter(Boolean);
  return {
    title: text(row.title) || "Untitled task",
    started: whenText(timeZone, row.firstStartedAt),
    completed: whenText(timeZone, toIso(row.completedAt)),
    timeText: entryTimeText(row),
    estimated: !tracked && minutesOf(row) > 0,
    materials: list(row.materials),
    comments: text(row.comments),
  };
}

function byCompletion(a, b) {
  return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0;
}

// The content of a job sheet, ready to draw. Pure: no I/O, the rows are not modified.
//   request:  what parseJobSheetRequest returned (no `error`)
//   rows:     archive documents (a Task plus completedAt as a Timestamp, Date or ISO string): one row for a TASK sheet,
//             the project's rows for the others (rows of other projects are not expected; any outside the week are
//             left out of a WEEK sheet)
//   project:  the project {id, name} (PROJECT and WEEK sheets), or for a TASK sheet its project, or null
//   timeZone: the owner's zone; every date and time is on its clock
//   now:      the Date of the sheet
//   contractorInfo: the owner's contractor text (settings.jobSheet.contractorInfo), printed under the "Job sheet" title
// Returns {kind, contractorInfo (cleaned by pdfText, "" with none), heading, projectName, period, generatedText, timeZone, totals, sections, truncated, empty}:
//   `heading`: the title of the completed task, or the project's name; `projectName` is null with none (and for a
//   PROJECT or WEEK sheet, whose heading is the project's name); `period`: "" for a TASK sheet;
//   `totals`: null for a TASK sheet, else {count, minutes, estimatedMinutes, text} (the project's figures as the Stats
//   Project hours section computes them: each week rounded to whole minutes, the total the sum of the weeks; `text` like
//   "3h 20m (3.33 h)"); `sections`: [{heading, totals, entries}] oldest first with entries oldest first, a TASK sheet one
//   section without heading or totals, a WEEK sheet one section for the week, a PROJECT sheet one per week with work
//   (heading the week's range, totals its figures); an entry is {title, started, completed, timeText, estimated,
//   materials, comments} (`started`: when its timer was first started, "" when it never was; no priority or tags, the
//   sheet is client-facing); `truncated` is true when only the newest JOB_SHEET_MAX_ENTRIES entries are listed (the totals
//   still cover everything read); `empty` is true when there is nothing to list.
function buildJobSheet({request, rows, project, timeZone, now, contractorInfo}) {
  const kind = request.type;
  const contractor = typeof contractorInfo === "string" ? pdfText(contractorInfo) : "";
  const generatedText = pdfText(formatLocalNow(timeZone, now));
  const projectName = project && typeof project.name === "string" ? pdfText(project.name) : "";
  const stamped = (Array.isArray(rows) ? rows : []).map((row) => ({row, iso: toIso(row && row.completedAt)})).filter((r) => r.row);

  if (kind === "TASK") {
    const entries = stamped.slice(0, 1).map((r) => sheetEntry(r.row, timeZone));
    return {kind, contractorInfo: contractor, heading: entries.length ? entries[0].title : "", projectName: projectName || null, period: "", generatedText, timeZone, totals: null, sections: entries.length ? [{heading: "", totals: null, entries}] : [], truncated: false, empty: entries.length === 0};
  }

  // Group by local week, then take the project's figures from the same code the Stats page uses
  const weeksOf = new Map();
  for (const r of stamped.filter((s) => s.iso)) {
    const weekStart = weekStartOf(localDate(timeZone, new Date(r.iso)));
    if (kind === "WEEK" && weekStart !== request.weekStart) continue;
    if (!weeksOf.has(weekStart)) weeksOf.set(weekStart, []);
    weeksOf.get(weekStart).push(r);
  }
  const inScope = [...weeksOf.values()].flat();
  const hours = summarizeProjectHours(inScope.map((r) => ({...r.row, projectId: project.id})), [{id: project.id, name: projectName}], timeZone)[0];
  const weekTotals = new Map(((hours && hours.weeks) || []).map((w) => [w.weekStart, w]));
  const figures = (w) => ({count: w ? w.count : 0, minutes: w ? w.minutes : 0, estimatedMinutes: w ? w.estimatedMinutes : 0});
  const withText = (t) => ({...t, text: hoursText(t.minutes)});

  // Keep only the newest entries when there are very many
  const keep = new Set(inScope.slice().sort(byCompletion).slice(-JOB_SHEET_MAX_ENTRIES));
  const sections = [...weeksOf.keys()].sort().map((weekStart) => ({
    heading: weekRangeText(weekStart),
    totals: withText(figures(weekTotals.get(weekStart))),
    entries: weeksOf.get(weekStart).filter((r) => keep.has(r)).sort(byCompletion).map((r) => sheetEntry(r.row, timeZone)),
  })).filter((s) => s.entries.length > 0);

  const totals = withText(hours ? {count: hours.count, minutes: hours.minutes, estimatedMinutes: hours.estimatedMinutes} : figures(null));
  const today = localDate(timeZone, now);
  return {
    kind,
    contractorInfo: contractor,
    heading: projectName || "Project",
    projectName: null,
    period: kind === "WEEK" ? weekRangeText(request.weekStart) : `All work to ${dateText(today)}`,
    generatedText,
    timeZone,
    totals,
    sections,
    truncated: inScope.length > keep.size,
    empty: sections.length === 0,
  };
}

module.exports = {JOB_SHEET_MAX_ENTRIES, parseJobSheetRequest, pdfText, fmtMinutes, decimalHours, hoursText, entryTimeText, whenText, dateText, weekRangeText, buildJobSheet};

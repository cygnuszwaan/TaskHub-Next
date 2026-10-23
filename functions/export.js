/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {serializeCompleted} = require("./completed");

const EXPORT_FORMAT = "taskhub-next-export";
const EXPORT_VERSION = 1;
// Most archive rows one export carries (the newest); `completedTruncated` says when the archive held more.
const EXPORT_MAX_ROWS = 10000;

// The data export as one plain-JSON object. Pure: no I/O, the inputs are not modified.
//   tasks:     the active task list
//   projects:  all projects
//   settings:  the settings as the app reads them (defaults filled in, run state included)
//   completed: archive documents (a Task plus completedAt as a Timestamp, Date or ISO string), newest first
//   now:       the Date of the export
// Returns {format, version, exportedAt, tasks, projects, settings, completedTasks, completedTruncated}: `completedTasks`
// has completedAt as an ISO string (see serializeCompleted), and `completedTruncated` is true when `completed` is as
// long as EXPORT_MAX_ROWS, so the archive may hold older entries that were not read.
function buildExport({tasks, projects, settings, completed, now}) {
  const rows = Array.isArray(completed) ? completed : [];
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    tasks: Array.isArray(tasks) ? tasks : [],
    projects: Array.isArray(projects) ? projects : [],
    settings: settings || {},
    completedTasks: serializeCompleted(rows),
    completedTruncated: rows.length >= EXPORT_MAX_ROWS,
  };
}

module.exports = {EXPORT_FORMAT, EXPORT_VERSION, EXPORT_MAX_ROWS, buildExport};

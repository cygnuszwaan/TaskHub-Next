/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Time the scheduler keeps free on purpose: the daily lunch break and the gap between tasks. Pure: no I/O.
const {localDate, localInstant, addDays} = require("./time");

const MINUTE_MS = 60000;

// The lunch break as busy windows [{start, end}] (ISO strings), one for each local day from today to the horizon's
// date, so the scheduler and the validation treat it like any other busy time and Gemini sees it as a busy window.
//   lunch:    {enabled, time "HH:MM", minutes} from the settings
//   timeZone: the owner's IANA zone, which defines days and the clock time
//   now, horizon: Date objects bounding the schedulable range
// A window is cut to [now, horizon] and dropped when nothing of it is left (a lunch already over today, or past the
// horizon). A time the clock skips on a changeover day gives no window for that day. Nothing when disabled or unusable.
function lunchWindows({lunch, timeZone, now, horizon}) {
  if (!lunch || lunch.enabled !== true || typeof lunch.time !== "string") return [];
  const [h, m] = lunch.time.split(":").map(Number);
  const length = Number(lunch.minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(length) || length <= 0) return [];
  const startMin = h * 60 + m;
  const out = [];
  const last = localDate(timeZone, horizon);
  for (let date = localDate(timeZone, now), n = 0; date <= last && n < 400; date = addDays(date, 1), n++) {
    const open = localInstant(timeZone, date, startMin);
    if (!open) continue;
    const startMs = Math.max(open.getTime(), now.getTime());
    const endMs = Math.min(open.getTime() + length * MINUTE_MS, horizon.getTime());
    if (endMs > startMs) out.push({start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString()});
  }
  return out;
}

// `windows` ([{start, end}], ISO strings) widened by `minutes` on both sides, so that nothing else is placed within
// that distance of them. Used for every calendar event and for the tasks the run does not place itself (pinned or
// already scheduled ones), to keep the gap around them. Unusable windows are dropped; with no gap the windows are the same instants.
function padWindows(windows, minutes) {
  const pad = Number.isFinite(minutes) && minutes > 0 ? minutes * MINUTE_MS : 0;
  return (Array.isArray(windows) ? windows : [])
      .map((w) => ({startMs: Date.parse(w && w.start), endMs: Date.parse(w && w.end)}))
      .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs) && w.endMs > w.startMs)
      .map((w) => ({start: new Date(w.startMs - pad).toISOString(), end: new Date(w.endMs + pad).toISOString()}));
}

module.exports = {lunchWindows, padWindows};

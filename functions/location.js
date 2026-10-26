/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// A place a client, project or task is at: a name (an address or label, shown and used for navigation) and, optionally, the
// coordinates the scheduler groups by. Pure: no I/O.

const MAX_LOCATION_NAME_LENGTH = 200;

function isCoordinate(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && value >= -limit && value <= limit;
}

// A `location` from the owner or the database.
//   undefined: unusable (not an object, a name that is not text or is longer than 200 characters, one coordinate without the other,
//              a coordinate that is not a number in range, or coordinates without a name), meaning "no change"
//   null:      none (null, blank text, or an object with no name and no coordinates)
//   object:    {name} or {name, latitude, longitude}, the name one line with its whitespace collapsed; latitude -90..90 and
//              longitude -180..180, both or neither (null counts as absent)
function normalizeLocation(value) {
  if (value === null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : undefined;
  if (value === undefined || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rawName = value.name;
  if (rawName !== undefined && rawName !== null && typeof rawName !== "string") return undefined;
  const name = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim() : "";
  if (name.length > MAX_LOCATION_NAME_LENGTH) return undefined;
  const hasLatitude = value.latitude !== undefined && value.latitude !== null;
  const hasLongitude = value.longitude !== undefined && value.longitude !== null;
  if (hasLatitude !== hasLongitude) return undefined;
  if (!hasLatitude) return name === "" ? null : {name};
  if (!isCoordinate(value.latitude, 90) || !isCoordinate(value.longitude, 180) || name === "") return undefined;
  return {name, latitude: value.latitude, longitude: value.longitude};
}

// Where a task is: the first location that is set of the task's own, its project's and the project's client's, so a change to a client
// reaches every project and task that has not set its own (setting one is the override; clearing it goes back to inheriting). Only
// own locations are stored. Any of the three may be null or missing. Returns {location, source: "task"|"project"|"client", from}, the
// location normalized and `from` the owner's title or name, or null when none of them has one.
function effectiveLocation(task, project, client) {
  const owners = [["task", task, task && task.title], ["project", project, project && project.name], ["client", client, client && client.name]];
  for (const [source, owner, from] of owners) {
    if (!owner || typeof owner !== "object" || owner.location === undefined || owner.location === null) continue;
    const location = normalizeLocation(owner.location);
    if (location) return {location, source, from: typeof from === "string" ? from : ""};
  }
  return null;
}

module.exports = {MAX_LOCATION_NAME_LENGTH, normalizeLocation, effectiveLocation};

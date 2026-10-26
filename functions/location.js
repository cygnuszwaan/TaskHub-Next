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

module.exports = {MAX_LOCATION_NAME_LENGTH, normalizeLocation};

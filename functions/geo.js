/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Distances between places, for the planner's area preference. Pure: no I/O.

const EARTH_RADIUS_KM = 6371.0088;

function isCoordinate(value, limit) {
  return typeof value === "number" && Number.isFinite(value) && value >= -limit && value <= limit;
}

// `point` as {latitude, longitude} (latitude -90..90, longitude -180..180, both numbers), or null when it is not one.
// Extra keys, such as a location's name, are ignored.
function coordsOf(point) {
  if (!point || typeof point !== "object") return null;
  if (!isCoordinate(point.latitude, 90) || !isCoordinate(point.longitude, 180)) return null;
  return {latitude: point.latitude, longitude: point.longitude};
}

const toRadians = (degrees) => degrees * Math.PI / 180;

// The great-circle (haversine) distance in kilometres between two {latitude, longitude} points, or null when either is
// not a usable point.
function distanceKm(a, b) {
  const p = coordsOf(a);
  const q = coordsOf(b);
  if (!p || !q) return null;
  const dLat = toRadians(q.latitude - p.latitude);
  const dLon = toRadians(q.longitude - p.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(p.latitude)) * Math.cos(toRadians(q.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// True when both points are usable and lie within `radiusKm` of each other (the boundary counts). A radius that is not a
// positive number is never the same area.
function sameArea(a, b, radiusKm) {
  if (typeof radiusKm !== "number" || !Number.isFinite(radiusKm) || radiusKm <= 0) return false;
  const km = distanceKm(a, b);
  return km !== null && km <= radiusKm;
}

module.exports = {EARTH_RADIUS_KM, coordsOf, distanceKm, sameArea};

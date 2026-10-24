/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Photos on completed tasks: one document per photo in `completed_photos/{auto-id}`, {archiveId, data, bytes, addedAt},
// kept out of the archive row so the stats scans stay light. This module is pure validation.

// Most decoded bytes one photo may hold (the page shrinks pictures well below this), most photos per completed task.
const MAX_PHOTO_BYTES = 300 * 1024;
const MAX_PHOTOS = 3;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URL = /^data:image\/jpe?g;base64,/i;

// A JPEG starts with FF D8 FF.
function isJpeg(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

// Validate an uploaded picture. Pure.
//   image: a base64 string (a leading "data:image/jpeg;base64," is tolerated, and whitespace ignored)
// Returns {data, bytes}, `data` being the clean base64 and `bytes` the decoded size, or {error} with the reason.
function normalizePhoto(image) {
  if (typeof image !== "string") return {error: "Missing image"};
  const text = image.replace(DATA_URL, "").replace(/\s+/g, "");
  if (text === "") return {error: "Missing image"};
  // Refuse before decoding anything absurdly large: base64 is 4 characters per 3 bytes.
  if (text.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) return {error: `Image is too large (at most ${Math.round(MAX_PHOTO_BYTES / 1024)} KB)`};
  if (text.length % 4 !== 0 || !BASE64.test(text)) return {error: "Image is not valid base64"};
  const buffer = Buffer.from(text, "base64");
  if (!isJpeg(buffer)) return {error: "Image must be a JPEG"};
  if (buffer.length > MAX_PHOTO_BYTES) return {error: `Image is too large (at most ${Math.round(MAX_PHOTO_BYTES / 1024)} KB)`};
  return {data: text, bytes: buffer.length};
}

// Whether a completed task holding `count` photos may take another. Pure.
function canAddPhoto(count) {
  return Number.isInteger(count) && count >= 0 && count < MAX_PHOTOS;
}

// A stored photo document as the endpoints return it: {id, data, bytes, addedAt (ISO)}. Pure.
function serializePhoto(id, doc) {
  const added = doc.addedAt && typeof doc.addedAt.toDate === "function" ? doc.addedAt.toDate() : doc.addedAt;
  const addedAt = added instanceof Date && !Number.isNaN(added.getTime()) ? added.toISOString() : typeof added === "string" ? added : null;
  return {id, data: doc.data, bytes: doc.bytes, addedAt};
}

// Photos oldest first. Pure: the input is not modified.
function sortPhotos(photos) {
  return [...photos].sort((a, b) => String(a.addedAt || "").localeCompare(String(b.addedAt || "")) || String(a.id).localeCompare(String(b.id)));
}

module.exports = {MAX_PHOTO_BYTES, MAX_PHOTOS, normalizePhoto, canAddPhoto, serializePhoto, sortPhotos};

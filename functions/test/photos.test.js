/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PHOTO_BYTES, MAX_PHOTOS, normalizePhoto, canAddPhoto, serializePhoto, sortPhotos} = require("../photos");

const jpeg = (size = 100) => {
  const buffer = Buffer.alloc(size, 7);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
};
const b64 = (size) => jpeg(size).toString("base64");

describe("photos.js", () => {
  describe("normalizePhoto", () => {
    it("accepts a JPEG and reports its decoded size", () => {
      const result = normalizePhoto(b64(100));
      assert.equal(result.bytes, 100);
      assert.equal(result.data, b64(100));
      assert.equal(result.error, undefined);
    });
    it("tolerates a data URL prefix and whitespace", () => {
      const text = b64(100);
      assert.equal(normalizePhoto(`data:image/jpeg;base64,${text}`).data, text);
      assert.equal(normalizePhoto(`${text.slice(0, 20)}\n${text.slice(20)}`).data, text);
    });
    it("rejects a missing or non-string image", () => {
      for (const bad of [undefined, null, 5, {}, "", "   "]) assert.ok(normalizePhoto(bad).error, String(bad));
    });
    it("rejects text that is not base64", () => {
      assert.match(normalizePhoto("not base64!!").error, /base64/);
      assert.match(normalizePhoto("abc").error, /base64/);
    });
    it("rejects data that is not a JPEG", () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");
      assert.match(normalizePhoto(png).error, /JPEG/);
      assert.match(normalizePhoto(Buffer.from("hello world!").toString("base64")).error, /JPEG/);
      assert.match(normalizePhoto(Buffer.from([0xff, 0xd8]).toString("base64")).error, /JPEG/);
    });
    it("accepts exactly the size limit and rejects one byte more", () => {
      assert.equal(normalizePhoto(b64(MAX_PHOTO_BYTES)).bytes, MAX_PHOTO_BYTES);
      assert.match(normalizePhoto(b64(MAX_PHOTO_BYTES + 1)).error, /too large/);
      assert.match(normalizePhoto("A".repeat(5 * MAX_PHOTO_BYTES)).error, /too large/);
    });
  });

  describe("canAddPhoto", () => {
    it("allows up to MAX_PHOTOS", () => {
      assert.equal(MAX_PHOTOS, 3);
      assert.equal(canAddPhoto(0), true);
      assert.equal(canAddPhoto(2), true);
      assert.equal(canAddPhoto(3), false);
      assert.equal(canAddPhoto(4), false);
      assert.equal(canAddPhoto(-1), false);
      assert.equal(canAddPhoto("1"), false);
    });
  });

  describe("serializePhoto and sortPhotos", () => {
    it("turns a stored document into the endpoint shape", () => {
      const at = new Date("2026-10-24T01:02:03Z");
      assert.deepEqual(serializePhoto("a", {archiveId: "x", data: "QQ==", bytes: 1, addedAt: {toDate: () => at}}), {id: "a", data: "QQ==", bytes: 1, addedAt: at.toISOString()});
      assert.equal(serializePhoto("a", {data: "QQ==", bytes: 1, addedAt: at}).addedAt, at.toISOString());
      assert.equal(serializePhoto("a", {data: "QQ==", bytes: 1}).addedAt, null);
    });
    it("sorts oldest first without changing the input", () => {
      const list = [{id: "b", addedAt: "2026-10-24T02:00:00.000Z"}, {id: "a", addedAt: "2026-10-24T01:00:00.000Z"}, {id: "c", addedAt: null}];
      assert.deepEqual(sortPhotos(list).map((p) => p.id), ["c", "a", "b"]);
      assert.deepEqual(list.map((p) => p.id), ["b", "a", "c"]);
    });
  });
});

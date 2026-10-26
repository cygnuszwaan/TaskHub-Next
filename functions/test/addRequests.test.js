/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_REQUEST_IDS, normalizeRequestId, requestIdsOf, isRepeatedRequest, recordRequest} = require("../addRequests");

const id = (n) => `req-${String(n).padStart(6, "0")}`;

describe("addRequests.js", () => {
  describe("normalizeRequestId", () => {
    it("accepts 8 to 64 letters, digits, hyphens and underscores", () => {
      assert.equal(normalizeRequestId("abcd1234"), "abcd1234");
      assert.equal(normalizeRequestId("3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f"), "3f2b8c1e-5d4a-4e7b-9c0d-1a2b3c4d5e6f");
      assert.equal(normalizeRequestId("A_b-C_d-E"), "A_b-C_d-E");
      assert.equal(normalizeRequestId("a".repeat(64)), "a".repeat(64));
    });
    it("rejects anything else", () => {
      for (const v of ["abcd123", "a".repeat(65), "has space1", "slash/abc1", "dot.dot.1", "quote\"abc1", "", undefined, null, 12345678, {}, ["abcd1234"]]) {
        assert.equal(normalizeRequestId(v), null, JSON.stringify(v));
      }
    });
  });

  describe("requestIdsOf", () => {
    it("reads the ids in order, and gives none for a missing or unusable document", () => {
      assert.deepEqual(requestIdsOf({ids: [id(1), id(2)]}), [id(1), id(2)]);
      for (const v of [undefined, null, {}, {ids: "x"}, {ids: null}, "text"]) assert.deepEqual(requestIdsOf(v), []);
    });
    it("drops unusable and repeated entries", () => {
      assert.deepEqual(requestIdsOf({ids: [id(1), "bad", 7, null, id(1), id(2)]}), [id(1), id(2)]);
    });
    it("keeps only the newest ones", () => {
      const ids = Array.from({length: MAX_REQUEST_IDS + 5}, (_, i) => id(i));
      const kept = requestIdsOf({ids});
      assert.equal(kept.length, MAX_REQUEST_IDS);
      assert.equal(kept[0], id(5));
      assert.equal(kept[kept.length - 1], id(MAX_REQUEST_IDS + 4));
    });
  });

  describe("isRepeatedRequest", () => {
    it("is true only for an id already recorded", () => {
      const data = {ids: [id(1), id(2)]};
      assert.equal(isRepeatedRequest(data, id(2)), true);
      assert.equal(isRepeatedRequest(data, id(3)), false);
    });
    it("is never true for a missing or unusable id, or an empty record", () => {
      assert.equal(isRepeatedRequest({ids: [id(1)]}, null), false);
      assert.equal(isRepeatedRequest({ids: [id(1)]}, undefined), false);
      assert.equal(isRepeatedRequest({ids: [id(1)]}, "bad"), false);
      assert.equal(isRepeatedRequest(undefined, id(1)), false);
      assert.equal(isRepeatedRequest({ids: undefined}, id(1)), false);
    });
  });

  describe("recordRequest", () => {
    it("adds the id last and leaves the input alone", () => {
      const data = {ids: [id(1)]};
      assert.deepEqual(recordRequest(data, id(2)), {ids: [id(1), id(2)]});
      assert.deepEqual(data, {ids: [id(1)]});
      assert.deepEqual(recordRequest(undefined, id(1)), {ids: [id(1)]});
    });
    it("does not add an id twice, nor an unusable one", () => {
      assert.deepEqual(recordRequest({ids: [id(1), id(2)]}, id(1)), {ids: [id(1), id(2)]});
      assert.deepEqual(recordRequest({ids: [id(1)]}, "bad"), {ids: [id(1)]});
      assert.deepEqual(recordRequest({ids: [id(1)]}, null), {ids: [id(1)]});
    });
    it("drops the oldest past the limit", () => {
      const full = {ids: Array.from({length: MAX_REQUEST_IDS}, (_, i) => id(i))};
      const next = recordRequest(full, id(9999));
      assert.equal(next.ids.length, MAX_REQUEST_IDS);
      assert.equal(next.ids[0], id(1));
      assert.equal(next.ids[next.ids.length - 1], id(9999));
    });
  });
});

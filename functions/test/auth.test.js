/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {getBearerToken, isOwner, makeOwnerOnly} = require("../auth");

function makeRes() {
  const res = {};
  res.status = (code) => {
    res.code = code;
    return res;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe("auth.js", () => {
  describe("getBearerToken", () => {
    it("extracts the token, ignoring the scheme's case", () => {
      assert.equal(getBearerToken("Bearer abc"), "abc");
      assert.equal(getBearerToken("bearer abc"), "abc");
    });
    it("returns null for other schemes, missing or malformed headers", () => {
      assert.equal(getBearerToken("Basic abc"), null);
      assert.equal(getBearerToken("Bearer"), null);
      assert.equal(getBearerToken("Bearer a b"), null);
      assert.equal(getBearerToken(""), null);
      assert.equal(getBearerToken(undefined), null);
      assert.equal(getBearerToken(42), null);
    });
  });

  describe("isOwner", () => {
    it("matches a verified email case-insensitively, ignoring spaces around the owner", () => {
      assert.equal(isOwner({email: "Me@Example.com", email_verified: true}, " me@example.COM "), true);
    });
    it("rejects an unverified email", () => {
      assert.equal(isOwner({email: "me@example.com", email_verified: false}, "me@example.com"), false);
      assert.equal(isOwner({email: "me@example.com"}, "me@example.com"), false);
    });
    it("rejects a different account", () => {
      assert.equal(isOwner({email: "other@example.com", email_verified: true}, "me@example.com"), false);
    });
    it("matches nobody when the owner is empty or missing", () => {
      assert.equal(isOwner({email: "me@example.com", email_verified: true}, ""), false);
      assert.equal(isOwner({email: "me@example.com", email_verified: true}, "   "), false);
      assert.equal(isOwner({email: "me@example.com", email_verified: true}, undefined), false);
    });
    it("rejects a missing token payload or email", () => {
      assert.equal(isOwner(null, "me@example.com"), false);
      assert.equal(isOwner({email_verified: true}, "me@example.com"), false);
    });
  });

  describe("makeOwnerOnly", () => {
    const verify = async (token) => {
      if (token === "owner") return {email: "me@example.com", email_verified: true};
      if (token === "other") return {email: "other@example.com", email_verified: true};
      throw new Error("invalid token");
    };
    const req = (header) => ({get: (name) => (name === "Authorization" ? header : undefined)});

    it("returns 401 without calling the handler when there is no token", async () => {
      let calls = 0;
      const handler = makeOwnerOnly(verify, () => "me@example.com")(async () => {
        calls++;
      });
      const res = makeRes();
      await handler(req(undefined), res);
      assert.equal(res.code, 401);
      assert.equal(calls, 0);
    });
    it("returns 401 for a token that fails verification", async () => {
      let calls = 0;
      const handler = makeOwnerOnly(verify, () => "me@example.com")(async () => {
        calls++;
      });
      const res = makeRes();
      await handler(req("Bearer junk"), res);
      assert.equal(res.code, 401);
      assert.equal(calls, 0);
    });
    it("returns 403 for a valid sign-in by another account", async () => {
      let calls = 0;
      const handler = makeOwnerOnly(verify, () => "me@example.com")(async () => {
        calls++;
      });
      const res = makeRes();
      await handler(req("Bearer other"), res);
      assert.equal(res.code, 403);
      assert.equal(calls, 0);
    });
    it("returns 403 for everyone when no owner is configured", async () => {
      let calls = 0;
      const handler = makeOwnerOnly(verify, () => "")(async () => {
        calls++;
      });
      const res = makeRes();
      await handler(req("Bearer owner"), res);
      assert.equal(res.code, 403);
      assert.equal(calls, 0);
    });
    it("calls the handler for the owner", async () => {
      let seen = null;
      const handler = makeOwnerOnly(verify, () => "me@example.com")(async (r, s) => {
        seen = {r, s};
      });
      const request = req("Bearer owner");
      const res = makeRes();
      await handler(request, res);
      assert.equal(seen.r, request);
      assert.equal(seen.s, res);
      assert.equal(res.code, undefined);
    });
  });
});

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PUSH_TOKENS, normalizePushToken, normalizePushTokens, addPushToken, removePushTokens, isDeadTokenCode, buildMessage, testPayload, summarizeSend, sendToTokens, publicSettings} = require("../push");

const tok = (n) => `token-${String(n).padStart(3, "0")}:APA91b-abcdefghijklmnop_${n}`;

describe("push.js", () => {
  describe("normalizePushToken", () => {
    it("accepts an FCM-shaped token and trims it", () => {
      assert.equal(normalizePushToken(tok(1)), tok(1));
      assert.equal(normalizePushToken(`  ${tok(1)}\n`), tok(1));
    });
    it("rejects anything else", () => {
      for (const v of [undefined, null, 7, {}, [], "", "short", "has space in it that is long enough", "x".repeat(4097), "bad/slash-but-long-enough-token", `${tok(1)}"`]) {
        assert.equal(normalizePushToken(v), null, String(v));
      }
    });
  });

  describe("normalizePushTokens", () => {
    it("gives an empty list for anything that is not a list", () => {
      for (const v of [undefined, null, "x", 3, {}]) assert.deepEqual(normalizePushTokens(v), []);
    });
    it("drops unusable entries and repeats, keeping the first place", () => {
      assert.deepEqual(normalizePushTokens([tok(1), "bad", tok(2), tok(1), null]), [tok(1), tok(2)]);
    });
    it("keeps only the newest few", () => {
      const list = Array.from({length: MAX_PUSH_TOKENS + 2}, (_, i) => tok(i));
      assert.deepEqual(normalizePushTokens(list), list.slice(2));
    });
    it("does not modify its input", () => {
      const list = [tok(1), "bad"];
      normalizePushTokens(list);
      assert.deepEqual(list, [tok(1), "bad"]);
    });
  });

  describe("addPushToken", () => {
    it("adds at the end", () => {
      assert.deepEqual(addPushToken([tok(1)], tok(2)), {tokens: [tok(1), tok(2)]});
      assert.deepEqual(addPushToken(undefined, tok(1)), {tokens: [tok(1)]});
    });
    it("leaves a token already listed where it is", () => {
      assert.deepEqual(addPushToken([tok(1), tok(2)], tok(1)), {tokens: [tok(1), tok(2)]});
    });
    it("drops the oldest past the limit", () => {
      const full = Array.from({length: MAX_PUSH_TOKENS}, (_, i) => tok(i));
      const r = addPushToken(full, tok(99));
      assert.equal(r.tokens.length, MAX_PUSH_TOKENS);
      assert.equal(r.tokens[0], tok(1));
      assert.equal(r.tokens[MAX_PUSH_TOKENS - 1], tok(99));
    });
    it("returns an error for an unusable token and changes nothing", () => {
      assert.match(addPushToken([tok(1)], "nope").error, /token/);
      assert.equal(addPushToken([tok(1)], undefined).tokens, undefined);
    });
  });

  describe("removePushTokens", () => {
    it("removes the named tokens only", () => {
      assert.deepEqual(removePushTokens([tok(1), tok(2), tok(3)], [tok(2)]), [tok(1), tok(3)]);
      assert.deepEqual(removePushTokens([tok(1)], [null, "x"]), [tok(1)]);
      assert.deepEqual(removePushTokens([tok(1)], undefined), [tok(1)]);
    });
  });

  describe("isDeadTokenCode", () => {
    it("is true only for a token the push service no longer knows", () => {
      assert.equal(isDeadTokenCode("messaging/registration-token-not-registered"), true);
      assert.equal(isDeadTokenCode("messaging/invalid-registration-token"), true);
      assert.equal(isDeadTokenCode("messaging/invalid-argument"), false, "could be a bad payload");
      assert.equal(isDeadTokenCode("messaging/internal-error"), false);
      assert.equal(isDeadTokenCode(undefined), false);
    });
  });

  describe("buildMessage", () => {
    it("is a data-only message with string values, a TTL and high urgency", () => {
      const m = buildMessage(tok(1), {title: "T", body: "B", url: "/x", tag: "t", ttlSeconds: 90});
      assert.deepEqual(m, {token: tok(1), data: {title: "T", body: "B", url: "/x", tag: "t"}, webpush: {headers: {TTL: "90", Urgency: "high"}}});
      assert.equal("notification" in m, false);
    });
    it("defaults the link, tag and TTL", () => {
      const m = buildMessage(tok(1), {title: "T", body: "B"});
      assert.equal(m.data.url, "/");
      assert.equal(m.data.tag, "taskhub");
      assert.equal(m.webpush.headers.TTL, "3600");
    });
    it("turns non-text values into text", () => {
      assert.deepEqual(buildMessage(tok(1), {title: 1, body: 2}).data, {title: "1", body: "2", url: "/", tag: "taskhub"});
    });
  });

  describe("testPayload", () => {
    it("is a short-lived message for the page", () => {
      const p = testPayload();
      assert.ok(p.title && p.body);
      assert.equal(p.url, "/");
      assert.ok(p.ttlSeconds <= 300);
    });
  });

  describe("summarizeSend", () => {
    it("counts sent and failed and lists dead tokens and distinct error codes", () => {
      const tokens = [tok(1), tok(2), tok(3), tok(4)];
      const responses = [
        {success: true},
        {success: false, error: {code: "messaging/registration-token-not-registered"}},
        {success: false, error: {code: "messaging/internal-error"}},
        {success: false, error: {code: "messaging/internal-error"}},
      ];
      assert.deepEqual(summarizeSend(tokens, responses), {sent: 1, failed: 3, dead: [tok(2)], errors: ["messaging/registration-token-not-registered", "messaging/internal-error"]});
    });
    it("counts a missing response or error code as a failure", () => {
      assert.deepEqual(summarizeSend([tok(1), tok(2)], [{success: false}]), {sent: 0, failed: 2, dead: [], errors: ["unknown"]});
      assert.deepEqual(summarizeSend([tok(1)], undefined), {sent: 0, failed: 1, dead: [], errors: ["unknown"]});
    });
  });

  describe("sendToTokens", () => {
    it("sends one message per token through the injected client and summarizes", async () => {
      const calls = [];
      const messaging = {sendEach: async (messages) => {
        calls.push(messages);
        return {responses: [{success: true}, {success: false, error: {code: "messaging/invalid-registration-token"}}]};
      }};
      const r = await sendToTokens(messaging, [tok(1), tok(2)], {title: "T", body: "B"});
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].map((m) => m.token), [tok(1), tok(2)]);
      assert.equal(calls[0][0].data.title, "T");
      assert.deepEqual(r, {sent: 1, failed: 1, dead: [tok(2)], errors: ["messaging/invalid-registration-token"]});
    });
    it("does not call the client when there are no tokens", async () => {
      const messaging = {sendEach: async () => {
        throw new Error("should not be called");
      }};
      assert.deepEqual(await sendToTokens(messaging, [], {title: "T", body: "B"}), {sent: 0, failed: 0, dead: [], errors: []});
    });
    it("lets a failure of the whole call through", async () => {
      const messaging = {sendEach: async () => {
        throw new Error("boom");
      }};
      await assert.rejects(sendToTokens(messaging, [tok(1)], {title: "T", body: "B"}), /boom/);
    });
  });

  describe("publicSettings", () => {
    it("replaces the tokens with a device count", () => {
      const out = publicSettings({timeZone: "Pacific/Auckland", pushTokens: [tok(1), tok(2)]});
      assert.deepEqual(out, {timeZone: "Pacific/Auckland", pushDevices: 2});
      assert.equal("pushTokens" in out, false);
    });
    it("counts none when there are none", () => {
      assert.equal(publicSettings({}).pushDevices, 0);
      assert.equal(publicSettings(undefined).pushDevices, 0);
    });
  });
});

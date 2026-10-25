/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// Push notifications (Firebase Cloud Messaging). Pure apart from the injected messaging client.
// The owner may install the app on a few devices, so the settings document keeps a short list of device tokens.

// Most device tokens kept; registering one more drops the oldest.
const MAX_PUSH_TOKENS = 5;
// FCM registration tokens are about 150 to 200 characters of letters, digits and _ - : . (the bounds are generous).
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 4096;
const TOKEN_PATTERN = /^[A-Za-z0-9_:.-]+$/;
// FCM error codes that mean the token will never work again, so it is dropped from the list.
const DEAD_TOKEN_CODES = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];

// The token as clean text, or null when it cannot be one.
function normalizePushToken(v) {
  if (typeof v !== "string") return null;
  const token = v.trim();
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH || !TOKEN_PATTERN.test(token)) return null;
  return token;
}

// A stored list cleaned: unusable entries and repeats dropped (the first occurrence keeps its place), then only the
// newest MAX_PUSH_TOKENS kept. Anything that is not a list gives an empty one. Pure: returns a new array.
function normalizePushTokens(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const token = normalizePushToken(entry);
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out.slice(-MAX_PUSH_TOKENS);
}

// The list with `token` added at the end. A token already listed stays where it is; past MAX_PUSH_TOKENS the oldest
// goes. Returns {tokens} or {error} for an unusable token.
function addPushToken(list, token) {
  const clean = normalizePushToken(token);
  if (!clean) return {error: "token must be a push registration token"};
  const current = normalizePushTokens(list);
  if (current.includes(clean)) return {tokens: current};
  return {tokens: [...current, clean].slice(-MAX_PUSH_TOKENS)};
}

// The list without any of `remove`. Pure.
function removePushTokens(list, remove) {
  const gone = new Set(Array.isArray(remove) ? remove : []);
  return normalizePushTokens(list).filter((token) => !gone.has(token));
}

function isDeadTokenCode(code) {
  return DEAD_TOKEN_CODES.includes(code);
}

// A data-only FCM message: the service worker (public/sw.js) shows it, so the page needs no messaging code in the
// worker and the text, tag and link are ours. Every data value must be a string. `ttlSeconds` is how long the push
// service holds the message for a device that is off.
function buildMessage(token, {title, body, url = "/", tag = "taskhub", ttlSeconds = 3600}) {
  return {
    token,
    data: {title: String(title), body: String(body), url: String(url), tag: String(tag)},
    webpush: {headers: {TTL: String(ttlSeconds), Urgency: "high"}},
  };
}

// What the test notification says.
function testPayload() {
  return {title: "TaskHub", body: "Notifications are working on this device.", url: "/", tag: "test", ttlSeconds: 120};
}

// Reads the per-message results of messaging.sendEach (one per token, in order) into
// {sent, failed, dead: [tokens to drop], errors: [distinct error codes]}.
function summarizeSend(tokens, responses) {
  const out = {sent: 0, failed: 0, dead: [], errors: []};
  const list = Array.isArray(responses) ? responses : [];
  tokens.forEach((token, i) => {
    const r = list[i];
    if (r && r.success) {
      out.sent++;
      return;
    }
    out.failed++;
    const code = r && r.error && r.error.code ? String(r.error.code) : "unknown";
    if (!out.errors.includes(code)) out.errors.push(code);
    if (isDeadTokenCode(code)) out.dead.push(token);
  });
  return out;
}

// Sends `payload` (see buildMessage) to every token through `messaging` (the Admin SDK's, injected): returns the
// summary above. No tokens means nothing is sent and an all-zero summary; a failure of the whole call throws.
async function sendToTokens(messaging, tokens, payload) {
  if (!tokens.length) return {sent: 0, failed: 0, dead: [], errors: []};
  const batch = await messaging.sendEach(tokens.map((token) => buildMessage(token, payload)));
  return summarizeSend(tokens, batch && batch.responses);
}

// Settings as the page and the export see them: the tokens themselves stay on the server, only their count goes out.
function publicSettings(settings) {
  const {pushTokens, ...rest} = settings || {};
  return {...rest, pushDevices: Array.isArray(pushTokens) ? pushTokens.length : 0};
}

module.exports = {MAX_PUSH_TOKENS, DEAD_TOKEN_CODES, normalizePushToken, normalizePushTokens, addPushToken, removePushTokens, isDeadTokenCode, buildMessage, testPayload, summarizeSend, sendToTokens, publicSettings};

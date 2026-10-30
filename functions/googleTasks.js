/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {OAuth2Client} = require("google-auth-library");

// Google Tasks over its REST API with the owner's OAuth refresh token (a service account cannot see a personal task list).
// Nothing here runs at load: callers build the client from the `GOOGLE_TASKS_OAUTH` secret (see voiceInbox.js for what is read).

const BASE = "https://tasks.googleapis.com/tasks/v1";

// The secret's text, {client_id, client_secret, refresh_token}: the OAuth client and the refresh token the owner granted. Pure.
function oauthSecret({clientId, clientSecret, refreshToken}) {
  return JSON.stringify({client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken});
}

// The parsed secret, or an Error saying what is wrong with it. Pure.
function parseOAuthSecret(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error("GOOGLE_TASKS_OAUTH is not valid JSON");
  }
  for (const key of ["client_id", "client_secret", "refresh_token"]) {
    if (!data || typeof data[key] !== "string" || data[key] === "") throw new Error(`GOOGLE_TASKS_OAUTH has no ${key}`);
  }
  return {clientId: data.client_id, clientSecret: data.client_secret, refreshToken: data.refresh_token};
}

// An OAuth client that signs its calls with the refresh token (and renews the access token itself).
function makeOAuthClient(raw) {
  const {clientId, clientSecret, refreshToken} = parseOAuthSecret(raw);
  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({refresh_token: refreshToken});
  return client;
}

// The calls the voice inbox needs, over any `client` with a `request({url, method, params, data})` that answers `{data}` (an OAuth2Client does).
function makeTasksApi(client) {
  const get = async (url, params) => (await client.request({url: `${BASE}${url}`, params})).data || {};
  return {
    // The owner's task lists, [{id, title}]
    async lists() {
      const out = [];
      let pageToken;
      do {
        const data = await get("/users/@me/lists", {maxResults: 100, pageToken});
        out.push(...(data.items || []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return out;
    },
    // The open items of one list (completed and hidden ones are not asked for)
    async items(listId) {
      const out = [];
      let pageToken;
      do {
        const data = await get(`/lists/${encodeURIComponent(listId)}/tasks`, {maxResults: 100, showCompleted: false, showHidden: false, pageToken});
        out.push(...(data.items || []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return out;
    },
    // Mark one item done, so it leaves the list but stays in Google Tasks as a record of what was added
    async complete(listId, taskId) {
      await client.request({url: `${BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, method: "PATCH", data: {status: "completed"}});
    },
  };
}

module.exports = {oauthSecret, parseOAuthSecret, makeOAuthClient, makeTasksApi};

/* eslint-disable max-len */
/* eslint-disable require-jsdoc */

// One-off: lets TaskHub read and complete the items of your Google Tasks voice inbox list. It asks Google for a refresh token with
// the Tasks scope and writes the `GOOGLE_TASKS_OAUTH` secret's text to a file; you then store it in Secret Manager. Run it again if
// the token is ever revoked or stops working.
//
//   First, in the Google Cloud console for project taskhub-next:
//     APIs & Services > Library: enable "Google Tasks API".
//     OAuth consent screen: make the app External, add yourself as a user, and set its publishing status to "In production"
//       (in "Testing" Google expires the refresh token after 7 days; an unverified app in production only shows a warning).
//     Credentials > Create credentials > OAuth client ID > Application type "Desktop app".
//
//   cd functions
//   export GOOGLE_OAUTH_CLIENT_ID=...  GOOGLE_OAUTH_CLIENT_SECRET=...
//   npm run authorize-tasks                  (prints a link: open it, sign in as the owner, allow; the file is written)
//   firebase functions:secrets:set GOOGLE_TASKS_OAUTH --data-file google-tasks-oauth.json --project taskhub-next
//   rm google-tasks-oauth.json
//
// The secret must exist before the next functions deploy: the scheduled run and "Update now" are bound to it.
const http = require("http");
const fs = require("fs");
const {randomBytes} = require("crypto");
const {OAuth2Client} = require("google-auth-library");
const {INBOX_SCOPE} = require("../voiceInbox");
const {oauthSecret} = require("../googleTasks");

const OUTPUT_FILE = "google-tasks-oauth.json";

async function run({clientId, clientSecret, log = console.log}) {
  if (!clientId || !clientSecret) throw new Error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (see the top of this file)");
  const state = randomBytes(16).toString("hex");
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  const url = client.generateAuthUrl({access_type: "offline", prompt: "consent", scope: [INBOX_SCOPE], state});
  log(`Open this link, sign in as the owner and allow access:\n\n${url}\n`);
  const code = await new Promise((resolve, reject) => {
    server.on("request", (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams;
      if (!params.has("code") && !params.has("error")) return res.writeHead(404).end();
      res.writeHead(200, {"Content-Type": "text/plain"}).end(params.get("code") && params.get("state") === state ? "Done. You can close this tab." : "Not authorized. See the terminal.");
      if (params.get("state") !== state) return reject(new Error("The answer did not carry the state this run asked with; nothing was saved"));
      if (params.get("error")) return reject(new Error(`Google answered: ${params.get("error")}`));
      resolve(params.get("code"));
    });
  }).finally(() => server.close());
  const {tokens} = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google gave no refresh token. Remove TaskHub from https://myaccount.google.com/permissions and run this again");
  fs.writeFileSync(OUTPUT_FILE, oauthSecret({clientId, clientSecret, refreshToken: tokens.refresh_token}), {mode: 0o600});
  log(`Written to ${OUTPUT_FILE}. Now run:\n  firebase functions:secrets:set GOOGLE_TASKS_OAUTH --data-file ${OUTPUT_FILE} --project taskhub-next\nand delete the file.`);
}

if (require.main === module) {
  run({clientId: process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET}).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {run};

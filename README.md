# TaskHub-Next

AI-enhanced to-do list that schedules tasks onto Google Calendar. The working rules, a map of the documentation and the roadmap are in [PROJECT.md](PROJECT.md); the architecture, data model and endpoints are in [docs/](docs/).

Always target the `taskhub-next` Firebase project explicitly. The kids' chore tracker lives in a different project (`screen-time-chore-tracker`) and must never be deployed from here.

## One-time setup

**Firebase console (`taskhub-next`)**

1. Authentication: enable the Google provider. Check `taskhub-next.web.app` and `taskhub-next.firebaseapp.com` are in the authorized domains.
2. Project settings: register a web app (Hosting then serves its config at `/__/firebase/init.json`).

**Secrets**

```sh
firebase functions:secrets:set GEMINI_API_KEY --project taskhub-next
firebase functions:secrets:set GOOGLE_CALENDAR_CREDENTIALS --data-file service-account.json --project taskhub-next
```

`service-account.json` is the key for the calendar service account listed in docs/infrastructure.md. Delete the local copy afterwards.

**Config params** (`functions/.env`, or let the CLI prompt for them on deploy; it saves the answers to `functions/.env.taskhub-next`)

| Param | Value |
|---|---|
| `OWNER_EMAIL` | The Google account allowed to use the app |
| `USER_CALENDAR_ID` | Agent calendar tasks are scheduled onto |
| `USER_PERSONAL_CALENDAR_ID` | Your personal calendar (read-only) |
| `BACKUP_BUCKET` | Cloud Storage bucket for the weekly backup (see below). Leave empty to switch the backup off |

**Voice inbox** (optional to use, but the secret below must exist before you deploy: the minute poll and Update now are bound to it)

Lets you say "Hey Google, add buy fence palings to my tasks" and have it arrive as a task. Gemini can only add to your default Google Tasks list ("My Tasks"), so that is the inbox: TaskHub reads it every minute (and on Update now), adds each item like a typed task and completes it. The task is in your queue about a minute after you say it and goes on the calendar at the next scheduling run. The poll is a Cloud Scheduler job (free for the first three jobs on a billing account, then $0.10 a month).

1. Nothing to create: the inbox is your default Google Tasks list (`VOICE_INBOX_LIST=@default` in `functions/.env.taskhub-next`). Only items added or changed after the first minute the poll runs are taken, so what is already in "My Tasks" is left alone, but from then on anything you add there by hand, by voice or as a Gemini reminder becomes a TaskHub task. To use a list of your own instead, put its title in `VOICE_INBOX_LIST` (you then move items onto it yourself, as Gemini will not).
2. Google Cloud console, project `taskhub-next`: APIs & Services, Library, enable **Google Tasks API**.
3. OAuth consent screen: User type External, add your account as a test user, then **Publish app** so the status is "In production" (in Testing Google expires the refresh token after 7 days; an unverified app in production only shows a warning screen once).
4. Credentials, Create credentials, OAuth client ID, Application type **Desktop app**. Note the client ID and secret.
5. Grant access and store the result:

```sh
cd functions
export GOOGLE_OAUTH_CLIENT_ID=...  GOOGLE_OAUTH_CLIENT_SECRET=...
npm run authorize-tasks     # open the link it prints, sign in as the owner, allow
firebase functions:secrets:set GOOGLE_TASKS_OAUTH --data-file google-tasks-oauth.json --project taskhub-next
rm google-tasks-oauth.json
```

6. Deploy the functions and wait a couple of minutes (the first poll sets the starting time), then say "Hey Google, add test voice task to my tasks". It should appear in the queue within a minute or two (or at once on Update now). If it does not, `npm run logs` and look for `Voice inbox`. Say "tasks" or "to-dos": Gemini treats "list" as a Google Keep list.

**Notifications** (nothing to install; check once)

Push uses Firebase Cloud Messaging, which is on by default in a Firebase project; the functions send as their own service account, so there is no secret. In the Firebase console, Project settings, Cloud Messaging, check that "Firebase Cloud Messaging API (V1)" is enabled. Optionally generate a Web Push certificate there and paste its public key into `CONFIG.vapidKey` in `public/index.html`; empty uses Firebase's default key. Then deploy functions and hosting, open the installed app, and use Settings, Notifications: Turn on notifications, allow the prompt, then Send a test. Each device is switched on separately. If the test returns an error, run `npm run logs`: a permission error means the Cloud Messaging API is disabled for `taskhub-next` or the functions' service account may not send.

**Address autocomplete** (optional; Google Places, billed on the Blaze plan's billing account but well inside its free monthly allowance for one person)

The Location field of the Clients form and of the chosen project suggests street addresses as you type; picking one sets the text and the map position. A client's Location is its address, and is what job sheets print. Without a key both fall back to the town-level Open-Meteo search.

1. In the Google Cloud console, open project `taskhub-next` (APIs & Services, Library) and enable **Places API (New)**. Billing must be linked to the project, which the Blaze plan already does.
2. APIs & Services, Credentials, Create credentials, API key. Under Application restrictions choose Websites and add `https://taskhub-next.web.app/*` and `https://taskhub-next.firebaseapp.com/*`; under API restrictions choose Restrict key and tick only Places API (New).
3. Limit what a stray request could cost: APIs & Services, Places API (New), Quotas & System Limits, and lower the per-day limits for autocomplete and place details requests to a few hundred. Then Billing, Budgets & alerts, and create a budget of a dollar or two with email alerts.
4. Paste the key into `CONFIG.placesApiKey` in `public/index.html` and deploy hosting. A browser key is visible in the page source, which is normal: the website restriction and the quotas are what protect it.

The page asks only for Place Details Essentials fields (address, country and position), which have a free allowance of 10,000 requests a month, and sends one session token per search so Google bills it once. If suggestions show "Address search failed" under the field, the message is Google's own: a blocked-referrer message means step 2's website list does not match the address you opened the page from, and a not-enabled message means step 1.

**Keeping stored client addresses** (one-off, only if your clients have addresses saved from before the Address field was removed)

```
cd functions
gcloud auth application-default login      (once)
npm run migrate-client-addresses            (dry run: prints what it would do)
npm run migrate-client-addresses -- --apply
```

A client with no location gets its old address as its location text (pick the address in the Clients form to add a map position); a client that already has a location keeps it and the dry run lists the address being dropped, so you can copy it elsewhere first. Safe to run again.

**Moving stored comments to descriptions** (one-off, once; run it before deploying the release that adds comments, which no longer reads a text `comments`)

```
cd functions
npm run migrate-comments-to-description            (dry run: prints what it would do)
npm run migrate-comments-to-description -- --apply
```

Every queued task, completed task and project template step with a comments text gets it as its description. A document that already has a different description keeps it and the dry run lists the comments being dropped. Safe to run again.

**Weekly backup** (needs the Blaze plan; a Firestore export is billed like any other storage and reads)

`weeklyBackup` starts a Firestore export of the whole database, photos included, every Sunday at 03:00 Auckland time into `gs://BUCKET/backups/<UTC time>/` and deletes all but the newest 4. Do this once, in Cloud Shell or any terminal signed in with `gcloud`:

```sh
PROJECT=taskhub-next
BUCKET=taskhub-next-backups   # bucket names are global: pick another if taken
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com

gcloud storage buckets create gs://$BUCKET --project $PROJECT --location australia-southeast1
gcloud projects add-iam-policy-binding $PROJECT --member serviceAccount:$SA --role roles/datastore.importExportAdmin
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member serviceAccount:$SA --role roles/storage.admin
```

`SA` is the account the functions run as (the default compute account) unless you changed it. Put `BACKUP_BUCKET=taskhub-next-backups` in `functions/.env` and deploy the functions. To try it at once, run the job from Cloud Scheduler in the Google Cloud console (`firebase-schedule-weeklyBackup-australia-southeast1`), then `gcloud storage ls gs://$BUCKET/backups/`. An error in `npm run logs` (`Weekly backup failed` or `skipped`) means a missing role or bucket name.

`BACKUP_BUCKET` is read when the functions are deployed, so after changing it in `functions/.env` or `functions/.env.taskhub-next` run `firebase deploy --only functions --project taskhub-next` again; running the Cloud Scheduler job before that still uses the old value. The export itself takes a few minutes: check it with `gcloud firestore operations list --project taskhub-next`, and `gcloud storage ls gs://$BUCKET/backups/` lists nothing until it has started writing.

Restore (replaces documents with the same ids; take care, and consider importing into a spare project first):

```sh
gcloud storage ls gs://$BUCKET/backups/
gcloud firestore import gs://$BUCKET/backups/<stamp>/<stamp>.overall_export_metadata --project taskhub-next
```

## Deploy

```sh
cd functions && npm install && npm run lint && npm test && cd ..
firebase deploy --only functions --project taskhub-next
firebase deploy --only hosting --project taskhub-next
```

`npm run lint` runs automatically before the functions deploy (`predeploy` in `firebase.json`), so `npm install` in `functions/` must have been run.

Logs: `cd functions && npm run logs`.

## Install on Android

Open the site in Chrome, then menu → Install app. Remove any old home-screen shortcut first, so there is one icon.

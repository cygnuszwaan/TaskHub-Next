# TaskHub-Next

AI-enhanced to-do list that schedules tasks onto Google Calendar. Architecture, data model and roadmap are in [PROJECT.md](PROJECT.md).

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

`service-account.json` is the key for the calendar service account listed in PROJECT.md. Delete the local copy afterwards.

**Config params** (`functions/.env`, or let the CLI prompt for them on deploy; it saves the answers to `functions/.env.taskhub-next`)

| Param | Value |
|---|---|
| `OWNER_EMAIL` | The Google account allowed to use the app |
| `USER_CALENDAR_ID` | Agent calendar tasks are scheduled onto |
| `USER_PERSONAL_CALENDAR_ID` | Your personal calendar (read-only) |
| `BACKUP_BUCKET` | Cloud Storage bucket for the weekly backup (see below). Leave empty to switch the backup off |

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

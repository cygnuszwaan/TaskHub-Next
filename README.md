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

## Deploy

```sh
cd functions && npm install && npm run lint && npm test && cd ..
firebase deploy --only functions --project taskhub-next
firebase deploy --only hosting --project taskhub-next
```

`npm run lint` runs automatically before the functions deploy (`predeploy` in `firebase.json`), so `npm install` in `functions/` must have been run.

Logs: `cd functions && npm run logs`.

# Stretch goals (unplanned)

Ideas kept in sight, not started and not committed to. Each goal's steps are in order, each fits in one turn and adds tests for any new pure logic.

### Archive scale

1. Only when the archive nears 1000 completions, or a job done rarely drops out of the completed-task search (`getCompletedTemplates` and the History summary each read at most the newest 1000 `completed_tasks` rows; the History project hours also read every archived row of each current project, up to 5000 each, on every load, which the same step can avoid by keeping each project's weekly totals on its own document): add a `jobs/{titleKey}` summary document, one per distinct title (`titleKey` from `templates.js`), `{title, priority, estimatedMinutes, tags, recurrence, projectId, projectOrder, materials, description, completedCount, recentSeconds, lastCompletedAt}`. `completeTask` updates it in the same transaction as the archive write, `undoRemove` rolls it back, and `getCompletedTemplates` reads it instead of scanning the archive (one read per job, no 1000-row cap). Add a one-off backfill from the existing archive and include `jobs` in `exportData`. `completed_tasks` stays one append-only row per completion, since the History tab queries by `completedAt` and the per-completion snapshots depend on it; do not merge a job's completions into one document with an array (unbounded growth against the 1 MiB document limit, a whole-document rewrite per completion, no range queries over elements).

### GST on invoices

Not needed while the owner is not GST registered; prices on job sheets carry no GST until then.

1. Settings: a GST number and rate (15% by default), saved with the Job Sheets settings and validated.
2. Job sheets: rate and material costs entered as GST-exclusive; a sheet prints the subtotal, GST and total, and the GST number in the header; unchanged while no number is set.

### Public multi-user version

Target: one hosted copy that anyone signs into with Google and grants Calendar access through a consent screen, with no CLI, no Firebase project, no API keys and no calendar shared with a service account. Concessions: no Gemini (manual entry only) and one calendar (an app-created "TaskHub" calendar the tasks are written to, plus read-only busy time from the user's main calendar). The pure modules (planner, schedule, recurrence, history, settings and the rest) are user-agnostic and carry over unchanged. Constraints outside the code:
- Every Calendar scope is sensitive, so Google's app verification is required beyond its testing limits; until then users see an "unverified app" warning and at most 100 can authorize. Review can take weeks.
- Cloud Functions need the pay-as-you-go (Blaze) plan on the hosting project; the free quotas still apply.
- Holding other people's calendar tokens and tasks means a privacy policy, deletion on request and care with security.
- A first release can go to a small circle under the 100-user cap, with the warning screen, and verification deferred until it outgrows that.

1. Per-user data: move `tasks`, `projects`, `completed_tasks`, `settings/app` and `settings/lastRemoved` under `users/{uid}/` by giving `makeTaskStore`, `makeProjectStore` and `makeSettingsStore` a uid, threaded through every endpoint; migrate the owner's existing data; the rules stay deny-all.
2. Auth: replace `ownerOnly` with a check that returns the verified uid of any Google account; drop `OWNER_EMAIL`; every endpoint reads and writes only that uid's data.
3. Calendar OAuth: a server-side consent flow (authorization code, offline access) that stores each user's refresh token encrypted, with the key in Secret Manager; `calendar.js` builds its client from the user's token instead of the service account; a revoked or expired token shows a reconnect prompt instead of failing silently. Use the narrowest scopes that work (`calendar.app.created` plus a busy-time read).
4. One calendar: on first connect create the app's own calendar and use it as the agent calendar; read busy time from the user's main calendar only; remove the `USER_CALENDAR_ID` and `USER_PERSONAL_CALENDAR_ID` params.
5. No Gemini: the public build takes manual entry only (hide the free-text parse, skip tag suggestions), and drops `GEMINI_API_KEY` and the `prompts.js` calls.
6. Per-user dispatcher: `autoScheduleDaily` loops over connected users, each with their own schedule, `claimRun` and fingerprint; bounded concurrency and a per-tick user limit keep a tick inside its timeout, and one user's failure never stops the others.
7. Onboarding: a first-run screen after sign-in (Connect Google Calendar, create the calendar, default settings with the time zone taken from the browser), plus Reconnect and Disconnect; nothing to configure outside the page.
8. Data ownership: a delete-my-account endpoint (tasks, archive, settings, stored token revoked with Google, optionally the app calendar), `exportData` scoped to the user, and a privacy policy page on Hosting.
9. Verification pack: homepage and privacy policy pages in `public/`, the scope justification text and a demo script for Google's review; the owner submits it and sets a billing budget alert.

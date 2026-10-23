# TaskHub Next

An AI-enhanced to-do list that turns free-text input into structured tasks and schedules them onto Google Calendar. Single user, based in Whangaparāoa, NZ (Pacific/Auckland).

## Maintaining this document

This file is a snapshot of the project's present state and intended direction. It is not a log.

- Read it at the start of every working session. Treat it as the source of truth, but verify against the code when the two disagree, and fix whichever is wrong.
- Update it in the same turn as any change that affects what it says (architecture, endpoints, config, data model, roadmap).
- Edit in place. Replace outdated statements; never leave a stale line with a correction beside it.
- No history. No "previously", "now fixed", "changed from", dates of changes or changelog entries. When a roadmap step is finished, delete it and update the sections that describe the new reality.
- Keep it short. Prefer one line to a paragraph, and a table to prose where content is tabular. Don't add narrative, rationale essays or duplicated information.
- Keep the roadmap ordered, with the next step first. Every step must be completable in a single turn; split any that aren't.
- Record only what's true now or planned. Unresolved questions go in Open questions and are removed once answered.

## Delivering changes

- End every turn that changes files by supplying a git patch of those changes, `PROJECT.md` updates included. Make it with `git format-patch` so it applies with `git am` from the repo root, with a short imperative commit message.
- Verify the patch applies cleanly to the previous state before delivering it.
- The patch contains only changed files: no `node_modules`, `__MACOSX` or unchanged files.

## Stack

- Firebase project `taskhub-next`. Hosting serves `public/`. Functions are v2 on Node 24, all in australia-southeast1 (set once with `setGlobalOptions` in `index.js`), as is Firestore.
- Calendar access uses service account `task-calendar-agent@gen-lang-client-0299359787.iam.gserviceaccount.com` (it lives in Google Cloud project `gen-lang-client-0299359787`, not `taskhub-next`). It has edit access to the agent calendar (`USER_CALENDAR_ID`) and "Make changes and see all event details" on the owner's personal calendar. The engine must only ever read the personal calendar, never write to it.
- Setup and deploy commands are in `README.md`. `.firebaserc` defaults to `taskhub-next`, and the `deploy` and `logs` scripts in `functions/package.json` pass `--project taskhub-next`.
- Firestore rules: deny-all. Every read and write goes through the functions via the Admin SDK, which bypasses rules.
- A separate app, a kids' chore tracker, lives in its own Firebase project (`screen-time-chore-tracker`). Never deploy to it from this repo; always target `taskhub-next` explicitly (`--project taskhub-next`).
- Frontend: one file, `public/index.html`, vanilla HTML/CSS/JS, no build step. Calls the functions over HTTPS; the functions base URL and SDK URL live in one `CONFIG` block at the top of the script. `apiFetch` throws the server's error text on any non-OK response, so a failed call never replaces the task list. All task-derived text goes through `esc()` before `innerHTML`; list and filter clicks use event delegation on `data-` attributes. Overdue tasks (`dueDate` before today in NZ) sort to the top, most overdue first, then by `order`. Each task row shows an Overdue chip when overdue, a Repeats chip ("Weekly", "Every 2 weeks") when `recurrence` is set, its schedule (`scheduledStart`/`scheduledEnd`, always formatted in NZ time) and a Locked chip when `locked`; all are read-only. The edit modal's due date field has a Clear button that empties it; saving then stores an empty `dueDate`. Its Repeats control (frequency, plus an interval when it repeats) is saved with the other fields as `recurrence`, null for "Does not repeat". A collapsible Recently Completed card loads `getCompletedTasks` each time it opens (and after a completion while open), read-only; above the list it shows the summary (total completed and estimated time, a per-week bar list, priority and tag chips). Its Reschedule button saves the edits, then calls `rescheduleTask` and reports the result in the schedule status line. Plan My Week shows the engine's error text on failure. The page is gated behind Google sign-in (Firebase Auth, JS SDK 12.18.0 from gstatic via dynamic `import()`, web config from Hosting's `/__/firebase/init.json`); `apiFetch` adds the ID token to every call, and a 401 or 403 signs out and returns to the sign-in screen.
- Backend: `functions/index.js` (endpoints and engine), `functions/calendar.js` (event listing, cleanup and busy-window helpers), `functions/auth.js` (owner check for the HTTP endpoints), `functions/schedule.js` (pure validation of Gemini's slots), `functions/tasks.js` (pure merge of model changes and engine results into the task list), `functions/recurrence.js` (pure date arithmetic for the next occurrence of a recurring task), `functions/due.js` (pure overdue check and urgency ordering for the scheduling prompt), `functions/completed.js` (pure limit clamping, serialising of archive documents and the weekly/tag/priority summary), `functions/settings.js` (pure: defaults, field validation, `mergeSettings`, `applySettingsUpdate` and the `isRunDue` check for the auto-run schedule), `functions/store.js` (`makeTaskStore(db)`: `updateTaskList` and `getTasks` over the `tasks/{id}` collection, plus the pure `diffTasks` and `planMigration`; `makeSettingsStore(db)`: `getSettings` and `updateSettings` over `settings/app`) and `functions/time.js` (local date, minutes-of-day, UTC offset, day-start and formatting helpers; every one takes the IANA time zone as its first argument and throws without one). Tests are `node --test` specs in `functions/test/` (`npm test`), covering every module except the endpoints and engine in `index.js`; `calendar.js` and `store.js` are tested against fake clients. `functions/scripts/migrate-tasks.js` is the one-off copy of the old `app_state/todo_doc` array into `tasks/{id}` (run it with `--apply` before deploying this version; the old document is left in place, unused) (dry run by default; `--apply` writes, `--force` allows a non-empty collection; needs Application Default Credentials for `taskhub-next`). Gemini (`@google/genai`, model constant `MODEL_NAME`) for parsing and scheduling. Google Calendar via the `googleapis` service-account JWT. Weather from Open-Meteo.
- Secrets: `GEMINI_API_KEY`, `GOOGLE_CALENDAR_CREDENTIALS` (service-account JSON; bound to every function that touches Calendar, including `completeTask` and `updateTaskDirect`).
- Firebase Auth in `taskhub-next`: the Google provider is enabled and a web app is registered (Hosting serves its config at `/__/firebase/init.json`). Auth users are per project and unrelated to the chore tracker's.
- Config (Firebase params read from `functions/.env` at deploy): `OWNER_EMAIL` (the one Google account allowed to call the endpoints), `USER_CALENDAR_ID` (the agent calendar that tasks are scheduled onto) and `USER_PERSONAL_CALENDAR_ID` (the owner's personal calendar, read-only, used for free/busy).

## Data model

- `tasks/{id}`: one document per active Task, the document id being the task's `id`. Read in `order` rank (sorted in code, so no index).
- `settings/app`: one document of runtime settings, read and written only through `getSettings`/`updateSettings`. Missing or unusable fields fall back to defaults in code (`settings.js`), so the document may be absent.
  - `location {name, latitude, longitude}`: default Whangaparāoa (-36.63, 174.78).
  - `timeZone`: IANA name, default Pacific/Auckland.
  - `schedule {enabled, frequency DAILY|INTERVAL, time "HH:MM", intervalMinutes 15|30|60|120|240}`: default enabled, DAILY at 20:00 (`time` applies to DAILY, `intervalMinutes` to INTERVAL).
  - `lastAutoRunAt` (ISO) and `lastRunFingerprint`: run state, never settable through `updateSettings`.
  - Nothing outside these endpoints reads the settings yet: weather, prompts, the engine, the cron and the frontend still use Pacific/Auckland and Whangaparāoa.
- `completed_tasks/{auto-id}`: a copy of the Task plus `completedAt`. Write-only archive for future analytics.
- Task: `id`, `title`, `priority` (HIGH/MEDIUM/LOW), `dueDate` (YYYY-MM-DD or empty), `estimatedMinutes`, `tags[]`, `status` (PENDING/COMPLETED), `googleCalendarEventId`, `scheduledStart`/`scheduledEnd` (set only while scheduled; ISO 8601 with NZ offset, or YYYY-MM-DD with an exclusive end date for all-day), `locked` (true only while the owner has pinned the task by moving its event to the personal calendar), `recurrence` (optional `{frequency: DAILY|WEEKLY|MONTHLY|YEARLY, interval: 1..365}`; the key is absent for a task that does not repeat; completing the task spawns its next occurrence), `order` (rank from 1, renumbered 1..n whenever tasks are added or reranked; new ids are server-generated UUIDs).

## Endpoints

| Function | Purpose | AI |
|---|---|---|
| `getTasks` | Read the active list | No |
| `addOrUpdateTask` | Free text in; Gemini returns only new or changed tasks (title, priority, dueDate, estimatedMinutes, tags, recurrence, rank), merged server-side. Omitting `recurrence` leaves an existing task's unchanged; frequency NONE removes it. Cannot delete or complete tasks | Yes |
| `updateTaskDirect` | UPDATE or DELETE one task by id; DELETE also removes its calendar events. An UPDATE's `recurrence` is validated (null or frequency NONE removes it, an unusable value is ignored) | No |
| `getCompletedTasks` | Read the newest entries of `completed_tasks`, newest first (`?limit=`, default 50, at most 200), plus `summary` over the last 8 NZ weeks (Monday start, current week included, from up to 1000 archive rows regardless of `limit`): `totalCount`, `totalMinutes`, per-week, per-priority and per-tag `count` and `minutes`, and `truncated` when the window held more rows than were read | No |
| `completeTask` | Archive to `completed_tasks`, remove from the list, remove its calendar events. A recurring task also gets its next occurrence in the same transaction (`completeInList`): same title, priority, estimate, tags and recurrence, the completed task's rank, PENDING, no schedule, and a `dueDate` stepped forward from the old one in whole intervals until it is after today in NZ (finishing early keeps the rhythm, finishing late skips missed occurrences; no due date counts from today; month ends clamp without drifting). The response includes `spawned` (the new task or null) | No |
| `generateWeeklySchedule` | Manual "Plan My Week" | Yes |
| `rescheduleTask` | Replace one task's calendar event (engine run for that task only). 404 for an unknown task, 409 when the task is pinned to the personal calendar | Yes |
| `autoScheduleDaily` | Cron at 20:00 NZ; runs the same engine | Yes |
| `getSettings` | Read `settings/app` with defaults filled in | No |
| `updateSettings` | Body `{settings: {location?, timeZone?, schedule?}}`, any subset of the editable fields, validated (IANA zone, latitude -90..90, longitude -180..180, name 1..100 characters, `HH:MM`, interval from the allowed list) and merged in a transaction; 400 with the reason and nothing saved when a field is invalid | No |

Every HTTP endpoint requires `Authorization: Bearer <Firebase ID token>` for the verified Google account in `OWNER_EMAIL` (`ownerOnly`): 401 for a missing or invalid token, 403 for any other account or when `OWNER_EMAIL` is empty. Revocation takes effect when the current token expires (up to an hour). CORS allows only `https://taskhub-next.web.app` and `https://taskhub-next.firebaseapp.com` (`ALLOWED_ORIGINS`), so localhost is rejected. `autoScheduleDaily` is not HTTP and is unaffected.

Every write to `tasks` is a Firestore transaction (via `updateTaskList` in `store.js`: it reads the whole collection, runs the modification, and writes only the tasks that changed or were removed). `addOrUpdateTask` calls Gemini outside the transaction and merges its changes into the list as stored at commit time: a change naming a task that no longer exists is skipped, and id, status, calendar and schedule fields, and `locked` are never taken from the model. `completeTask` commits the archive write and the list removal together. Calendar cleanup runs after the commit.

Deleting or completing a task removes its calendar events by stored `googleCalendarEventId` and by the `taskId` private extended property on the event, so a task whose stored id was lost still gets cleaned up.

## Scheduling engine (`runScheduleEngine`)

Nothing on the calendar changes until Gemini's slots pass validation. The personal calendar is only ever read.

1. Load tasks. Read the personal calendar's free/busy for the next 7 days.
2. Lock detection: list the events ending after now on the personal calendar that carry the marker "Generated by AI Task Agent", and match each to a task (`matchLockedEvents`: stored `googleCalendarEventId`, then the `taskId` private extended property, then title). A matched task is locked: it is not offered to Gemini, its old events are not deleted, and its event window counts as busy even if the event is marked free. Locks are recomputed on every run, so a lock is released once its event has ended. If either read in this step fails, abort.
3. List the agent calendar's existing app events from the start of today NZ. The events to replace are the stored ids of the unlocked tasks being scheduled plus every event carrying the marker. Collect agent-calendar busy time from opaque events that are not the app's own (events list, not free/busy, so the app's old events don't block rescheduling). Merge it with the personal and locked windows (overlaps combined) and pass Gemini only those time windows, never event titles.
4. Prompt Gemini (`requestSchedule`) with the current NZ time and its real UTC offset (+12:00 or +13:00 depending on daylight saving), today's NZ date, weather, the merged busy windows and the unlocked tasks. Tasks are annotated and ordered by `annotateDue` (`overdue`, `daysUntilDue`; most overdue first, then earliest due, then undated), and the prompt tells Gemini to place overdue tasks first and, where possible, on or before their due date; a missed due date is not a validation failure. Rules: 8:00–19:00 NZ local time, opaque for focus tasks and transparent for quick chores, no outdoor tasks in rain, each task at most once. Skipped when every task is locked.
5. Validate (`validateSchedule`). Any failure, or an empty result, aborts and keeps the old events. Timed slots need an ISO time with offset, a start in the future, an end within 7 days, one NZ day inside 8:00–19:00, no overlap with busy windows or each other. All-day slots (always transparent) need a date from today to the horizon date and skip overlap checks. Each task id must be an unlocked task and appear once.
6. Insert the new events on the agent calendar (all-day events use an exclusive end date). If an insert fails, delete the ones already created and abort.
7. Delete the old events (agent calendar only; already-missing ones are ignored), then save in a transaction onto the list as stored then (`applyScheduleResults`): only the schedule fields of tasks the run read are rewritten, so edits and additions made meanwhile survive, and events created for tasks deleted or completed meanwhile are removed. Each scheduled task gets `googleCalendarEventId`, `scheduledStart` and `scheduledEnd`. Each locked task gets `locked: true`, the personal event's id and its actual start and end. Other tasks have all four fields cleared.

`runScheduleEngine({taskIds})` runs the same steps for a subset: only those tasks are offered to Gemini and have their events replaced (stored id plus events tagged with their `taskId`; orphans are left for full runs), every other app event on the agent calendar counts as busy whatever its transparency, and only the subset's schedule fields are rewritten. Locks are still detected across all tasks. `rescheduleTask` calls it with one id.

The cron and the manual trigger run the full engine and both use `USER_CALENDAR_ID`; neither the frontend nor the request chooses the calendar. All writes go to that calendar only. Busy time marked "free" (transparent) on either calendar does not count as busy, except locked windows. Deleting or completing a locked task never touches its event on the personal calendar.

## Roadmap

Each step fits in one turn. Do them in order unless told otherwise. Each step adds tests for any new pure logic.

Runtime settings design (settings fields are in the Data model): `autoScheduleDaily` becomes a dispatcher that ticks every 15 minutes (the Cloud Scheduler cron is fixed at deploy, and 15 minutes is the finest interval offered) and runs the engine when `isRunDue` says so. DAILY runs once the local time in the configured zone has reached `time` and the last run was not on today's local date. INTERVAL runs when `intervalMinutes` have passed since `lastAutoRunAt` (with a one-minute grace for tick jitter), only between 8:00 and 19:00 local. To protect Gemini quota, an automatic run first computes a fingerprint (the unlocked tasks' scheduling-relevant fields, the merged busy windows, today's local date, the weather summary, and whether any scheduled slot has ended without its task being completed); if it equals `lastRunFingerprint`, the Gemini call and calendar changes are skipped. Manual runs always go through. The 8:00-19:00 window and 7-day horizon stay constants.

1. **Engine and endpoints read settings.** Weather, prompts, `runScheduleEngine` and the endpoints take location and timezone from `settings/app`, replacing the fixed `TIME_ZONE` constant in `index.js` (the default from `settings.js`).
2. **Cron dispatcher.** `autoScheduleDaily` ticks every 15 minutes, applies `isRunDue` and records `lastAutoRunAt`.
3. **Skip unchanged runs.** Pure fingerprint function and the skip logic in automatic runs; stores `lastRunFingerprint`.
4. **Frontend.** Format times in the configured timezone and add a settings control: place search via the Open-Meteo geocoding API called from the browser (fills name, latitude, longitude and timezone), schedule frequency, time or interval, and enabled.
5. **Migration cleanup.** Once the owner confirms the app works on `tasks/{id}`, delete `functions/scripts/migrate-tasks.js`, `planMigration` and its tests, and the unused `app_state/todo_doc` document.

## Open questions

- Is the site served only from `taskhub-next.web.app` and `.firebaseapp.com`? A custom domain would need adding to `ALLOWED_ORIGINS` and to Auth's authorized domains.
- `firebase.json` is gitignored, so Hosting and Functions config aren't tracked. Should it be committed?
- Should the Gemini calls stay, or should some or all of them move to Claude models?

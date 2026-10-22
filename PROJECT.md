# AI Task Agent

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

- Firebase project `taskhub-next`. Hosting serves `public/`. Functions are v2 on Node 24, region us-central1. Firestore is in australia-southeast1.
- Calendar access uses service account `task-calendar-agent@gen-lang-client-0299359787.iam.gserviceaccount.com` (it lives in Google Cloud project `gen-lang-client-0299359787`, not `taskhub-next`). It has edit access to the agent calendar (`USER_CALENDAR_ID`) and "Make changes and see all event details" on the owner's personal calendar. The engine must only ever read the personal calendar, never write to it.
- Setup and deploy commands are in `README.md`. `.firebaserc` defaults to `taskhub-next`, and the `deploy` and `logs` scripts in `functions/package.json` pass `--project taskhub-next`.
- Firestore rules: deny-all. Every read and write goes through the functions via the Admin SDK, which bypasses rules.
- A separate app, a kids' chore tracker, lives in its own Firebase project (`screen-time-chore-tracker`). Never deploy to it from this repo; always target `taskhub-next` explicitly (`--project taskhub-next`).
- Frontend: one file, `public/index.html`, vanilla HTML/CSS/JS, no build step. Calls the functions over HTTPS; the functions base URL and SDK URL live in one `CONFIG` block at the top of the script. `apiFetch` throws the server's error text on any non-OK response, so a failed call never replaces the task list. All task-derived text goes through `esc()` before `innerHTML`; list and filter clicks use event delegation on `data-` attributes. Each task row shows its schedule (`scheduledStart`/`scheduledEnd`, always formatted in NZ time) and a Locked chip when `locked`; both are read-only. Plan My Week shows the engine's error text on failure. The page is gated behind Google sign-in (Firebase Auth, JS SDK 12.18.0 from gstatic via dynamic `import()`, web config from Hosting's `/__/firebase/init.json`); `apiFetch` adds the ID token to every call, and a 401 or 403 signs out and returns to the sign-in screen.
- Backend: `functions/index.js` (endpoints and engine), `functions/calendar.js` (event listing, cleanup and busy-window helpers), `functions/auth.js` (owner check for the HTTP endpoints), `functions/schedule.js` (pure validation of Gemini's slots), `functions/tasks.js` (pure merge of model changes and engine results into the task list) and `functions/time.js` (NZ date/offset helpers). Tests are `node --test` specs in `functions/test/` (`npm test`), covering every module except the endpoints and engine in `index.js`; `calendar.js` is tested against a fake client. Gemini (`@google/genai`, model constant `MODEL_NAME`) for parsing and scheduling. Google Calendar via the `googleapis` service-account JWT. Weather from Open-Meteo.
- Secrets: `GEMINI_API_KEY`, `GOOGLE_CALENDAR_CREDENTIALS` (service-account JSON; bound to every function that touches Calendar, including `completeTask` and `updateTaskDirect`).
- Firebase Auth in `taskhub-next`: the Google provider is enabled and a web app is registered (Hosting serves its config at `/__/firebase/init.json`). Auth users are per project and unrelated to the chore tracker's.
- Config (Firebase params read from `functions/.env` at deploy): `OWNER_EMAIL` (the one Google account allowed to call the endpoints), `USER_CALENDAR_ID` (the agent calendar that tasks are scheduled onto) and `USER_PERSONAL_CALENDAR_ID` (the owner's personal calendar, read-only, used for free/busy).

## Data model

- `app_state/todo_doc`: `{tasks: Task[], updatedAt}`. The whole active list is one array in one document.
- `completed_tasks/{auto-id}`: a copy of the Task plus `completedAt`. Write-only archive for future analytics.
- Task: `id`, `title`, `priority` (HIGH/MEDIUM/LOW), `dueDate` (YYYY-MM-DD or empty), `estimatedMinutes`, `tags[]`, `status` (PENDING/COMPLETED), `googleCalendarEventId`, `scheduledStart`/`scheduledEnd` (set only while scheduled; ISO 8601 with NZ offset, or YYYY-MM-DD with an exclusive end date for all-day), `locked` (true only while the owner has pinned the task by moving its event to the personal calendar), `order` (rank from 1, renumbered 1..n whenever tasks are added or reranked; new ids are server-generated UUIDs).

## Endpoints

| Function | Purpose | AI |
|---|---|---|
| `getTasks` | Read the active list | No |
| `addOrUpdateTask` | Free text in; Gemini returns only new or changed tasks (title, priority, dueDate, estimatedMinutes, tags, rank), merged server-side. Cannot delete or complete tasks | Yes |
| `updateTaskDirect` | UPDATE or DELETE one task by id; DELETE also removes its calendar events | No |
| `completeTask` | Archive to `completed_tasks`, remove from the list, remove its calendar events | No |
| `generateWeeklySchedule` | Manual "Plan My Week" | Yes |
| `autoScheduleDaily` | Cron at 20:00 NZ; runs the same engine | Yes |

Every HTTP endpoint requires `Authorization: Bearer <Firebase ID token>` for the verified Google account in `OWNER_EMAIL` (`ownerOnly`): 401 for a missing or invalid token, 403 for any other account or when `OWNER_EMAIL` is empty. Revocation takes effect when the current token expires (up to an hour). CORS allows only `https://taskhub-next.web.app` and `https://taskhub-next.firebaseapp.com` (`ALLOWED_ORIGINS`), so localhost is rejected. `autoScheduleDaily` is not HTTP and is unaffected.

Every write to `todo_doc` is a Firestore transaction (read, modify, write, via `updateTaskList`). `addOrUpdateTask` calls Gemini outside the transaction and merges its changes into the list as stored at commit time: a change naming a task that no longer exists is skipped, and id, status, calendar and schedule fields, and `locked` are never taken from the model. `completeTask` commits the archive write and the list removal together. Calendar cleanup runs after the commit.

Deleting or completing a task removes its calendar events by stored `googleCalendarEventId` and by the `taskId` private extended property on the event, so a task whose stored id was lost still gets cleaned up.

## Scheduling engine (`runScheduleEngine`)

Nothing on the calendar changes until Gemini's slots pass validation. The personal calendar is only ever read.

1. Load tasks. Read the personal calendar's free/busy for the next 7 days.
2. Lock detection: list the events ending after now on the personal calendar that carry the marker "Generated by AI Task Agent", and match each to a task (`matchLockedEvents`: stored `googleCalendarEventId`, then the `taskId` private extended property, then title). A matched task is locked: it is not offered to Gemini, its old events are not deleted, and its event window counts as busy even if the event is marked free. Locks are recomputed on every run, so a lock is released once its event has ended. If either read in this step fails, abort.
3. List the agent calendar's existing app events (stored ids of unlocked tasks plus every event carrying the marker, from the start of today NZ). Collect agent-calendar busy time from opaque events that are not the app's own (events list, not free/busy, so the app's old events don't block rescheduling). Merge it with the personal and locked windows (overlaps combined) and pass Gemini only those time windows, never event titles.
4. Prompt Gemini (`requestSchedule`) with the current NZ time and its real UTC offset (+12:00 or +13:00 depending on daylight saving), weather, the merged busy windows and the unlocked tasks. Rules: 8:00–19:00 NZ local time, opaque for focus tasks and transparent for quick chores, no outdoor tasks in rain, each task at most once. Skipped when every task is locked.
5. Validate (`validateSchedule`). Any failure, or an empty result, aborts and keeps the old events. Timed slots need an ISO time with offset, a start in the future, an end within 7 days, one NZ day inside 8:00–19:00, no overlap with busy windows or each other. All-day slots (always transparent) need a date from today to the horizon date and skip overlap checks. Each task id must be an unlocked task and appear once.
6. Insert the new events on the agent calendar (all-day events use an exclusive end date). If an insert fails, delete the ones already created and abort.
7. Delete the old events (agent calendar only; already-missing ones are ignored), then save in a transaction onto the list as stored then (`applyScheduleResults`): only the schedule fields of tasks the run read are rewritten, so edits and additions made meanwhile survive, and events created for tasks deleted or completed meanwhile are removed. Each scheduled task gets `googleCalendarEventId`, `scheduledStart` and `scheduledEnd`. Each locked task gets `locked: true`, the personal event's id and its actual start and end. Other tasks have all four fields cleared.

The cron and the manual trigger both use `USER_CALENDAR_ID`; neither the frontend nor the request chooses the calendar. All writes go to that calendar only. Busy time marked "free" (transparent) on either calendar does not count as busy, except locked windows. Deleting or completing a locked task never touches its event on the personal calendar.

## Roadmap

Each step fits in one turn. Do them in order unless told otherwise. Each step adds tests for any new pure logic.

1. **Due dates.** Pass `dueDate` and an overdue flag to the scheduling prompt so earlier and overdue tasks are placed first. In the UI, show an Overdue chip and sort overdue tasks to the top.
2. **Task store module.** Add `functions/store.js` with the same `updateTaskList` interface over a `tasks/{id}` collection (diff-based writes inside a transaction) and a one-off migration script that copies `app_state/todo_doc` into it. Nothing is switched over yet.
3. **Switch to per-task documents.** Point every endpoint and the engine at the store, run the migration, remove the array-document code, and update Data model and Endpoints.
4. **Engine: schedule a subset of tasks.** Let `runScheduleEngine` take task ids. Only those tasks are offered to Gemini and have their old events replaced; every other app event counts as busy.
5. **Reschedule one task.** Add a `rescheduleTask` endpoint and a Reschedule button in the edit modal.
6. **Completed tasks view.** Add a `getCompletedTasks` endpoint and a UI view of recent completions.
7. **Simple analytics.** Add a summary above the completed list: completions per week, by tag and by priority, and estimated minutes completed.
8. **Recurring tasks: data and ingestion.** Add a `recurrence` field (frequency and interval). Gemini extracts it from free text, and the edit modal shows and edits it.
9. **Recurring tasks: spawn the next occurrence.** Completing a recurring task creates the next one, with the next `dueDate`, in the same transaction. The UI shows a recurrence chip.
10. **Configurable location and timezone: backend.** Hold location (name, latitude, longitude) and timezone in config. Use them in weather, prompts, `time.js`, the engine and the cron.
11. **Configurable location and timezone: frontend.** Format times from the configured timezone and add a settings control.

## Open questions

- Is the site served only from `taskhub-next.web.app` and `.firebaseapp.com`? A custom domain would need adding to `ALLOWED_ORIGINS` and to Auth's authorized domains.
- `firebase.json` is gitignored, so Hosting and Functions config aren't tracked. Should it be committed?
- Should the Gemini calls stay, or should some or all of them move to Claude models?
